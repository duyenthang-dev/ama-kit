#!/usr/bin/env node
// Adapter Cursor: đọc registry/skills.yml và rules/*.md, sinh file rule của Cursor (.mdc) vào --out.
// Nguồn chuẩn là registry, rules, skills/ và workflows/ trong repo; file sinh ra chỉ là bản dịch.
// Mỗi file sinh có "generated: true" và "source". Sửa nguồn rồi chạy lại adapter; không sửa file sinh.
// Thư mục sinh không commit. Adapter không gọi Jira, Confluence, Figma hay Appium.
//
// Dùng: node providers/cursor/adapt.js --out <thư mục>   (vd. --out .cursor/rules trong project của bạn)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry, loadRules } from '../../src/registry.js';
import { KIT_ROOT } from '../../src/root.js';
import { parseFrontmatter } from '../../src/yaml.js';

const toPosix = (p) => p.split(path.sep).join('/');

function mdc({ description, alwaysApply, source, body }) {
  // Frontmatter Cursor: description, globs, alwaysApply. generated/source để biết file sinh từ đâu.
  return [
    '---',
    `description: ${JSON.stringify(description)}`,
    'globs:',
    `alwaysApply: ${alwaysApply ? 'true' : 'false'}`,
    'generated: true',
    `source: ${source}`,
    '---',
    '',
    `<!-- File sinh bởi ama-kit providers/cursor/adapt.js từ ${source}. Đừng sửa tay: sửa nguồn rồi chạy lại adapter. -->`,
    '',
    body.trim(),
    '',
  ].join('\n');
}

/** Đổi ${CLAUDE_PLUGIN_ROOT} thành đường dẫn kit để Cursor gọi được CLI. */
function localize(text, kitRoot) {
  return text.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, toPosix(kitRoot)).replace(/\$ARGUMENTS/g, '<tham số người dùng đưa>');
}

export function adaptCursor({ out, kitRoot = KIT_ROOT } = {}) {
  if (!out) throw new Error('Cần --out <thư mục>');
  const outDir = path.resolve(out);
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];

  for (const rule of loadRules(path.join(kitRoot, 'rules'))) {
    const d = rule.data;
    const file = path.join(outDir, `ama-rule-${d.id}.mdc`);
    const source = toPosix(path.relative(kitRoot, rule.file));
    const description = `${d.title}. Áp dụng khi: ${(d.triggers || []).join(', ')}`;
    fs.writeFileSync(file, mdc({ description, alwaysApply: d.scope === 'always', source, body: localize(rule.body, kitRoot) }));
    written.push(file);
  }

  const { skills } = loadRegistry(path.join(kitRoot, 'registry', 'skills.yml'));
  for (const s of skills) {
    const skillFile = path.join(kitRoot, s.skillPath);
    const { body } = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
    const file = path.join(outDir, `ama-skill-${s.name}.mdc`);
    const header = [
      `# ${s.name}`,
      '',
      `${s.description}`,
      '',
      `Dùng khi người dùng nói: ${(s.triggers || []).join(' · ')}`,
      `Lệnh CLI: \`node ${toPosix(path.join(kitRoot, 'bin', path.basename(String(s.entrypoint).split(' ')[0]) + '.js'))} ${String(s.entrypoint).split(' ').slice(1).join(' ')}\``,
      '',
    ].join('\n');
    fs.writeFileSync(file, mdc({ description: `${s.description} Trigger: ${(s.triggers || []).join(', ')}`, alwaysApply: false, source: s.skillPath, body: header + '\n' + localize(body, kitRoot) }));
    written.push(file);
  }

  fs.writeFileSync(
    path.join(outDir, 'README.generated.md'),
    `generated: true\nsource: registry/skills.yml, rules/\n\nThư mục này do ama-kit sinh ra (providers/cursor/adapt.js). Không commit, không sửa tay.\n`
  );
  return written;
}

// Chạy trực tiếp: node providers/cursor/adapt.js --out <dir>
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = i > -1 ? process.argv[i + 1] : null;
  if (!out || process.argv.includes('--help')) {
    console.log('Dùng: node providers/cursor/adapt.js --out <thư mục>');
    process.exit(out ? 0 : 2);
  }
  const files = adaptCursor({ out });
  console.log(`Đã sinh ${files.length} file vào ${path.resolve(out)}`);
}
