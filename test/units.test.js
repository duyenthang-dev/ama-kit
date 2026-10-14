import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adfToMarkdown, markdownToAdf } from '../src/adf.js';
import { acFromDescription, issueToMarkdown, relationsOf } from '../src/issue.js';
import { normalizeNodeId, parseConfluenceUrl, parseFigmaUrl, slugify } from '../src/links.js';
import { applyBoundary } from '../src/redact.js';
import { storageToMarkdown } from '../src/storage.js';
import { renderObjectiveMatrix, renderTestMatrix, validateAc, validateTestCases } from '../src/traceability.js';
import { parseFrontmatter, parseYaml, stringifyYaml } from '../src/yaml.js';
import { adf } from './helpers.js';

const { t, p, doc } = adf;

test('yaml: map, list of maps, inline list, quoted, comments', () => {
  const y = parseYaml('a:\n  b: "12:34"  # c\n  n: 14.0\n  s: hello world\nl:\n  - nodeId: "1:2"\n    name: Login\n  - x\nf: [a, "b, c"]\ne: []\nz: null\n');
  assert.deepEqual(y, { a: { b: '12:34', n: 14, s: 'hello world' }, l: [{ nodeId: '1:2', name: 'Login' }, 'x'], f: ['a', 'b, c'], e: [], z: null });
  assert.deepEqual(parseYaml(stringifyYaml({ k: 'a: b', l: [{ v: '1' }], m: {} })), { k: 'a: b', l: [{ v: '1' }], m: {} });
  assert.deepEqual(parseFrontmatter('---\nid: x\ntriggers:\n  - a\n---\nbody').data, { id: 'x', triggers: ['a'] });
  assert.throws(() => parseYaml('a:\n\tb: 1'), /tab/);
});

test('data boundary: che token, email, số tài khoản; giữ ngày, ID trong URL, số ngắn', () => {
  const tok = 'ATA' + 'TT3xFfGF0abcdefghijklmnopqrstu';
  const r = applyBoundary(`Liên hệ an.nguyen@example.com, STK 1234 5678 9012, ngày 2026-10-15, page https://s/wiki/pages/123456789/x, mã 12345, ${tok}, token=abcdefgh123`);
  assert.match(r.text, /\[ĐÃ CHE:email\]/);
  assert.match(r.text, /STK \[ĐÃ CHE:số tài khoản\]/);
  assert.match(r.text, /2026-10-15/);
  assert.match(r.text, /pages\/123456789\/x/);
  assert.match(r.text, /mã 12345/);
  assert.ok(!r.text.includes(tok) && !r.text.includes('abcdefgh123'));
  assert.deepEqual(Object.keys(r.counts).sort(), ['accounts', 'emails', 'tokens']);
  const long = applyBoundary('x'.repeat(50), { maxSourceChars: 10 });
  assert.ok(long.truncated && /ĐÃ CẮT/.test(long.text));
});

