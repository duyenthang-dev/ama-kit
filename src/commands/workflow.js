import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, printPlan, requireIssueKey } from '../args.js';
import { getCloudProvider } from '../clients/cloud-provider.js';
import { confluenceClient } from '../clients/confluence.js';
import { figmaClient } from '../clients/figma.js';
import { jiraClient } from '../clients/jira.js';
import { findProjectConfig, loadProject } from '../config.js';
import { CREDENTIAL_KEYS, lookupCredential, mask, SECRET_KEYS } from '../credentials.js';
import { UsageError } from '../errors.js';
import { loadRegistry, loadRules } from '../registry.js';
import { kitPath } from '../root.js';
import { latestRun } from '../run-layout.js';

export const HELP = `workflow — quản lý kit: skill, rule, adapter, kiểm tra

Cách dùng
  workflow skills [--json]               Liệt kê skill và workflow trong registry/skills.yml
  workflow rules [--json]                Liệt kê rule (id, scope, trigger)
  workflow adapt cursor --out <thư mục>  Sinh file Cursor từ registry và rule (không gọi API nào)
  workflow validate                      Chạy scripts/validate-governance.js
  workflow init [--dry-run]              Tạo .ama/project.yml từ config/project.example.yml
  workflow doctor [--only jira,confluence,figma,mobile] [--dry-run]
                                         Biến nào đã có (che giá trị) và gọi thử từng API
  workflow status <PROJ-123>             Run nào đã có cho issue và bước tiếp theo

Mã thoát: 0 xong, 1 lỗi API hoặc kiểm tra fail, 2 sai cách dùng, 3 thiếu biến môi trường.
`;

export async function run(argv) {
  const { flags, positionals, dryRun, help } = parseArgs(argv, {
    json: { type: 'boolean' },
    out: { type: 'string' },
    only: { type: 'string' },
    config: { type: 'string' },
  });
  if (help) return process.stdout.write(HELP), 0;
  const [sub, arg] = positionals;

  switch (sub) {
    case 'skills': {
      const { skills } = loadRegistry();
      if (flags.json) return console.log(JSON.stringify(skills, null, 2)), 0;
      for (const s of skills) console.log(`${s.name.padEnd(22)} ${s.description}\n${' '.repeat(23)}trigger: ${(s.triggers || []).join(' · ')}\n${' '.repeat(23)}lệnh: ${s.entrypoint}`);
      return 0;
    }
    case 'rules': {
      const rules = loadRules();
      if (flags.json) return console.log(JSON.stringify(rules.map((r) => r.data), null, 2)), 0;
      for (const r of rules) console.log(`${String(r.data.id).padEnd(26)} ${String(r.data.scope).padEnd(10)} ${r.data.title}`);
      return 0;
    }
    case 'adapt': {
      if (arg !== 'cursor') throw new UsageError('Provider hỗ trợ: cursor. Dùng: workflow adapt cursor --out <thư mục>.');
      if (!flags.out) throw new UsageError('Cần --out <thư mục>.');
      const { adaptCursor } = await import('../../providers/cursor/adapt.js');
      if (dryRun) return printPlan('workflow adapt cursor', [`Đọc registry/skills.yml và rules/*.md`, `Ghi file .mdc vào ${path.resolve(flags.out)}`]), 0;
      const files = adaptCursor({ out: flags.out });
      console.log(`Đã sinh ${files.length} file vào ${path.resolve(flags.out)}:\n${files.map((f) => `  - ${path.relative(process.cwd(), f)}`).join('\n')}`);
      return 0;
    }
    case 'validate': {
      const { validateGovernance, printReport } = await import('../../scripts/validate-governance.js');
      const res = validateGovernance();
      printReport(res);
      return res.errors.length ? 1 : 0;
    }
    case 'init':
      return init(dryRun);
    case 'doctor':
      return doctor({ dryRun, only: flags.only, configPath: flags.config });
    case 'status': {
      const key = requireIssueKey(arg);
      const project = loadProject({ configPath: flags.config });
      const a = latestRun(project, key);
      const c = latestRun(project, key, { kind: 'context' });
      console.log(`context-brief:       ${c ? `${c}${fs.existsSync(path.join(c, 'report', 'context-brief.md')) ? '' : '  (chưa có report/context-brief.md)'}` : 'chưa có'}`);
      console.log(`analyze-requirement: ${a || 'chưa có'}`);
      if (!a) return console.log(`\nBước tiếp: analyze-requirement ${key}`), 0;
      const has = (f) => fs.existsSync(path.join(a, 'report', f));
      const mark = (f) => console.log(`  ${has(f) ? '✔' : '·'} report/${f}`);
      // 1. phân tích (bắt buộc cho QE)
      ['analysis.md', 'ac.json'].forEach(mark);
      if (!has('analysis.md') || !has('ac.json')) return console.log('\nBước tiếp: skill analyze-requirement đọc nguồn rồi viết report/ac.json và report/analysis.md'), 0;
      // 2. QE: không có danh sách cố định; theo report/qe-plan.json do agent lập
      let plan = null;
      try {
        plan = JSON.parse(fs.readFileSync(path.join(a, 'report', 'qe-plan.json'), 'utf8'));
      } catch {}
      if (!plan) return console.log(`\nBước tiếp: skill qe đọc nguồn, lập report/qe-plan.json (chọn artifact cần làm) rồi làm theo; kiểm bằng "qe-workflow ${key}".`), 0;
      console.log(`  ✔ report/qe-plan.json — ${String(plan.rationale || '').split('\n')[0]}`);
      const chosen = (plan.deliverables || []).map((d) => d.file).filter(Boolean);
      chosen.forEach(mark);
      for (const d of plan.skipped || []) console.log(`  – bỏ report/${d.file} — ${d.why || ''}`);
      const todo = chosen.filter((f) => !has(f));
      if (todo.length) console.log(`\nBước tiếp: làm ${todo.join(', ')} theo kế hoạch, rồi "qe-workflow ${key}".`);
      else if (chosen.includes('summary.md')) console.log(`\nBước tiếp: xem trước rồi "jira comment ${key} --file ${path.join(a, 'report', 'summary.md')}" sau khi người dùng xác nhận.`);
      else console.log('\nĐủ theo kế hoạch.');
      return 0;
    }
    default:
      throw new UsageError(`${sub ? `Lệnh con không rõ: "workflow ${sub}".` : 'Thiếu lệnh con.'}\n\n${HELP}`);
  }
}

