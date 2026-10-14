// Config dự án (không chứa token). Mẫu: config/project.example.yml.
// Thứ tự tìm:
//   1. --config <file>
//   2. biến AMA_PROJECT_CONFIG
//   3. .ama/project.yml trong thư mục hiện tại hoặc thư mục cha (dùng khi cài kit như plugin)
//   4. config/project.yml trong thư mục hiện tại
//   5. config/project.yml trong thư mục kit (khi chạy trực tiếp từ repo kit)

import fs from 'node:fs';
import path from 'node:path';
import { lookupCredential } from './credentials.js';
import { MissingEnvError, UsageError } from './errors.js';
import { KIT_ROOT } from './root.js';
import { parseYaml, YamlError } from './yaml.js';

export const DEFAULTS = {
  project: { key: '' },
  jira: { site: '', acceptanceCriteriaField: null },
  confluence: { site: '', spaceKey: '' },
  figma: { fileKey: '', frames: [] },
  mobile: {
    platform: 'android',
    cloud: 'browserstack',
    appPath: '',
    device: { name: 'Google Pixel 8', platformVersion: '14.0' },
    wdioConfig: '',
  },
  runsDir: 'runs',
  dataBoundary: { maxSourceChars: 120000, extraRedact: [] },
  limits: { maxPages: 10, maxFrames: 20, maxRelatedIssues: 25 },
};

export function findProjectConfig(explicit, cwd = process.cwd()) {
  if (explicit) return path.resolve(explicit);
  if (process.env.AMA_PROJECT_CONFIG) return path.resolve(process.env.AMA_PROJECT_CONFIG);
  let dir = path.resolve(cwd);
  for (;;) {
    const p = path.join(dir, '.ama', 'project.yml');
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const p of [path.join(cwd, 'config', 'project.yml'), path.join(KIT_ROOT, 'config', 'project.yml')]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** @returns {{ file: string|null, root: string, config: typeof DEFAULTS }} */
export function loadProject({ configPath, required = false } = {}) {
  const file = findProjectConfig(configPath);
  if (!file || !fs.existsSync(file)) {
    if (required || configPath) {
      throw new UsageError(
        `Không tìm thấy config dự án${configPath ? ` ${configPath}` : ''}. Chép config/project.example.yml thành .ama/project.yml (hoặc config/project.yml) rồi điền, hoặc chạy "workflow init".`
      );
    }
    return { file: null, root: process.cwd(), config: structuredClone(DEFAULTS) };
  }
  let parsed;
  try {
    parsed = parseYaml(fs.readFileSync(file, 'utf8')) || {};
  } catch (e) {
    throw new UsageError(`Config ${file} không đọc được: ${e instanceof YamlError ? e.message : e}`);
  }
  // .ama/project.yml → gốc là thư mục chứa .ama; config/project.yml → gốc là thư mục chứa config
  const root = path.dirname(path.dirname(file));
  return { file, root, config: deepMerge(structuredClone(DEFAULTS), parsed) };
}

function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = deepMerge(base[k], v);
    } else if (v !== null && v !== undefined) {
      base[k] = v;
    }
  }
  return base;
}

/** "your-site.atlassian.net" hoặc URL đầy đủ → "https://your-site.atlassian.net". */
export function normalizeSite(site) {
  if (!site) return '';
  const s = String(site).trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(s) ? s : `https://${s}`;
}

/** Site Atlassian: config (jira.site / confluence.site) trước, rồi ATLASSIAN_SITE. */
export function atlassianSite(project, product = 'jira') {
  const fromConfig = project?.config?.[product]?.site || project?.config?.jira?.site;
  const site = fromConfig || lookupCredential('ATLASSIAN_SITE').value;
  if (!site) throw new MissingEnvError(['ATLASSIAN_SITE'], `Hoặc đặt ${product}.site trong config dự án.`);
  return normalizeSite(site);
}

export function projectFrames(project) {
  const frames = project?.config?.figma?.frames || [];
  if (!Array.isArray(frames)) throw new UsageError('figma.frames phải là danh sách { nodeId, name }.');
  return frames.map((f, i) => {
    if (!f || !f.nodeId) throw new UsageError(`figma.frames[${i}] thiếu nodeId.`);
    return { nodeId: String(f.nodeId), name: f.name ? String(f.name) : String(f.nodeId) };
  });
}
