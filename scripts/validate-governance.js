#!/usr/bin/env node
// Kiểm tra quản trị kit. Chạy: node scripts/validate-governance.js  (hoặc: workflow validate)
//
//  1. registry/skills.yml: field bắt buộc, entrypoint có file bin/, skillPath có SKILL.md, trigger không trùng
//  2. mọi SKILL.md trong skills/ và workflows/ đều có trong registry; SKILL.md không tự gọi REST
//  3. rules/*.md: frontmatter id, title, scope (always|on-demand), triggers; đủ ba rule bắt buộc
//  4. knowledge/*.md: frontmatter title, topic, reviewed (YYYY-MM-DD), sources (URL https)
//  5. link tương đối và ${CLAUDE_PLUGIN_ROOT}/... trong Markdown trỏ tới file có thật
//  6. config/project.example.yml đọc được, đủ khóa, không chứa token; .env.example chỉ có tên biến, giá trị rỗng
//  7. chuỗi cấm (tên nội bộ, domain nội bộ) không xuất hiện trong mã nguồn và knowledge.
//     Danh sách lấy từ config/banned-terms.txt (gitignore, mỗi dòng một chuỗi) và biến AMA_BANNED_TERMS
//     (phân tách bằng dấu phẩy). Không ghi cứng chuỗi cấm vào repo: chính danh sách đó sẽ làm lộ chúng.
//  8. không có token thật trong repo

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY_FIELDS, RULE_FIELDS } from '../src/registry.js';
import { KIT_ROOT } from '../src/root.js';
import { parseFrontmatter, parseYaml } from '../src/yaml.js';

