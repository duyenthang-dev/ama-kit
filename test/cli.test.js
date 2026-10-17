// --help, từ chối cờ chứa bí mật (không in giá trị), --dry-run không gọi API, mã thoát.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { cli, KIT, mockServer, tmpdir } from './helpers.js';

const COMMANDS = ['jira', 'confluence', 'figma', 'mobile-test', 'context-brief', 'analyze-requirement', 'qe-workflow', 'workflow', 'ama'];
let mock;
before(async () => {
  mock = await mockServer(() => [500, { message: 'không được gọi trong dry-run' }]);
});
after(() => mock.close());

test('mọi lệnh có --help, mã thoát 0', async () => {
  for (const c of COMMANDS) {
    const r = await cli(c, ['--help']);
    assert.equal(r.code, 0, `${c} --help`);
    assert.ok(r.stdout.length > 100, `${c} --help in hướng dẫn`);
  }
});

test('từ chối cờ chứa bí mật mà không in giá trị (mã 2)', async () => {
  const secret = 'S3CR3T-VALUE-should-never-print';
  for (const flag of ['--token', '--password', '--api-token', '--access-key', '--secret']) {
    for (const args of [['issue', 'PROJ-1', flag, secret], ['issue', 'PROJ-1', `${flag}=${secret}`]]) {
      const r = await cli('jira', args);
      assert.equal(r.code, 2, `${flag}`);
      assert.match(r.stderr, new RegExp(`${flag} không được phép`));
      assert.ok(!r.stdout.includes(secret) && !r.stderr.includes(secret), `${flag} làm lộ giá trị`);
    }
  }
  const r = await cli('mobile-test', ['run', '--access-key', secret]);
  assert.equal(r.code, 2);
  assert.ok(!r.stderr.includes(secret));
});

