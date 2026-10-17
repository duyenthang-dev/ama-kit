// End-to-end với HTTP giả: một issue mẫu có issue liên quan và page. Không cần token thật.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { adf, cli, mockServer, PNG, tmpdir } from './helpers.js';

const { t, p, doc } = adf;
let mock;
let work;
let env;
const posted = [];

// PROJ-1 (A): cha PROJ-0, sub-task PROJ-2, con qua JQL PROJ-3, chặn PROJ-4, bị PROJ-5 chặn.
// PROJ-4 gắn page 333 (vòng 1: phải lấy) và liên kết tới PROJ-9 (vòng 2: không được đọc).
// Page 111 link tới page 444 bên trong thân page: không được đi theo.
const link = (type, dir, key) => ({ type: { name: type, outward: type === 'Blocks' ? 'blocks' : 'relates to', inward: type === 'Blocks' ? 'is blocked by' : 'relates to' }, [dir]: { key, fields: { summary: `${key} summary` } } });
function issue(key, base) {
  const common = { status: { name: 'In Progress' }, issuetype: { name: 'Story' }, updated: '2026-10-01T10:00:00.000+0000' };
  switch (key) {
    case 'PROJ-1':
      return {
        key,
        names: { customfield_100: 'Acceptance Criteria' },
        fields: {
          ...common,
          summary: 'Đăng nhập bằng email',
          parent: { key: 'PROJ-0', fields: { summary: 'Epic xác thực' } },
          subtasks: [{ key: 'PROJ-2', fields: { summary: 'API login' } }],
          issuelinks: [link('Blocks', 'outwardIssue', 'PROJ-4'), link('Blocks', 'inwardIssue', 'PROJ-5')],
          description: doc(
            p(t('Người dùng đăng nhập bằng email. Liên hệ an.nguyen@example.com, STK 1234 5678 9012 3456. Spec: '), t('Login spec', [{ type: 'link', attrs: { href: `${base}/wiki/spaces/ENG/pages/111/Login+Spec` } }])),
            p({ type: 'inlineCard', attrs: { url: 'https://www.figma.com/design/FIGKEY/App?node-id=1-2' } })
          ),
          customfield_100: doc({ type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Đăng nhập đúng thì vào Home'))] }, { type: 'listItem', content: [p(t('Sai mật khẩu thì báo lỗi nhanh'))] }] }),
          attachment: [],
        },
      };
    case 'PROJ-4':
      return { key, fields: { ...common, summary: 'Màn Home', issuelinks: [link('Blocks', 'outwardIssue', 'PROJ-9')], description: doc(p(t('Xem '), t('roadmap', [{ type: 'link', attrs: { href: `${base}/wiki/spaces/ENG/pages/333/Roadmap` } }]))) } };
    case 'PROJ-5':
      return { key, fields: { ...common, summary: 'Dịch vụ token', issuelinks: [], description: doc(p(t('Hợp đồng API: '), t('API spec', [{ type: 'link', attrs: { href: `${base}/wiki/spaces/ENG/pages/222/API` } }]))) } };
    case 'PROJ-0':
    case 'PROJ-2':
    case 'PROJ-3':
    case 'PROJ-9':
      return { key, fields: { ...common, summary: `${key} summary`, issuelinks: [], description: doc(p(t(`Nội dung ${key}`))) } };
    default:
      return null;
  }
}

function routes(req, url, body, base) {
  const pth = url.pathname;
  if (pth.startsWith('/img/')) return { raw: PNG, type: 'image/png' };
  const m = pth.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)$/);
  if (m) {
    const i = issue(m[1], base);
    return i ? [200, i] : null;
  }
  const rl = pth.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)\/remotelink$/);
  if (rl) return [200, rl[1] === 'PROJ-1' ? [{ object: { url: `${base}/wiki/spaces/ENG/pages/111/Login+Spec`, title: 'Login spec' } }] : []];
  if (req.method === 'POST' && pth === '/rest/api/3/search/jql') {
    assert.match(JSON.parse(body).jql, /^parent = PROJ-1/);
    return [200, { issues: [{ key: 'PROJ-3', fields: { summary: 'UI login' } }, { key: 'PROJ-2', fields: { summary: 'API login' } }] }];
  }
  if (req.method === 'POST' && pth === '/rest/api/3/issue/PROJ-1/comment') {
    posted.push(JSON.parse(body));
    return [201, { id: '10001' }];
  }
  const pg = pth.match(/^\/wiki\/api\/v2\/pages\/(\d+)$/);
  if (pg) {
    const id = pg[1];
    const bodies = {
      111: doc({ type: 'heading', attrs: { level: 2 }, content: [t('Quy tắc')] }, p(t('Khóa tài khoản sau 5 lần sai. Thiết kế lỗi: https://www.figma.com/design/FIGKEY/App?node-id=3-4 Xem thêm '), t('lịch sử', [{ type: 'link', attrs: { href: `${base}/wiki/spaces/ENG/pages/444/History` } }])), { type: 'extension', attrs: { extensionKey: 'jira-issues' } }),
      222: doc(p(t('POST /login trả 401 khi sai.'))),
      333: doc(p(t('Roadmap'))),
      444: doc(p(t('History'))),
    };
    if (!bodies[id]) return null;
    return [200, { id, title: { 111: 'Login Spec', 222: 'API Spec', 333: 'Roadmap', 444: 'History' }[id], version: { number: 7 }, _links: { base: `${base}/wiki`, webui: `/spaces/ENG/pages/${id}` }, body: { atlas_doc_format: { value: JSON.stringify(bodies[id]) } } }];
  }
  if (pth === '/v1/files/FIGKEY/nodes') {
    const names = { '1:2': 'Login', '3:4': 'Login error', '5:6': 'Home' };
    // Page 9:0 chứa section 9:1 (Login, Login error) và frame Home; section 9:1 lồng bên trong.
    const containers = {
      '9:0': { name: '3.3 Quản lý đơn hàng', type: 'CANVAS', children: [{ id: '9:1', name: 'Quản lý đơn hàng', type: 'SECTION' }, { id: '5:6', name: 'Home', type: 'FRAME' }, { id: '9:9', name: 'Ghi chú', type: 'TEXT' }] },
      '9:1': { name: 'Quản lý đơn hàng', type: 'SECTION', children: [{ id: '1:2', name: 'Login', type: 'FRAME' }, { id: '3:4', name: 'Login error', type: 'FRAME' }] },
    };
    const ids = url.searchParams.get('ids').split(',');
    const doc = (i) => (containers[i] ? { document: containers[i] } : names[i] ? { document: { name: names[i], type: 'FRAME' } } : null);
    return [200, { version: '99', nodes: Object.fromEntries(ids.map((i) => [i, doc(i)])) }];
  }
  if (pth === '/v1/images/FIGKEY') {
    const ids = url.searchParams.get('ids').split(',');
    return [200, { images: Object.fromEntries(ids.map((i) => [i, `${base}/img/${encodeURIComponent(i)}.png?X-Amz-Signature=secretsig`])) }];
  }
  // BrowserStack REST + hub
  if (req.method === 'POST' && pth === '/app-automate/upload') return [200, { app_url: 'bs://app123' }];
  if (req.method === 'POST' && pth === '/wd/hub/session') return [200, { value: { sessionId: 'sess1', capabilities: {} } }];
  if (req.method === 'POST' && pth === '/wd/hub/session/sess1/element') return [200, { value: { 'element-6066-11e4-a52e-4f735466cecf': 'el1' } }];
  if (pth === '/wd/hub/session/sess1/screenshot') return [200, { value: PNG.toString('base64') }];
  if (req.method === 'DELETE' && pth === '/wd/hub/session/sess1') return [200, { value: null }];
  if (pth === '/app-automate/sessions/sess1.json') {
    if (req.method === 'PUT') return [200, {}];
    return [200, { automation_session: { status: 'passed', public_url: 'https://example.test/s/sess1', video_url: 'https://example.test/v/sess1', device: 'Google Pixel 8', os: 'android', os_version: '14.0' } }];
  }
  return null;
}

