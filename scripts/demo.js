#!/usr/bin/env node
// Demo end-to-end trên máy, KHÔNG cần token thật: dựng Jira, Confluence, Figma, BrowserStack giả trên localhost,
// rồi chạy từng lệnh của kit như người dùng thật và kiểm tra kết quả.
//
//   node scripts/demo.js           chạy demo, xóa thư mục tạm khi xong
//   node scripts/demo.js --keep    giữ thư mục tạm để mở xem runs/, report/, ảnh...
//
// Không gửi request nào ra internet. Biến môi trường thật của bạn không được dùng (demo tự đặt giá trị giả).

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = process.argv.includes('--keep');
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...c) => ({ type: 'paragraph', content: c });
const doc = (...c) => ({ version: 1, type: 'doc', content: c });
const linkT = (text, href) => t(text, [{ type: 'link', attrs: { href } }]);

// ---------- dữ liệu mẫu ----------
// DEMO-1 (A): cha DEMO-0, con DEMO-2, chặn DEMO-4, bị DEMO-5 chặn. DEMO-4 liên kết DEMO-9 (vòng 2, không được đọc).
function issueOf(key, base) {
  const common = { status: { name: 'In Progress' }, issuetype: { name: 'Story' }, updated: '2026-10-15T10:00:00.000+0000', issuelinks: [] };
  const blocks = (dir, k) => ({ type: { name: 'Blocks', outward: 'blocks', inward: 'is blocked by' }, [dir]: { key: k, fields: { summary: `${k}` } } });
  const issues = {
    'DEMO-1': {
      names: { customfield_100: 'Acceptance Criteria' },
      fields: {
        ...common,
        summary: 'Đăng nhập bằng email',
        parent: { key: 'DEMO-0', fields: { summary: 'Epic xác thực' } },
        subtasks: [{ key: 'DEMO-2', fields: { summary: 'API đăng nhập' } }],
        issuelinks: [blocks('outwardIssue', 'DEMO-4'), blocks('inwardIssue', 'DEMO-5')],
        description: doc(
          p(t('Người dùng đăng nhập bằng email và mật khẩu. Hỗ trợ: support@demo-company.example, STK test 1234 5678 9012. Spec: '), linkT('Login spec', `${base}/wiki/spaces/ENG/pages/111/Login+Spec`)),
          p({ type: 'inlineCard', attrs: { url: 'https://www.figma.com/design/DEMOFILE/App?node-id=1-2' } })
        ),
        customfield_100: doc({
          type: 'bulletList',
          content: ['Đăng nhập đúng thì vào màn Home', 'Sai mật khẩu thì báo lỗi nhanh', 'Sai 5 lần thì khóa tài khoản'].map((s) => ({ type: 'listItem', content: [p(t(s))] })),
        }),
        attachment: [{ filename: 'flow.pdf', mimeType: 'application/pdf', size: 1200 }],
      },
    },
    'DEMO-0': { fields: { ...common, summary: 'Epic xác thực', description: doc(p(t('Gom các story đăng nhập, đăng ký, quên mật khẩu.'))) } },
    'DEMO-2': { fields: { ...common, summary: 'API đăng nhập', description: doc(p(t('POST /login trả token; sai thì 401.'))) } },
    'DEMO-3': { fields: { ...common, summary: 'UI màn đăng nhập', description: doc(p(t('Dựng màn Login theo Figma.'))) } },
    'DEMO-4': { fields: { ...common, summary: 'Màn Home sau đăng nhập', issuelinks: [blocks('outwardIssue', 'DEMO-9')], description: doc(p(t('Hiện tên người dùng.'))) } },
    'DEMO-5': { fields: { ...common, summary: 'Dịch vụ cấp token', description: doc(p(t('Hợp đồng API: '), linkT('API spec', `${base}/wiki/spaces/ENG/pages/222/API`))) } },
    'DEMO-9': { fields: { ...common, summary: 'Vòng 2 — không được đọc', description: doc(p(t('x'))) } },
  };
  return issues[key] ? { key, ...issues[key] } : null;
}