const REQUIRED_RULES = ['credential-protection', 'confirm-before-write', 'agent-data-boundary'];
const REQUIRED_ENV = ['ATLASSIAN_SITE', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN', 'FIGMA_ACCESS_TOKEN', 'BROWSERSTACK_USERNAME', 'BROWSERSTACK_ACCESS_KEY'];
const REQUIRED_CONFIG = ['project.key', 'jira.site', 'confluence.site', 'confluence.spaceKey', 'figma.fileKey', 'figma.frames', 'mobile.platform', 'mobile.appPath', 'mobile.device.name', 'mobile.device.platformVersion'];
const SCAN_DIRS = ['bin', 'src', 'scripts', 'providers', 'registry', 'rules', 'knowledge', 'skills', 'workflows', 'config', 'test'];
const DIRECT_API = /\bcurl\s|\bfetch\(|\/rest\/api\/|\/wiki\/api\/|api\.figma\.com|api-cloud\.browserstack\.com|hub-cloud\.browserstack\.com/;
const SECRET_PATTERNS = [/ATATT3[A-Za-z0-9_\-=]{20,}/, /figd_[A-Za-z0-9_\-]{20,}/, /\b(?:ATLASSIAN_API_TOKEN|FIGMA_ACCESS_TOKEN|BROWSERSTACK_ACCESS_KEY)[ \t]*=[ \t]*[A-Za-z0-9_\-]{8,}/];

export function validateGovernance({ root = KIT_ROOT, bannedTerms } = {}) {
  const errors = [];
  const warnings = [];
  const checked = {};
  const p = (...x) => path.join(root, ...x);
  const relp = (f) => path.relative(root, f).split(path.sep).join('/');
  const read = (f) => fs.readFileSync(f, 'utf8');

  // 1. registry
  let skills = [];
  try {
    skills = parseYaml(read(p('registry', 'skills.yml')))?.skills || [];
  } catch (e) {
    errors.push(`registry/skills.yml: ${e.message}`);
  }
  const triggerOwner = new Map();
  const names = new Set();
  skills.forEach((s, i) => {
    const at = `registry/skills.yml skills[${i}]${s?.name ? ` (${s.name})` : ''}`;
    for (const f of REGISTRY_FIELDS) {
      const v = s?.[f];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length && !['inputs', 'outputs'].includes(f));
      if (empty) errors.push(`${at}: thiếu ${f}`);
    }
    for (const f of ['triggers', 'capabilities', 'inputs', 'outputs']) if (s?.[f] !== undefined && !Array.isArray(s[f])) errors.push(`${at}: ${f} phải là danh sách`);
    if (s?.name) {
      if (names.has(s.name)) errors.push(`${at}: tên trùng`);
      names.add(s.name);
    }
    for (const t of s?.triggers || []) {
      const k = String(t).trim().toLowerCase();
      if (triggerOwner.has(k)) errors.push(`${at}: trigger "${t}" trùng với ${triggerOwner.get(k)}`);
      else triggerOwner.set(k, s.name);
    }
    if (s?.entrypoint) {
      const cmd = String(s.entrypoint).split(/\s+/)[0];
      if (!fs.existsSync(p('bin', `${cmd}.js`))) errors.push(`${at}: entrypoint "${cmd}" không có bin/${cmd}.js`);
    }
    if (s?.skillPath) {
      const f = p(s.skillPath);
      if (!fs.existsSync(f)) errors.push(`${at}: skillPath ${s.skillPath} không tồn tại`);
      else {
        const { data } = parseFrontmatter(read(f));
        if (!data?.name || !data?.description) errors.push(`${s.skillPath}: frontmatter cần name và description`);
        else if (data.name !== s.name) errors.push(`${s.skillPath}: name "${data.name}" khác registry "${s.name}"`);
      }
    }
  });
  checked.skills = skills.length;

  // 2. SKILL.md đăng ký đủ, không gọi REST trực tiếp
  const registered = new Set(skills.map((s) => path.normalize(String(s.skillPath || ''))));
  for (const base of ['skills', 'workflows']) {
    if (!fs.existsSync(p(base))) continue;
    for (const d of fs.readdirSync(p(base))) {
      const f = p(base, d, 'SKILL.md');
      if (!fs.existsSync(f)) continue;
      if (!registered.has(path.normalize(`${base}/${d}/SKILL.md`))) errors.push(`${base}/${d}/SKILL.md chưa có trong registry/skills.yml`);
      const { body } = parseFrontmatter(read(f));
      const m = body.match(DIRECT_API);
      if (m) errors.push(`${base}/${d}/SKILL.md gọi API trực tiếp ("${m[0].trim()}"); skill phải gọi CLI`);
    }
  }

  // 3. rules
  const ruleIds = new Set();
  const rulesDir = p('rules');
  for (const f of fs.existsSync(rulesDir) ? fs.readdirSync(rulesDir).filter((x) => x.endsWith('.md')) : []) {
    const { data } = parseFrontmatter(read(path.join(rulesDir, f)));
    if (!data) {
      errors.push(`rules/${f}: thiếu frontmatter`);
      continue;
    }
    for (const k of RULE_FIELDS) if (data[k] === undefined || data[k] === null || data[k] === '') errors.push(`rules/${f}: thiếu ${k}`);
    if (data.scope && !['always', 'on-demand'].includes(data.scope)) errors.push(`rules/${f}: scope phải là always hoặc on-demand`);
    if (data.triggers && !Array.isArray(data.triggers)) errors.push(`rules/${f}: triggers phải là danh sách`);
    if (data.id) {
      if (ruleIds.has(data.id)) errors.push(`rules/${f}: id "${data.id}" trùng`);
      ruleIds.add(data.id);
    }
  }
  for (const id of REQUIRED_RULES) if (!ruleIds.has(id)) errors.push(`Thiếu rule bắt buộc: ${id}`);
  checked.rules = ruleIds.size;

  // 4. knowledge
  const kDir = p('knowledge');
  const kFiles = fs.existsSync(kDir) ? fs.readdirSync(kDir).filter((x) => x.endsWith('.md')) : [];
  for (const f of kFiles) {
    const { data } = parseFrontmatter(read(path.join(kDir, f)));
    const at = `knowledge/${f}`;
    if (!data) {
      errors.push(`${at}: thiếu frontmatter`);
      continue;
    }
    for (const k of ['title', 'topic', 'reviewed', 'sources']) if (!data[k]) errors.push(`${at}: thiếu ${k}`);
    if (data.reviewed) {
      const s = String(data.reviewed);
      const t = Date.parse(s);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(t)) errors.push(`${at}: reviewed phải là ngày YYYY-MM-DD`);
      else if (t > Date.now() + 86400000) errors.push(`${at}: reviewed ở tương lai`);
      else if (Date.now() - t > 365 * 86400000) warnings.push(`${at}: rà soát lần cuối hơn một năm trước`);
    }
    if (data.sources !== undefined) {
      if (!Array.isArray(data.sources) || !data.sources.length) errors.push(`${at}: sources phải là danh sách không rỗng`);
      else for (const u of data.sources) if (!/^https:\/\/[^\s]+$/.test(String(u))) errors.push(`${at}: source "${u}" không phải URL https`);
    }
  }
  checked.knowledge = kFiles.length;

  // 5. link tương đối trong Markdown
  const mdFiles = walk(root).filter((f) => f.endsWith('.md') && !f.includes(`${path.sep}node_modules${path.sep}`));
  for (const f of mdFiles) {
    const text = read(f);
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#|<)/.test(target)) continue;
      const clean = decodeURI(target.split('#')[0]);
      if (!clean) continue;
      if (!fs.existsSync(path.resolve(path.dirname(f), clean))) errors.push(`${relp(f)}: link tương đối hỏng → ${target}`);
    }
    for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g)) {
      const ref = m[1].replace(/[.,)`]+$/, '');
      if (!fs.existsSync(p(ref))) errors.push(`${relp(f)}: \${CLAUDE_PLUGIN_ROOT}/${ref} không tồn tại`);
    }
  }
  checked.markdown = mdFiles.length;

  // 6. config mẫu và .env.example
  const ex = p('config', 'project.example.yml');
  if (!fs.existsSync(ex)) errors.push('Thiếu config/project.example.yml');
  else {
    try {
      const cfg = parseYaml(read(ex)) || {};
      for (const k of REQUIRED_CONFIG) {
        const v = k.split('.').reduce((o, part) => (o == null ? undefined : o[part]), cfg);
        if (v === undefined) errors.push(`config/project.example.yml: thiếu ${k}`);
      }
      const bad = JSON.stringify(cfg).match(/"(?:[^"]*(?:token|password|secret|access_?key)[^"]*)"\s*:/i);
      if (bad) errors.push(`config/project.example.yml: không được có khóa chứa bí mật (${bad[0]})`);
      if (!Array.isArray(cfg.figma?.frames) || cfg.figma.frames.some((x) => !x || !('nodeId' in x) || !('name' in x))) errors.push('config/project.example.yml: figma.frames phải là danh sách { nodeId, name }');
    } catch (e) {
      errors.push(`config/project.example.yml: ${e.message}`);
    }
  }
  const envEx = p('.env.example');
  if (!fs.existsSync(envEx)) errors.push('Thiếu .env.example');
  else {
    const seen = new Set();
    read(envEx)
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (!line.trim() || line.trim().startsWith('#')) return;
        const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
        if (!m) errors.push(`.env.example dòng ${i + 1}: chỉ dùng TÊN_BIẾN=`);
        else {
          seen.add(m[1]);
          if (m[2].trim()) errors.push(`.env.example dòng ${i + 1}: ${m[1]} phải để trống giá trị`);
        }
      });
    for (const k of REQUIRED_ENV) if (!seen.has(k)) errors.push(`.env.example thiếu ${k}`);
  }

  // 7. chuỗi cấm
  const terms = bannedTerms ?? loadBannedTerms(root);
  const scan = [...SCAN_DIRS.flatMap((d) => (fs.existsSync(p(d)) ? walk(p(d)) : [])), p('README.md')].filter(
    (f) => fs.existsSync(f) && /\.(js|mjs|md|yml|yaml|json|txt)$/.test(f) && path.basename(f) !== 'banned-terms.txt'
  );
  if (!terms.length) warnings.push('Chưa có danh sách chuỗi cấm (config/banned-terms.txt hoặc AMA_BANNED_TERMS): bỏ qua kiểm tra tên/domain nội bộ.');
  for (const f of scan) {
    const text = read(f).toLowerCase();
    for (const t of terms) if (text.includes(t.toLowerCase())) errors.push(`${relp(f)}: chứa chuỗi cấm #${terms.indexOf(t) + 1} (xem danh sách chuỗi cấm local)`);
  }
  checked.bannedTerms = terms.length;

  // 8. token thật
  for (const f of walk(root)) {
    if (!/\.(js|mjs|md|yml|yaml|json|txt|env|example)$/.test(f) || f.includes(`${path.sep}node_modules${path.sep}`)) continue;
    const text = read(f);
    for (const re of SECRET_PATTERNS) if (re.test(text)) errors.push(`${relp(f)}: có thể chứa token thật`);
  }

  return { errors, warnings, checked };
}

export function loadBannedTerms(root = KIT_ROOT) {
  const terms = [];
  const f = path.join(root, 'config', 'banned-terms.txt');
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith('#')) terms.push(t);
    }
  }
  for (const t of String(process.env.AMA_BANNED_TERMS || '').split(',')) if (t.trim()) terms.push(t.trim());
  return [...new Set(terms)];
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.git', 'runs', '.ama'].includes(e.name) || e.name.startsWith('.cursor')) return [];
    const f = path.join(dir, e.name);
    return e.isDirectory() ? walk(f) : [f];
  });
}

export function printReport({ errors, warnings, checked }) {
  console.log(`Đã kiểm: ${checked.skills ?? 0} skill, ${checked.rules ?? 0} rule, ${checked.knowledge ?? 0} bài knowledge, ${checked.markdown ?? 0} file Markdown, ${checked.bannedTerms ?? 0} chuỗi cấm`);
  for (const e of errors) console.log(`  ✘ ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log(errors.length ? `\n${errors.length} lỗi.` : '\n✔ Hợp lệ.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = validateGovernance();
  printReport(res);
  process.exit(res.errors.length ? 1 : 0);
}