test('ADF ↔ Markdown, macro bị bỏ có ghi chú', () => {
  const md = adfToMarkdown(doc({ type: 'heading', attrs: { level: 2 }, content: [t('Login')] }, p(t('Nhập '), t('email', [{ type: 'strong' }])), { type: 'extension', attrs: { extensionKey: 'jira-chart' } }));
  assert.match(md, /## Login\n\nNhập \*\*email\*\*/);
  assert.match(md, /Đã bỏ macro "jira-chart"/);
  const back = markdownToAdf('## Tóm tắt\n\n- **2/3** AC\n- Q-1 mở');
  assert.deepEqual(back.content.map((n) => n.type), ['heading', 'bulletList']);
  assert.match(storageToMarkdown('<p>a</p><ac:structured-macro ac:name="roadmap"/>'), /Đã bỏ macro "roadmap"/);
});

test('URL Confluence và Figma', () => {
  assert.deepEqual(parseConfluenceUrl('https://s.atlassian.net/wiki/spaces/ENG/pages/42/Spec'), { pageId: '42' });
  assert.deepEqual(parseConfluenceUrl('https://s.atlassian.net/wiki/x/AbC'), { tinyUrl: 'https://s.atlassian.net/wiki/x/AbC' });
  assert.deepEqual(parseFigmaUrl('https://www.figma.com/design/KEY1/App?node-id=12-34'), { fileKey: 'KEY1', nodeId: '12:34' });
  assert.equal(parseFigmaUrl('https://evil.example/design/KEY1/x?node-id=1-2'), null);
  assert.equal(normalizeNodeId('1-2'), '1:2');
  assert.equal(slugify('Đăng nhập / Login'), 'dang-nhap-login');
});

test('tiêu chí chấp nhận: lấy từ field hoặc mục trong mô tả, giữ nguyên văn và nguồn', () => {
  const issue = {
    key: 'PROJ-1',
    names: { customfield_9: 'Acceptance Criteria' },
    fields: { summary: 'Login', description: doc(p(t('Mô tả'))), customfield_9: doc(p(t('Sai mật khẩu 5 lần thì khóa'))) },
  };
  const a = issueToMarkdown(issue);
  assert.equal(a.acSource.field, 'customfield_9');
  assert.match(a.markdown, /Nguồn: field "Acceptance Criteria" \(customfield_9\).*Nguyên văn/);
  assert.match(a.markdown, /Sai mật khẩu 5 lần thì khóa/);

  const md = '# Mục tiêu\n\nabc\n\n## Acceptance criteria\n\n- Given A When B Then C\n\n## Ghi chú\n\nx';
  assert.deepEqual(acFromDescription(md), { heading: 'Acceptance criteria', text: '- Given A When B Then C' });
  const b = issueToMarkdown({ key: 'PROJ-2', fields: { summary: 's', description: doc({ type: 'heading', attrs: { level: 2 }, content: [t('Acceptance criteria')] }, p(t('Given A When B Then C'))) } });
  assert.equal(b.acSource.kind, 'description');
});

test('quan hệ một vòng: cha, con, chặn, bị chặn', () => {
  const r = relationsOf({
    key: 'A-1',
    fields: {
      parent: { key: 'A-0', fields: { summary: 'Epic' } },
      subtasks: [{ key: 'A-2', fields: { summary: 'sub' } }],
      issuelinks: [
        { type: { name: 'Blocks', outward: 'blocks', inward: 'is blocked by' }, outwardIssue: { key: 'A-4', fields: { summary: 'x' } } },
        { type: { name: 'Blocks', outward: 'blocks', inward: 'is blocked by' }, inwardIssue: { key: 'A-5', fields: { summary: 'y' } } },
        { type: { name: 'Relates', outward: 'relates to', inward: 'relates to' }, outwardIssue: { key: 'A-6', fields: { summary: 'z' } } },
      ],
    },
  });
  assert.equal(r.parent.key, 'A-0');
  assert.deepEqual(r.children.map((c) => c.key), ['A-2']);
  assert.deepEqual(r.blocks.map((c) => c.key), ['A-4']);
  assert.deepEqual(r.blockedBy.map((c) => c.key), ['A-5']);
  assert.deepEqual(r.other.map((c) => c.key), ['A-6']);
});

test('schema và hai ma trận truy vết', () => {
  const ac = {
    issueKey: 'PROJ-1',
    acceptanceCriteria: [
      { id: 'AC-1', original: 'Đăng nhập đúng thì vào Home', source: 'jira', sourceRef: 'customfield_9', quality: 'testable', testLevel: 'e2e', moscow: 'must', figmaNodes: ['1:2'] },
      { id: 'AC-2', original: 'Báo lỗi nhanh', source: 'jira', sourceRef: 'customfield_9', quality: 'ambiguous', issues: ['"nhanh" không có số'], testLevel: 'integration' },
    ],
    questions: [{ id: 'Q-1', question: 'Nhanh là bao nhiêu?', relatesTo: ['AC-2'], priority: 'high' }],
  };
  const v = validateAc(ac);
  assert.deepEqual(v.errors, []);
  const tc = { testCases: [{ id: 'TC-1', title: 'Đăng nhập', acIds: ['AC-1'], level: 'e2e', priority: 'P1', steps: ['a'], expected: 'b' }] };
  const tv = validateTestCases(tc, v.acIds);
  assert.deepEqual(tv.errors, []);
  assert.ok(tv.warnings.some((w) => /AC-2 chưa có test case/.test(w)));
  assert.ok(validateAc({ acceptanceCriteria: [{ id: 'X' }] }).errors.length >= 5);
  assert.match(renderObjectiveMatrix(ac, { sources: { figma: [{ nodeId: '1:2', name: 'Login' }] } }), /\| AC-1 \| Đăng nhập đúng thì vào Home \| jira \| customfield_9 \| Login `1:2` \| e2e \| testable \|/);
  const m2 = renderTestMatrix(tc, ac);
  assert.match(m2, /\| TC-1 Đăng nhập \| e2e \| P1 \| ✔ \|  \|/);
  assert.match(m2, /Độ phủ: 1\/2.*\nChưa phủ: AC-2/);
});