function init(dryRun) {
  const target = path.join(process.cwd(), '.ama', 'project.yml');
  const gi = path.join(process.cwd(), '.gitignore');
  if (dryRun) return printPlan('workflow init', [`Chép config/project.example.yml → ${target} (nếu chưa có)`, `Thêm "runs/" vào ${gi}`]), 0;
  if (fs.existsSync(target)) console.log(`Đã có ${target}, giữ nguyên.`);
  else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(kitPath('config', 'project.example.yml'), target);
    console.log(`Đã tạo ${target}. Điền project.key, jira.site, figma.fileKey, figma.frames, mobile.* (không điền token).`);
  }
  const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!cur.split(/\r?\n/).includes('runs/')) {
    fs.appendFileSync(gi, (cur && !cur.endsWith('\n') ? '\n' : '') + 'runs/\n');
    console.log(`Đã thêm runs/ vào .gitignore (thư mục run chứa dữ liệu requirement).`);
  }
  return 0;
}

async function doctor({ dryRun, only, configPath }) {
  const major = Number(process.versions.node.split('.')[0]);
  console.log(`Node ${process.versions.node} ${major >= 20 ? '✔' : '✘ (cần >= 20)'}`);
  console.log(`Config dự án: ${findProjectConfig(configPath) || '(chưa có — chạy "workflow init")'}`);
  for (const k of CREDENTIAL_KEYS) {
    const { value, source } = lookupCredential(k);
    console.log(`  ${value ? '✔' : '·'} ${k.padEnd(24)} ${value ? `${SECRET_KEYS.has(k) ? mask(value) : value}  [${source}]` : 'chưa đặt'}`);
  }
  if (dryRun) return printPlan('workflow doctor', ['GET Jira /rest/api/3/myself', 'GET Confluence /wiki/api/v2/spaces?limit=1', 'GET Figma /v1/me', 'GET BrowserStack /app-automate/plan.json']), 0;
  const project = loadProject({ configPath });
  const want = only ? new Set(only.split(',').map((s) => s.trim())) : null;
  const checks = [
    ['jira', 'Jira', async () => `đăng nhập: ${(await jiraClient(project).myself()).displayName}`],
    ['confluence', 'Confluence', async () => (await confluenceClient(project).spaces(), 'gọi được API')],
    ['figma', 'Figma', async () => `đăng nhập: ${(await figmaClient().me()).handle || 'ok'}`],
    ['mobile', 'Device cloud', async () => {
      const c = getCloudProvider(project);
      const p = await c.check();
      return `${c.name}: gói ${p.plan || '?'}, ${p.parallelSessions ?? '?'} session song song`;
    }],
  ];
  let failed = 0;
  console.log('');
  for (const [id, label, fn] of checks) {
    if (want && !want.has(id)) continue;
    try {
      console.log(`  ✔ ${label.padEnd(13)} ${await fn()}`);
    } catch (e) {
      failed++;
      console.log(`  ✘ ${label.padEnd(13)} ${String(e.message).split('\n')[0]}`);
    }
  }
  if (failed) console.log(`\n${failed} kiểm tra lỗi. Dịch vụ không dùng thì bỏ qua (--only).`);
  return failed ? 1 : 0;
}
