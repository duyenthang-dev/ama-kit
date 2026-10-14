import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, printPlan } from '../args.js';
import { getCloudProvider, supportedClouds } from '../clients/cloud-provider.js';
import { loadProject } from '../config.js';
import { knownSecrets } from '../credentials.js';
import { UsageError } from '../errors.js';
import { resolveRun, stamp, updateManifest } from '../run-layout.js';

export const HELP = `mobile-test — chạy test Android bằng Appium 2 trên device cloud (mặc định BrowserStack)

Cách dùng
  mobile-test run --suite smoke [--issue <PROJ-123> | --run <thư mục>] [--app <file.apk|bs://...>] [--yes] [--dry-run]
  mobile-test upload <file.apk> [--yes] [--dry-run]
  mobile-test check [--dry-run]

run:
  - Upload app (nếu mobile.appPath / --app là file local) rồi mở một session trên một device Android
    (mobile.device.name, mobile.device.platformVersion).
  - Suite "smoke" có sẵn: mở app, chờ màn hình đầu, chụp màn hình, đóng session. Chỉ chứng minh
    đường chính mở được. Suite khác chạy bằng WebdriverIO khi đặt mobile.wdioConfig.
  - Trả session URL, video và screenshot khi có; ghi report/mobile.md vào run của issue.
  - Upload app và mở session tốn phút device cloud: không có --yes thì chỉ in kế hoạch.
    Chỉ thêm --yes sau khi người dùng xác nhận.

Device cloud: mobile.cloud trong config (hỗ trợ: ${supportedClouds().join(', ')}).
Credential: BROWSERSTACK_USERNAME, BROWSERSTACK_ACCESS_KEY.
Mã thoát: 0 xong, 1 lỗi API hoặc test fail, 2 sai cách dùng, 3 thiếu biến môi trường.
`;