before(async () => {
  mock = await mockServer(routes);
  work = tmpdir('ama-e2e-');
  fs.mkdirSync(path.join(work, '.ama'));
  fs.writeFileSync(
    path.join(work, '.ama', 'project.yml'),
    ['project:', '  key: PROJ', 'figma:', '  fileKey: FIGKEY', '  frames:', '    - nodeId: "5:6"', '      name: Home screen', 'mobile:', '  appPath: ./app.apk', '  device:', '    name: Google Pixel 8', '    platformVersion: "14.0"', ''].join('\n')
  );
  fs.writeFileSync(path.join(work, 'app.apk'), 'fake apk');
  env = {
    ATLASSIAN_SITE: mock.base,
    ATLASSIAN_EMAIL: 'qa@example.com',
    ATLASSIAN_API_TOKEN: 'tok-secret-123456',
    FIGMA_ACCESS_TOKEN: 'figma-secret-123456',
    FIGMA_API_BASE: mock.base,
    BROWSERSTACK_USERNAME: 'bsuser',
    BROWSERSTACK_ACCESS_KEY: 'bs-secret-key-999',
    BROWSERSTACK_API_BASE: mock.base,
    BROWSERSTACK_HUB_URL: `${mock.base}/wd/hub`,
  };
});
after(() => mock.close());