test('--dry-run không cần credential và không gọi API', async () => {
  const cwd = tmpdir();
  const env = { ATLASSIAN_SITE: mock.base, FIGMA_API_BASE: mock.base, BROWSERSTACK_API_BASE: mock.base }; // không có token nào
  const runs = [
    ['jira', ['issue', 'PROJ-1', '--dry-run']],
    ['jira', ['comment', 'PROJ-1', '--file', new URL('../README.md', import.meta.url).pathname, '--dry-run']],
    ['confluence', ['page', '123', '--dry-run']],
    ['figma', ['export', '--url', 'https://www.figma.com/design/K/x?node-id=1-2', '--dry-run']],
    ['mobile-test', ['run', '--suite', 'smoke', '--app', 'bs://abc', '--dry-run']],
    ['mobile-test', ['check', '--dry-run']],
    ['context-brief', ['PROJ-1', '--dry-run']],
    ['analyze-requirement', ['PROJ-1', '--dry-run']],
    ['workflow', ['doctor', '--dry-run']],
    ['workflow', ['init', '--dry-run']],
  ];
  for (const [c, args] of runs) {
    const r = await cli(c, args, { cwd, env });
    assert.equal(r.code, 0, `${c} ${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stdout, /DRY RUN/);
  }
  assert.equal(mock.log.length, 0, 'dry-run không được gửi request nào');
});

test('thiếu biến môi trường: mã 3, in tên biến, không in giá trị', async () => {
  const r = await cli('jira', ['issue', 'PROJ-1'], { env: { ATLASSIAN_SITE: mock.base, ATLASSIAN_EMAIL: 'qa@example.com' } });
  assert.equal(r.code, 3);
  assert.match(r.stderr, /Thiếu biến môi trường: ATLASSIAN_API_TOKEN/);
  assert.ok(!r.stderr.includes('qa@example.com'));
  const f = await cli('figma', ['export', '--url', 'https://www.figma.com/design/K/x?node-id=1-2'], { env: {} });
  assert.equal(f.code, 3);
  assert.match(f.stderr, /FIGMA_ACCESS_TOKEN/);
});

test('sai cách dùng: mã 2', async () => {
  assert.equal((await cli('jira', ['issue', 'proj-1'])).code, 2);
  assert.equal((await cli('jira', ['nope', 'PROJ-1'])).code, 2);
  assert.equal((await cli('confluence', ['page'])).code, 2);
  assert.equal((await cli('jira', ['issue', 'PROJ-1', '--unknown'])).code, 2);
  assert.equal((await cli('ama', ['nope'])).code, 2);
});

test('lỗi API: mã 1', async () => {
  const r = await cli('jira', ['issue', 'PROJ-1'], { env: { ATLASSIAN_SITE: mock.base, ATLASSIAN_EMAIL: 'a@b.c', ATLASSIAN_API_TOKEN: 'tok-123456' } });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /HTTP 500/);
  assert.ok(!r.stderr.includes('tok-123456'));
});

test('.ama/.env: đọc biến từ file; token chỉ đọc khi git bỏ qua file', async () => {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, '.ama'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.ama', '.env'), 'export ATLASSIAN_EMAIL="qe@example.com"\nATLASSIAN_API_TOKEN=file-token-value-123\n');
  const env = { AMA_NO_ENV_FILE: '', AMA_NO_KIT_ENV_FILE: '1' }; // không lẫn .env thật ở gốc kit
  // ngoài repo git: đọc được, token hiện đã che
  let r = await cli('workflow', ['doctor', '--only', 'none'], { cwd: dir, env });
  assert.match(r.stdout, /ATLASSIAN_EMAIL\s+qe@example\.com\s+\[file:/);
  assert.match(r.stdout, /ATLASSIAN_API_TOKEN\s+fil…123\s+\[file:/);
  assert.doesNotMatch(r.stdout + r.stderr, /file-token-value/);
  // trong repo git, chưa gitignore: bỏ qua token
  execFileSync('git', ['init', '-q', dir]);
  r = await cli('workflow', ['doctor', '--only', 'none'], { cwd: dir, env });
  assert.match(r.stdout, /ATLASSIAN_API_TOKEN\s+chưa đặt/);
  assert.match(r.stderr, /bỏ qua ATLASSIAN_API_TOKEN/);
  // gitignore rồi: đọc được
  fs.writeFileSync(path.join(dir, '.gitignore'), '.ama/\n');
  r = await cli('workflow', ['doctor', '--only', 'none'], { cwd: dir, env });
  assert.match(r.stdout, /ATLASSIAN_API_TOKEN\s+fil…123\s+\[file:/);
});

test('install-claude: --help, --dry-run không gọi claude, tham số lạ → 2', async () => {
  const run = (a) =>
    new Promise((res) => execFile(process.execPath, [path.join(KIT, 'scripts', 'install-claude.js'), ...a], { env: { PATH: '', HOME: tmpdir() } }, (err, stdout, stderr) => res({ code: err ? err.code : 0, stdout, stderr })));
  let r = await run(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--uninstall/);
  r = await run(['--dry-run']); // PATH rỗng: nếu gọi claude thật sẽ lỗi
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\(dry-run\) claude plugin install ama-kit@ama/);
  r = await run(['--force']);
  assert.equal(r.code, 2);
});

test('session-context (hook SessionStart): tóm tắt dự án, không có credential, luôn thoát 0', async () => {
  const run = (cwd) =>
    new Promise((res) => execFile(process.execPath, [path.join(KIT, 'scripts', 'session-context.js')], { cwd, env: { PATH: process.env.PATH, HOME: cwd, ATLASSIAN_API_TOKEN: 'secret-value-xyz' } }, (err, stdout) => res({ code: err ? err.code : 0, stdout })));
  const dir = tmpdir();
  let r = await run(dir);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /chưa có \.ama\/project\.yml/);
  fs.mkdirSync(path.join(dir, '.ama'));
  fs.writeFileSync(path.join(dir, '.ama', 'project.yml'), 'project:\n  key: PROJ\n');
  r = await run(dir);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /PROJ-123/);
  assert.match(r.stdout, /ama-kit:analyze-requirement/);
  assert.match(r.stdout, /knowledge\/requirement-analysis\.md/);
  assert.doesNotMatch(r.stdout, /secret-value/);
});

test('qe-workflow: artifact là tùy chọn; qe-plan.json quyết định làm gì', async () => {
  const dir = tmpdir();
  const report = path.join(dir, 'run', 'report');
  fs.mkdirSync(report, { recursive: true });
  fs.writeFileSync(path.join(report, 'ac.json'), JSON.stringify({ issueKey: 'WEB-1', acceptanceCriteria: [{ id: 'AC-1', original: 'Bấm nút thì mở popup', source: 'jira', sourceRef: 'mô tả', quality: 'testable', moscow: 'must', testLevel: 'e2e' }], gaps: [], questions: [] }));
  const runDir = path.join(dir, 'run');
  let r = await cli('qe-workflow', [runDir], { cwd: dir });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /đều tùy chọn/);
  assert.doesNotMatch(r.stdout, /Còn thiếu/);
  // kế hoạch: chỉ test case + summary, bỏ mobile
  fs.writeFileSync(path.join(report, 'qe-plan.json'), JSON.stringify({ rationale: 'Story web nhỏ', deliverables: [{ file: 'summary.md', why: 'báo PO' }], skipped: [{ file: 'mobile.md', why: 'WebApp' }] }));
  r = await cli('qe-workflow', [runDir], { cwd: dir });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /bỏ mobile\.md — WebApp/);
  assert.match(r.stdout, /Còn làm theo kế hoạch: summary\.md/);
  fs.writeFileSync(path.join(report, 'summary.md'), 'ok');
  r = await cli('qe-workflow', [runDir], { cwd: dir });
  assert.match(r.stdout, /Đủ theo kế hoạch/);
  // bỏ mà không nói lý do → 2
  fs.writeFileSync(path.join(report, 'qe-plan.json'), JSON.stringify({ rationale: 'x', deliverables: [], skipped: [{ file: 'test-plan.md' }] }));
  r = await cli('qe-workflow', [runDir], { cwd: dir });
  assert.equal(r.code, 2);
});