const pages = {
  111: ['Login Spec', doc({ type: 'heading', attrs: { level: 2 }, content: [t('Quy tắc')] }, p(t('Khóa tài khoản 15 phút sau 5 lần sai. Màn lỗi: https://www.figma.com/design/DEMOFILE/App?node-id=3-4')), { type: 'extension', attrs: { extensionKey: 'jira-chart' } })],
  222: ['API Spec', doc(p(t('POST /login: 200 kèm token; 401 khi sai; 423 khi bị khóa.')))],
};

const requests = [];
function route(req, url, body, base) {
  const pth = url.pathname;
  if (pth.startsWith('/img/')) return { raw: PNG };
  let m;
  if ((m = pth.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)$/))) return issueOf(m[1], base) ? [200, issueOf(m[1], base)] : null;
  if ((m = pth.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)\/remotelink$/))) return [200, m[1] === 'DEMO-1' ? [{ object: { url: `${base}/wiki/spaces/ENG/pages/111/Login+Spec`, title: 'Login spec' } }] : []];
  if (pth === '/rest/api/3/search/jql') return [200, { issues: [{ key: 'DEMO-2', fields: { summary: 'API đăng nhập' } }, { key: 'DEMO-3', fields: { summary: 'UI màn đăng nhập' } }] }];
  if (pth === '/rest/api/3/issue/DEMO-1/comment') return [201, { id: '10001' }];
  if (pth === '/rest/api/3/myself') return [200, { displayName: 'Demo QA' }];
  if (pth === '/wiki/api/v2/spaces') return [200, { results: [] }];
  if ((m = pth.match(/^\/wiki\/api\/v2\/pages\/(\d+)$/)) && pages[m[1]]) {
    const [title, body] = pages[m[1]];
    return [200, { id: m[1], title, version: { number: 3 }, _links: { base: `${base}/wiki`, webui: `/spaces/ENG/pages/${m[1]}` }, body: { atlas_doc_format: { value: JSON.stringify(body) } } }];
  }
  if (pth === '/v1/me') return [200, { handle: 'demo' }];
  if (pth === '/v1/files/DEMOFILE/nodes') {
    const names = { '1:2': 'Login', '3:4': 'Login error', '5:6': 'Home' };
    return [200, { version: '42', nodes: Object.fromEntries(url.searchParams.get('ids').split(',').map((i) => [i, names[i] ? { document: { name: names[i], type: 'FRAME' } } : null])) }];
  }
  if (pth === '/v1/images/DEMOFILE') return [200, { images: Object.fromEntries(url.searchParams.get('ids').split(',').map((i) => [i, `${base}/img/${encodeURIComponent(i)}.png?sig=demo`])) }];
  if (pth === '/app-automate/plan.json') return [200, { automate_plan: 'Demo', parallel_sessions_max_allowed: 1 }];
  if (pth === '/app-automate/upload') return [200, { app_url: 'bs://demo-app' }];
  if (pth === '/wd/hub/session') return [200, { value: { sessionId: 's1' } }];
  if (pth === '/wd/hub/session/s1/element') return [200, { value: { 'element-6066-11e4-a52e-4f735466cecf': 'e1' } }];
  if (pth === '/wd/hub/session/s1/screenshot') return [200, { value: PNG.toString('base64') }];
  if (pth === '/wd/hub/session/s1') return [200, { value: null }];
  if (pth === '/app-automate/sessions/s1.json') return [200, req.method === 'PUT' ? {} : { automation_session: { status: 'passed', public_url: 'https://demo.invalid/session/s1', video_url: 'https://demo.invalid/video/s1', device: 'Google Pixel 8', os: 'android', os_version: '14.0' } }];
  return null;
}