const run = (cmd, args) => cli(cmd, args, { cwd: work, env });
const runsDir = () => path.join(work, 'runs');
const latest = (re) => fs.readdirSync(runsDir()).filter((n) => re.test(n)).sort().pop();

test('context-brief chỉ đi một vòng liên kết', async () => {
  mock.log.length = 0;
  const r = await run('context-brief', ['PROJ-1']);
  assert.equal(r.code, 0, r.stderr);
  const dir = path.join(runsDir(), latest(/^PROJ-1-context-\d{4}-/));
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.relations, { parent: 'PROJ-0', children: ['PROJ-2', 'PROJ-3'], blocks: ['PROJ-4'], blockedBy: ['PROJ-5'] });
  assert.deepEqual(m.issues.map((i) => `${i.key}:${i.role}`).sort(), ['PROJ-0:parent', 'PROJ-1:A', 'PROJ-2:child', 'PROJ-3:child', 'PROJ-4:blocked-by-A', 'PROJ-5:blocks-A']);
  assert.equal(m.hops, 1);
  assert.deepEqual(m.sources.confluence.map((x) => x.id).sort(), ['111', '222', '333']);
  assert.deepEqual(m.sources.confluence.find((x) => x.id === '222').linkedFrom, ['PROJ-5']);
  assert.deepEqual(m.sources.confluence.find((x) => x.id === '333').linkedFrom, ['PROJ-4']);
  const fetched = mock.log.map((l) => l.path);
  assert.ok(!fetched.some((x) => x.includes('PROJ-9')), 'không được đọc issue vòng 2');
  assert.ok(!fetched.some((x) => x.endsWith('/pages/444')), 'không được đi theo link bên trong page');
  assert.equal(fetched.filter((x) => x === '/rest/api/3/issue/PROJ-4').length, 1, 'mỗi issue liên quan chỉ đọc một lần');
  for (const k of ['PROJ-0', 'PROJ-1', 'PROJ-2', 'PROJ-3', 'PROJ-4', 'PROJ-5']) assert.ok(fs.existsSync(path.join(dir, 'jira', `${k}.md`)), k);
});

test('analyze-requirement tạo runs/<KEY>-<thời điểm>/ với issue, page, ảnh; che dữ liệu nhạy cảm', async () => {
  const r = await run('analyze-requirement', ['PROJ-1']);
  assert.equal(r.code, 0, r.stderr);
  const name = latest(/^PROJ-1-\d{4}-\d{2}-\d{2}T/);
  assert.match(name, /^PROJ-1-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
  const dir = path.join(runsDir(), name);
  for (const d of ['jira', 'confluence', 'figma', 'report']) assert.ok(fs.statSync(path.join(dir, d)).isDirectory());

  const issueMd = fs.readFileSync(path.join(dir, 'jira', 'issue.md'), 'utf8');
  assert.match(issueMd, /Nguồn: field "Acceptance Criteria" \(customfield_100\)/);
  assert.match(issueMd, /- Đăng nhập đúng thì vào Home\n- Sai mật khẩu thì báo lỗi nhanh/);
  assert.ok(!issueMd.includes('an.nguyen@example.com') && issueMd.includes('[ĐÃ CHE:email]'));
  assert.ok(!issueMd.includes('1234 5678 9012 3456') && issueMd.includes('[ĐÃ CHE:số tài khoản]'));

  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.sources.confluence.map((x) => x.id), ['111']);
  assert.deepEqual(m.sources.figma.map((f) => f.nodeId).sort(), ['1:2', '3:4', '5:6']);
  assert.equal(m.sources.figma.find((f) => f.nodeId === '5:6').name, 'Home screen');
  for (const f of m.sources.figma) assert.ok(fs.existsSync(path.join(dir, f.file)));
  assert.match(m.dataBoundary['jira/issue.md'], /che 1 emails/);
  const page = fs.readFileSync(path.join(dir, m.sources.confluence[0].file), 'utf8');
  assert.match(page, /Đã bỏ macro "jira-issues"/);

  const everything = JSON.stringify(m) + issueMd + page;
  for (const s of ['tok-secret-123456', 'figma-secret-123456', 'secretsig']) assert.ok(!everything.includes(s), `lộ ${s}`);
});