export async function run(argv) {
  const { flags, positionals, dryRun, help } = parseArgs(argv, {
    suite: { type: 'string' },
    issue: { type: 'string' },
    run: { type: 'string' },
    app: { type: 'string' },
    yes: { type: 'boolean' },
    config: { type: 'string' },
  });
  if (help) return process.stdout.write(HELP), 0;
  const [sub, arg] = positionals;
  if (!sub) throw new UsageError(`Thiếu lệnh con.\n\n${HELP}`);
  const project = loadProject({ configPath: flags.config });
  const m = project.config.mobile;

  if (sub === 'check') {
    if (dryRun) return printPlan('mobile-test check', ['GET /app-automate/plan.json']), 0;
    const cloud = getCloudProvider(project);
    const p = await cloud.check();
    console.log(`${cloud.name}: gói ${p.plan || '?'}, tối đa ${p.parallelSessions ?? '?'} session song song`);
    return 0;
  }

  if (sub === 'upload') {
    const file = arg || m.appPath;
    if (!file) throw new UsageError('Cần đường dẫn file .apk (hoặc mobile.appPath trong config).');
    const abs = path.resolve(project.root, file);
    if (dryRun) return printPlan('mobile-test upload', [`POST /app-automate/upload với ${abs}`]), 0;
    if (!flags.yes) return console.log(`Sẽ upload ${abs} lên ${m.cloud}. Cần người dùng xác nhận; sau đó chạy lại với --yes.`), 0;
    const res = await getCloudProvider(project).uploadApp(abs);
    console.log(`Đã upload. app: ${res.appUrl}\nCó thể đặt mobile.appPath: ${res.appUrl} để lần sau không upload lại.`);
    return 0;
  }

  if (sub !== 'run') throw new UsageError(`Lệnh con không rõ: "mobile-test ${sub}".\n\n${HELP}`);
  const suite = flags.suite || 'smoke';
  const app = flags.app || m.appPath;
  if (!app) throw new UsageError('Cần app: mobile.appPath trong config hoặc --app <file.apk|bs://...>.');
  const isRemote = /^bs:\/\//.test(app);
  const appFile = isRemote ? null : path.resolve(project.root, app);
  if (appFile && !fs.existsSync(appFile) && !dryRun) throw new UsageError(`Không thấy file app: ${appFile}`);
  const useWdio = !!m.wdioConfig;
  if (suite !== 'smoke' && !useWdio) throw new UsageError(`Suite "${suite}" cần WebdriverIO: đặt mobile.wdioConfig trong config. Suite có sẵn: smoke.`);

  const outDir = flags.run || flags.issue ? path.join(resolveRun(flags.run || flags.issue, project), 'report') : path.resolve('mobile-results', stamp());
  const device = `${m.device?.name || '?'} / Android ${m.device?.platformVersion || '?'}`;
  const plan = [
    appFile ? `Upload ${appFile} lên ${m.cloud}` : `Dùng app đã upload ${app}`,
    `Mở 1 session Appium 2 trên ${device}`,
    useWdio ? `Chạy WebdriverIO: npx wdio run ${m.wdioConfig} --suite ${suite}` : 'Smoke: chờ màn hình đầu, chụp màn hình, đóng session',
    `Ghi ${path.join(outDir, 'mobile.md')}`,
  ];
  if (dryRun) return printPlan(`mobile-test run --suite ${suite}`, plan), 0;
  if (!flags.yes) {
    console.log(`Kế hoạch (tốn phút device cloud):\n${plan.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n\nCần người dùng xác nhận; sau đó chạy lại với --yes.`);
    return 0;
  }

  const cloud = getCloudProvider(project);
  fs.mkdirSync(outDir, { recursive: true });
  const started = new Date();
  const appUrl = appFile ? (await cloud.uploadApp(appFile)).appUrl : app;
  const build = `ama-kit ${flags.issue || path.basename(path.dirname(outDir))} ${started.toISOString().slice(0, 16)}`;

  let result;
  if (useWdio) {
    const code = await runWdio(m.wdioConfig, suite, project.root, { ...cloud.wdioEnv(), AMA_APP: appUrl, AMA_DEVICE: m.device?.name || '', AMA_OS_VERSION: String(m.device?.platformVersion || ''), AMA_BUILD: build }, path.join(outDir, 'mobile.log'), [...cloud.secrets(), ...knownSecrets()]);
    result = { status: code === 0 ? 'passed' : 'failed', reason: code === 0 ? '' : `WebdriverIO thoát với mã ${code}`, details: null, screenshot: null };
  } else {
    result = await builtInSmoke(cloud, { appUrl, device: m.device, platform: m.platform, build, outDir });
  }

  const d = result.details || {};
  const md = [
    `# Kết quả mobile test: ${suite}`,
    '',
    `- **Kết quả:** ${result.status === 'passed' ? 'PASS' : result.status === 'not-run' ? 'CHƯA CHẠY' : 'FAIL'}${result.reason ? ` (${result.reason})` : ''}`,
    `- **Thời điểm:** ${started.toISOString()}`,
    `- **Cloud / device:** ${cloud.name} / ${device}`,
    `- **App:** ${appUrl}`,
    d.publicUrl ? `- **Session:** ${d.publicUrl}` : '- **Session:** không có',
    d.videoUrl ? `- **Video:** ${d.videoUrl}` : '- **Video:** không có',
    result.screenshot ? `- **Screenshot:** ${path.basename(result.screenshot)}` : '- **Screenshot:** không có',
    useWdio ? '- **Log:** mobile.log' : '',
    '',
    'Smoke trên một device chỉ chứng minh đường chính mở được, không thay cho test chức năng.',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');
  fs.writeFileSync(path.join(outDir, 'mobile.md'), md + '\n');
  if (flags.issue || flags.run) updateManifest(path.dirname(outDir), { artifacts: { mobile: 'report/mobile.md' }, mobile: { suite, status: result.status, at: started.toISOString() } });
  console.log(md);
  return result.status === 'passed' ? 0 : 1;
}

async function builtInSmoke(cloud, { appUrl, device, platform, build, outDir }) {
  let session;
  try {
    session = await cloud.startSession({ appUrl, device, platform, buildName: build, sessionName: 'smoke' });
  } catch (e) {
    return { status: 'not-run', reason: `không mở được session: ${String(e.message).split('\n')[0]}`, details: null, screenshot: null };
  }
  let status = 'failed';
  let reason = '';
  let shot = null;
  try {
    const ok = await session.waitForApp();
    const png = await session.screenshot().catch(() => null);
    if (png) {
      shot = path.join(outDir, 'mobile-smoke.png');
      fs.writeFileSync(shot, png);
    }
    status = ok ? 'passed' : 'failed';
    reason = ok ? '' : 'màn hình đầu không xuất hiện trong thời gian chờ';
  } catch (e) {
    reason = String(e.message).split('\n')[0];
  } finally {
    await session.end(status, reason).catch(() => {});
  }
  const details = await session.details().catch(() => null);
  return { status, reason, details, screenshot: shot };
}

function runWdio(config, suite, cwd, extraEnv, logFile, secrets) {
  return new Promise((resolve) => {
    const log = fs.createWriteStream(logFile);
    const scrub = (d) => secrets.filter(Boolean).reduce((s, k) => s.split(k).join('***'), d.toString());
    const child = spawn('npx', ['wdio', 'run', config, '--suite', suite], { cwd, env: { ...process.env, ...extraEnv }, shell: process.platform === 'win32' });
    for (const [stream, out] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on('data', (d) => {
        const s = scrub(d);
        log.write(s);
        out.write(s);
      });
    }
    child.on('close', (code) => (log.end(), resolve(code ?? 1)));
    child.on('error', (e) => (log.write(String(e)), log.end(), resolve(127)));
  });
}