// ---------- chạy ----------
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ama-demo-'));
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    requests.push(`${req.method} ${url.pathname}`);
    const r = route(req, url, body, base);
    if (!r) return res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"message":"not found"}');
    if (r.raw) return res.writeHead(200, { 'Content-Type': 'image/png' }).end(r.raw);
    res.writeHead(r[0], { 'Content-Type': 'application/json' }).end(JSON.stringify(r[1]));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

fs.mkdirSync(path.join(work, '.ama'));
fs.writeFileSync(
  path.join(work, '.ama', 'project.yml'),
  ['project:', '  key: DEMO', 'figma:', '  fileKey: DEMOFILE', '  frames:', '    - nodeId: "5:6"', '      name: Home', 'mobile:', '  platform: android', '  appPath: ./app.apk', '  device:', '    name: Google Pixel 8', '    platformVersion: "14.0"', ''].join('\n')
);
fs.writeFileSync(path.join(work, 'app.apk'), 'demo apk');

const env = {
  PATH: process.env.PATH,
  HOME: work,
  AMA_NO_KEYCHAIN: '1',
  ATLASSIAN_SITE: base,
  ATLASSIAN_EMAIL: 'demo@example.com',
  ATLASSIAN_API_TOKEN: 'demo-token-not-real',
  FIGMA_ACCESS_TOKEN: 'demo-figma-not-real',
  FIGMA_API_BASE: base,
  BROWSERSTACK_USERNAME: 'demo',
  BROWSERSTACK_ACCESS_KEY: 'demo-bs-not-real',
  BROWSERSTACK_API_BASE: base,
  BROWSERSTACK_HUB_URL: `${base}/wd/hub`,
};

const run = (cmd, args) =>
  new Promise((resolve) =>
    execFile(process.execPath, [path.join(KIT, 'bin', `${cmd}.js`), ...args], { cwd: work, env }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }))
  );

let failed = 0;
async function step(title, cmd, args, check) {
  const r = await run(cmd, args);
  let problem = null;
  try {
    problem = check(r) || null;
  } catch (e) {
    problem = e.message;
  }
  if (problem) failed++;
  console.log(`${problem ? '✘' : '✔'} ${title}\n    $ ${cmd} ${args.join(' ')}  → mã thoát ${r.code}${problem ? `\n    LỖI: ${problem}\n${indent(r.stdout + r.stderr)}` : ''}`);
  return r;
}
const indent = (s) => s.trim().split('\n').slice(0, 15).map((l) => `      | ${l}`).join('\n');
const need = (cond, msg) => (cond ? null : msg);
const latest = (re) => {
  const dir = path.join(work, 'runs');
  const n = fs.readdirSync(dir).filter((x) => re.test(x)).sort().pop();
  return n ? path.join(dir, n) : null;
};
const read = (f) => fs.readFileSync(f, 'utf8');

console.log(`ama-kit demo — server giả ${base}, thư mục làm việc ${work}\n`);

await step('workflow doctor: thấy biến (đã che) và gọi được các API', 'workflow', ['doctor'], (r) => need(r.code === 0 && /dem…eal/.test(r.stdout) && !r.stdout.includes('demo-token-not-real'), 'doctor không qua hoặc in lộ token'));
await step('Cờ --token bị từ chối, không in giá trị', 'jira', ['issue', 'DEMO-1', '--token', 'SHOULD-NOT-PRINT'], (r) => need(r.code === 2 && !(r.stdout + r.stderr).includes('SHOULD-NOT-PRINT'), 'phải trả mã 2 và không in giá trị'));
await step('--dry-run không gọi API', 'analyze-requirement', ['DEMO-1', '--dry-run'], (r) => need(r.code === 0 && /DRY RUN/.test(r.stdout), 'thiếu DRY RUN'));

