// Adapter Cursor và validator quản trị.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { adaptCursor } from '../providers/cursor/adapt.js';
import { validateGovernance } from '../scripts/validate-governance.js';
import { cli, KIT, tmpdir } from './helpers.js';

test('adapter Cursor sinh file có generated: true và source, không gọi mạng', async () => {
  const out = tmpdir('ama-cursor-');
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('adapter không được gọi mạng');
  };
  try {
    const files = adaptCursor({ out });
    const names = files.map((f) => path.basename(f)).sort();
    assert.ok(names.includes('ama-rule-credential-protection.mdc'));
    assert.ok(names.includes('ama-skill-analyze-requirement.mdc'));
    assert.ok(names.includes('ama-skill-context-brief.mdc'));
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      assert.match(text, /^---\n[\s\S]*\ngenerated: true\nsource: [\w./-]+\n---/, path.basename(f));
      assert.ok(!text.includes('${CLAUDE_PLUGIN_ROOT}'), `${path.basename(f)} còn biến của Claude Code`);
    }
    assert.match(fs.readFileSync(path.join(out, 'ama-rule-confirm-before-write.mdc'), 'utf8'), /alwaysApply: true/);
    assert.match(fs.readFileSync(path.join(out, 'ama-skill-jira.mdc'), 'utf8'), /alwaysApply: false[\s\S]*source: skills\/jira\/SKILL\.md[\s\S]*bin\/jira\.js issue <KEY>/);
  } finally {
    globalThis.fetch = realFetch;
  }
  const r = await cli('workflow', ['adapt', 'cursor', '--out', tmpdir('ama-cursor2-')]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Đã sinh \d+ file/);
});

test('validator: repo hiện tại hợp lệ', () => {
  const res = validateGovernance({ bannedTerms: [] });
  assert.deepEqual(res.errors, []);
  assert.ok(res.checked.skills >= 8 && res.checked.rules === 3 && res.checked.knowledge >= 8);
});

test('validator bắt lỗi: trigger trùng, metadata knowledge, link hỏng, chuỗi cấm, token, config mẫu', () => {
  const root = tmpdir('ama-gov-');
  for (const d of ['bin', 'src', 'scripts', 'providers', 'registry', 'rules', 'knowledge', 'skills', 'workflows', 'config']) fs.cpSync(path.join(KIT, d), path.join(root, d), { recursive: true });
  for (const f of ['README.md', '.env.example']) fs.copyFileSync(path.join(KIT, f), path.join(root, f));

  const reg = path.join(root, 'registry', 'skills.yml');
  fs.writeFileSync(reg, fs.readFileSync(reg, 'utf8').replace('      - xem ticket', '      - đọc page confluence'));
  const k = path.join(root, 'knowledge', 'jira.md');
  fs.writeFileSync(k, fs.readFileSync(k, 'utf8').replace(/reviewed: .*\n/, 'reviewed: 15/10/2026\n').replace('  - https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/', '  - http://insecure.example'));
  fs.appendFileSync(path.join(root, 'knowledge', 'figma.md'), '\nXem [bài cũ](./khong-ton-tai.md). Hệ thống AcmeInternal.\n');
  fs.writeFileSync(path.join(root, '.env.example'), fs.readFileSync(path.join(root, '.env.example'), 'utf8').replace('FIGMA_ACCESS_TOKEN=', 'FIGMA_ACCESS_TOKEN=figd_' + 'x'.repeat(30)));
  const cfg = path.join(root, 'config', 'project.example.yml');
  fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace(/^  spaceKey: .*\n/m, '').replace('  fileKey: ""', '  fileKey: ""\n  apiToken: ""'));
  fs.writeFileSync(path.join(root, 'skills', 'jira', 'SKILL.md'), fs.readFileSync(path.join(root, 'skills', 'jira', 'SKILL.md'), 'utf8') + '\nHoặc chạy curl https://x/rest/api/3/issue/KEY\n');

  const { errors } = validateGovernance({ root, bannedTerms: ['acmeinternal'] });
  const has = (re) => assert.ok(errors.some((e) => re.test(e)), `thiếu lỗi ${re}\n${errors.join('\n')}`);
  has(/trigger "đọc page confluence" trùng với jira/);
  has(/knowledge\/jira\.md: reviewed phải là ngày YYYY-MM-DD/);
  has(/knowledge\/jira\.md: source "http:\/\/insecure\.example" không phải URL https/);
  has(/knowledge\/figma\.md: link tương đối hỏng/);
  has(/knowledge\/figma\.md: chứa chuỗi cấm #1/);
  has(/\.env\.example dòng \d+: FIGMA_ACCESS_TOKEN phải để trống giá trị/);
  has(/config\/project\.example\.yml: thiếu confluence\.spaceKey/);
  has(/config\/project\.example\.yml: không được có khóa chứa bí mật/);
  has(/skills\/jira\/SKILL\.md gọi API trực tiếp/);
  assert.ok(!errors.join('\n').toLowerCase().includes('acmeinternal'), 'báo cáo không được in lại chuỗi cấm');
});

test('npm script validate chạy được', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [path.join(KIT, 'scripts', 'validate-governance.js')], { env: { PATH: process.env.PATH } }).toString();
  assert.match(out, /✔ Hợp lệ/);
});
