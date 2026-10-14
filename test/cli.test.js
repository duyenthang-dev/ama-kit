// --help, từ chối cờ chứa bí mật (không in giá trị), --dry-run không gọi API, mã thoát.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { cli, mockServer, tmpdir } from './helpers.js';

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