test('qe-workflow kiểm schema và sinh hai ma trận; jira comment cần --yes', async () => {
  const dir = path.join(runsDir(), latest(/^PROJ-1-\d{4}-\d{2}-\d{2}T/));
  const report = path.join(dir, 'report');
  const ac = {
    issueKey: 'PROJ-1',
    acceptanceCriteria: [
      { id: 'AC-1', original: 'Đăng nhập đúng thì vào Home', interpretation: 'Given ... When ... Then Home', source: 'jira', sourceRef: 'customfield_100', quality: 'testable', moscow: 'must', testLevel: 'e2e', figmaNodes: ['1:2', '5:6'] },
      { id: 'AC-2', original: 'Sai mật khẩu thì báo lỗi nhanh', source: 'jira', sourceRef: 'customfield_100', quality: 'ambiguous', issues: ['"nhanh" không có số'], moscow: 'must', testLevel: 'integration', figmaNodes: ['3:4'] },
      { id: 'AC-3', original: 'Khóa tài khoản sau 5 lần sai', source: 'confluence', sourceRef: 'Login Spec v7', quality: 'testable', moscow: 'should', testLevel: 'unit' },
    ],
    gaps: [{ id: 'GAP-1', description: 'Khóa tài khoản chỉ có trên Confluence', sources: ['jira', 'confluence'], severity: 'medium' }],
    questions: [{ id: 'Q-1', question: 'Báo lỗi trong bao lâu?', relatesTo: ['AC-2'], priority: 'high' }],
  };
  fs.writeFileSync(path.join(report, 'ac.json'), JSON.stringify(ac));
  let r = await run('qe-workflow', ['PROJ-1']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(path.join(report, 'traceability-objectives.md'), 'utf8'), /\| AC-3 \| Khóa tài khoản sau 5 lần sai \| confluence \| Login Spec v7 \| — \| unit \| testable \|/);

  const tc = {
    issueKey: 'PROJ-1',
    testCases: [
      { id: 'TC-1', title: 'Đăng nhập hợp lệ', acIds: ['AC-1'], level: 'e2e', type: 'positive', priority: 'P1', data: 'factory user', steps: ['Mở app', 'Nhập', 'Bấm'], expected: ['Home'], figmaNodes: ['5:6'] },
      { id: 'TC-2', title: 'Sai mật khẩu', acIds: ['AC-2'], level: 'integration', priority: 'P1', steps: ['POST /login sai'], expected: '401 và thông báo', figmaNodes: ['3:4'] },
    ],
  };
  fs.writeFileSync(path.join(report, 'test-cases.json'), JSON.stringify(tc));
  r = await run('qe-workflow', ['PROJ-1']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /phủ 2\/3 tiêu chí/);
  assert.match(r.stdout, /AC-3 chưa có test case/);
  const m2 = fs.readFileSync(path.join(report, 'traceability-tests.md'), 'utf8');
  assert.match(m2, /\| TC-1 Đăng nhập hợp lệ \| e2e \| P1 \| ✔ \|  \|  \|/);
  assert.match(m2, /Chưa phủ: AC-3/);

  tc.testCases[1].acIds = ['AC-9'];
  fs.writeFileSync(path.join(report, 'test-cases.json'), JSON.stringify(tc));
  r = await run('qe-workflow', ['PROJ-1']);
  assert.equal(r.code, 2);
  assert.match(r.stdout, /tham chiếu AC-9 không tồn tại/);

  const summary = path.join(report, 'summary.md');
  fs.writeFileSync(summary, '## Tóm tắt QE\n\n- **2/3** tiêu chí có test case\n- Q-1 còn mở\n- liên hệ qa@example.com');
  r = await run('jira', ['comment', 'PROJ-1', '--file', summary]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /XEM TRƯỚC/);
  assert.equal(posted.length, 0);
  r = await run('jira', ['comment', 'PROJ-1', '--file', summary, '--yes']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Đã thêm comment 10001/);
  assert.equal(posted.length, 1);
  assert.deepEqual(posted[0].body.content.map((n) => n.type), ['heading', 'bulletList']);
  assert.ok(!JSON.stringify(posted[0]).includes('qa@example.com'), 'comment không được chứa email');
});

