// Đọc registry/skills.yml và rules/*.md (frontmatter). Dùng cho "workflow skills|rules|validate" và adapter.

import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from './errors.js';
import { kitPath } from './root.js';
import { parseFrontmatter, parseYaml } from './yaml.js';

export const REGISTRY_FIELDS = ['name', 'description', 'triggers', 'entrypoint', 'skillPath', 'capabilities', 'inputs', 'outputs'];
export const RULE_FIELDS = ['id', 'title', 'scope', 'triggers'];

export function loadRegistry(file = kitPath('registry', 'skills.yml')) {
  if (!fs.existsSync(file)) throw new UsageError(`Không thấy registry: ${file}`);
  const data = parseYaml(fs.readFileSync(file, 'utf8')) || {};
  const skills = Array.isArray(data.skills) ? data.skills : [];
  return { file, version: data.version ?? null, skills };
}

export function loadRules(dir = kitPath('rules')) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const file = path.join(dir, f);
      const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
      return { file, data: data || {}, body };
    });
}