await step('jira issue: AC nguyên văn + nguồn, email/STK đã che', 'jira', ['issue', 'DEMO-1'], (r) =>
  need(r.code === 0 && /Nguồn: field "Acceptance Criteria"/.test(r.stdout) && /\[ĐÃ CHE:email\]/.test(r.stdout) && !r.stdout.includes('support@demo-company.example') && !r.stdout.includes('1234 5678 9012'), 'Markdown issue chưa đúng')
);
await step('confluence page: Markdown, macro bị bỏ có ghi chú', 'confluence', ['page', `${base}/wiki/spaces/ENG/pages/111/Login+Spec`], (r) => need(r.code === 0 && /## Quy tắc/.test(r.stdout) && /Đã bỏ macro "jira-chart"/.test(r.stdout), 'page chưa đúng'));
await step('figma export: tải PNG frame trong config', 'figma', ['export', '--out', 'figma-out'], (r) => need(r.code === 0 && fs.existsSync(path.join(work, 'figma-out')) && fs.readdirSync(path.join(work, 'figma-out')).some((f) => f.endsWith('.png')), 'không có PNG'));

requests.length = 0;
await step('context-brief: đúng một vòng quanh DEMO-1', 'context-brief', ['DEMO-1'], (r) => {
  const dir = latest(/^DEMO-1-context-/);
  const m = JSON.parse(read(path.join(dir, 'manifest.json')));
  if (requests.some((x) => x.includes('DEMO-9'))) return 'đã đọc DEMO-9 (vòng 2)';
  return need(r.code === 0 && m.issues.length === 6 && m.sources.confluence.length === 2, `issues=${m.issues.length}, pages=${m.sources.confluence.length}`);
});

await step('analyze-requirement: tạo runs/DEMO-1-<thời điểm>/ có issue, page, ảnh', 'analyze-requirement', ['DEMO-1'], (r) => {
  const dir = latest(/^DEMO-1-\d{4}-/);
  const m = JSON.parse(read(path.join(dir, 'manifest.json')));
  return need(r.code === 0 && m.sources.confluence.length === 1 && m.sources.figma.length === 3 && !JSON.stringify(m).includes('sig=demo'), `pages=${m.sources.confluence.length}, frames=${m.sources.figma.length}`);
});

// Phần skill (Claude) sẽ viết: ac.json và test-cases.json. Demo viết sẵn để kiểm tra phần CLI.
const runDir = latest(/^DEMO-1-\d{4}-/);
const report = path.join(runDir, 'report');
fs.writeFileSync(
  path.join(report, 'ac.json'),
  JSON.stringify({
    issueKey: 'DEMO-1',
    acceptanceCriteria: [
      { id: 'AC-1', original: 'Đăng nhập đúng thì vào màn Home', source: 'jira', sourceRef: 'customfield_100', quality: 'testable', moscow: 'must', testLevel: 'e2e', figmaNodes: ['1:2', '5:6'] },
      { id: 'AC-2', original: 'Sai mật khẩu thì báo lỗi nhanh', source: 'jira', sourceRef: 'customfield_100', quality: 'ambiguous', issues: ['"nhanh" không có số'], moscow: 'must', testLevel: 'integration', figmaNodes: ['3:4'] },
      { id: 'AC-3', original: 'Sai 5 lần thì khóa tài khoản', source: 'jira', sourceRef: 'customfield_100', quality: 'ambiguous', issues: ['khóa bao lâu? page nói 15 phút'], moscow: 'must', testLevel: 'unit' },
    ],
    gaps: [{ id: 'GAP-1', description: 'Thời gian khóa chỉ có trên Confluence', sources: ['jira', 'confluence'], severity: 'medium' }],
    questions: [{ id: 'Q-1', question: 'Báo lỗi trong tối đa bao nhiêu giây?', relatesTo: ['AC-2'], priority: 'high' }],
  })
);
fs.writeFileSync(
  path.join(report, 'test-cases.json'),
  JSON.stringify({
    issueKey: 'DEMO-1',
    testCases: [
      { id: 'TC-1', title: 'Đăng nhập hợp lệ vào Home', acIds: ['AC-1'], level: 'e2e', priority: 'P1', data: 'factory user', steps: ['Mở app', 'Nhập email, mật khẩu đúng', 'Bấm Đăng nhập'], expected: ['Màn Home'], figmaNodes: ['5:6'] },
      { id: 'TC-2', title: 'Sai mật khẩu trả 401 và thông báo', acIds: ['AC-2'], level: 'integration', priority: 'P1', steps: ['POST /login sai mật khẩu'], expected: '401' },
      { id: 'TC-3', title: 'Lần sai thứ 5 khóa tài khoản', acIds: ['AC-3'], level: 'unit', type: 'boundary', priority: 'P1', steps: ['Sai 4 lần', 'Sai lần 5'], expected: ['Bị khóa 15 phút'] },
    ],
  })
);
await step('qe-workflow: kiểm schema, sinh hai ma trận truy vết', 'qe-workflow', ['DEMO-1'], (r) =>
  need(r.code === 0 && fs.existsSync(path.join(report, 'traceability-objectives.md')) && /Độ phủ: 3\/3/.test(read(path.join(report, 'traceability-tests.md'))), 'ma trận chưa đúng')
);

fs.writeFileSync(path.join(report, 'summary.md'), '## Tóm tắt QE DEMO-1\n\n- 3/3 tiêu chí có test case\n- Q-1 còn mở: thời gian báo lỗi\n');
await step('jira comment không --yes: chỉ xem trước', 'jira', ['comment', 'DEMO-1', '--file', path.join(report, 'summary.md')], (r) => need(r.code === 0 && /XEM TRƯỚC/.test(r.stdout), 'không thấy XEM TRƯỚC'));
await step('jira comment --yes: gửi (giả lập người dùng đã đồng ý)', 'jira', ['comment', 'DEMO-1', '--file', path.join(report, 'summary.md'), '--yes'], (r) => need(r.code === 0 && /Đã thêm comment 10001/.test(r.stdout), 'chưa gửi được'));

requests.length = 0;
await step('mobile-test không --yes: chỉ in kế hoạch, không upload', 'mobile-test', ['run', '--suite', 'smoke', '--issue', 'DEMO-1'], (r) => need(r.code === 0 && requests.length === 0, `đã gửi ${requests.length} request`));
await step('mobile-test --yes: upload, mở session, screenshot, session/video URL', 'mobile-test', ['run', '--suite', 'smoke', '--issue', 'DEMO-1', '--yes'], (r) => {
  const md = read(path.join(report, 'mobile.md'));
  return need(r.code === 0 && /PASS/.test(md) && /session\/s1/.test(md) && /video\/s1/.test(md) && fs.existsSync(path.join(report, 'mobile-smoke.png')), 'mobile.md chưa đủ');
});
await step('workflow status: liệt kê artifact và bước tiếp', 'workflow', ['status', 'DEMO-1'], (r) => need(r.code === 0 && /Bước tiếp/.test(r.stdout), 'thiếu bước tiếp'));

const leaked = walk(work).filter((f) => !f.endsWith('.png')).filter((f) => /demo-token-not-real|demo-figma-not-real|demo-bs-not-real|sig=demo/.test(read(f)));
if (leaked.length) {
  failed++;
  console.log(`✘ Token/URL ký sẵn lọt vào file: ${leaked.join(', ')}`);
} else console.log('✔ Không file nào trong runs/ chứa token hay URL ảnh ký sẵn');

server.close();
console.log(`\n${failed ? `${failed} bước lỗi.` : 'Tất cả bước đều qua.'}`);
if (KEEP) console.log(`Thư mục demo giữ lại: ${work}\n  - mở ${path.relative(work, runDir)}/report/ để xem test-cases.md, traceability-*.md, mobile.md`);
else fs.rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
}