test('mobile-test run --suite smoke: hỏi trước, rồi trả session URL, video, screenshot', async () => {
  mock.log.length = 0;
  let r = await run('mobile-test', ['run', '--suite', 'smoke', '--issue', 'PROJ-1']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Cần người dùng xác nhận/);
  assert.equal(mock.log.length, 0, 'không upload, không mở session khi chưa có --yes');

  r = await run('mobile-test', ['run', '--suite', 'smoke', '--issue', 'PROJ-1', '--yes']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const report = path.join(runsDir(), latest(/^PROJ-1-\d{4}-\d{2}-\d{2}T/), 'report');
  const md = fs.readFileSync(path.join(report, 'mobile.md'), 'utf8');
  assert.match(md, /Kết quả:\*\* PASS/);
  assert.match(md, /Session:\*\* https:\/\/example\.test\/s\/sess1/);
  assert.match(md, /Video:\*\* https:\/\/example\.test\/v\/sess1/);
  assert.match(md, /Screenshot:\*\* mobile-smoke\.png/);
  assert.ok(fs.existsSync(path.join(report, 'mobile-smoke.png')));
  const paths = mock.log.map((l) => `${l.method} ${l.path}`);
  assert.deepEqual(paths.slice(0, 2), ['POST /app-automate/upload', 'POST /wd/hub/session']);
  assert.ok(paths.includes('PUT /app-automate/sessions/sess1.json') && paths.includes('DELETE /wd/hub/session/sess1'));
  const caps = JSON.parse(mock.log[1].body).capabilities.alwaysMatch;
  assert.equal(caps['appium:app'], 'bs://app123');
  assert.equal(caps['bstack:options'].deviceName, 'Google Pixel 8');
  assert.ok(!md.includes('bs-secret-key-999'));

  r = await run('mobile-test', ['run', '--suite', 'regression', '--yes']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /cần WebdriverIO/);
});

test('workflow status chỉ ra bước tiếp theo', async () => {
  const r = await run('workflow', ['status', 'PROJ-1']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /✔ report\/ac\.json/);
  assert.match(r.stdout, /Bước tiếp: skill analyze-requirement đọc nguồn rồi viết report\/ac\.json và report\/analysis\.md/);
});

test('figma export: link tới page/section được mở rộng thành các màn hình bên trong', async () => {
  const out = path.join(work, 'figma-page');
  const r = await run('figma', ['export', '--url', 'https://www.figma.com/design/FIGKEY/App?node-id=9-0', '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.trim().split('\n').map((l) => l.split('\t')[0]).sort();
  assert.deepEqual(lines, ['1:2', '3:4', '5:6']);
  assert.equal(fs.readdirSync(out).filter((f) => f.endsWith('.png')).length, 3);
  assert.ok(!r.stdout.includes('Ghi chú'), 'node TEXT không phải màn hình');
});

test('figma export: có cả link màn cụ thể và link section thì chỉ lấy màn cụ thể', async () => {
  const out = path.join(work, 'figma-mixed');
  const r = await run('figma', ['export', '--nodes', '9:0,1:2', '--file', 'FIGKEY', '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.trim().split('\n').map((l) => l.split('\t')[0]);
  assert.deepEqual(lines, ['1:2']);
  assert.match(r.stderr, /Bỏ qua .*vì đã có link tới màn hình cụ thể/);
});

test('analyze-requirement: nguồn không đổi thì chép report từ run trước; --fresh thì không', async () => {
  let r = await run('analyze-requirement', ['PROJ-1']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Nguồn không đổi so với PROJ-1-.* → đã chép report\//);
  const dir = path.join(runsDir(), latest(/^PROJ-1-\d/));
  assert.ok(fs.existsSync(path.join(dir, 'report', 'ac.json')));
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).reportCarriedFrom);
  r = await run('analyze-requirement', ['PROJ-1', '--fresh']);
  assert.match(r.stdout, /report\/ đang trống/);
  const fresh = path.join(runsDir(), latest(/^PROJ-1-\d/));
  assert.ok(!fs.existsSync(path.join(fresh, 'report', 'ac.json')));
});
