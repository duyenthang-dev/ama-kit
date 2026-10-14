// Bố cục thư mục run:
//
// runs/<KEY>-<thời điểm>/            do analyze-requirement tạo
//   manifest.json                    nguồn đã lấy, cảnh báo, giới hạn dữ liệu, artifact
//   jira/issue.md                    issue (đã che dữ liệu nhạy cảm)
//   confluence/<id>-<slug>.md        page gắn trong issue
//   figma/<tên>--<node>.png          frame Figma
//   report/analysis.md, ac.json      skill analyze-requirement viết
//   report/test-strategy.md, test-plan.md, test-cases.json, test-cases.md,
//   report/traceability-objectives.md, traceability-tests.md, mobile.md, summary.md
//
// runs/<KEY>-context-<thời điểm>/    do context-brief tạo
//   manifest.json, jira/<KEY>.md (mỗi issue một file), confluence/*.md, report/context-brief.md

import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from './errors.js';

export const SUBDIRS = ['jira', 'confluence', 'figma', 'report'];

export function runsRoot(project) {
  return path.resolve(project.root, project.config.runsDir || 'runs');
}

export function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function createRun(project, issueKey, { kind = '', date } = {}) {
  const name = `${issueKey}${kind ? `-${kind}` : ''}-${stamp(date)}`;
  const dir = path.join(runsRoot(project), name);
  for (const s of SUBDIRS) fs.mkdirSync(path.join(dir, s), { recursive: true });
  return dir;
}

/** Run mới nhất của issue (kind '' = run phân tích, 'context' = context-brief). */
export function latestRun(project, issueKey, { kind = '' } = {}) {
  const root = runsRoot(project);
  if (!fs.existsSync(root)) return null;
  const prefix = `${issueKey}-${kind ? `${kind}-` : ''}`;
  const re = new RegExp(`^${escape(prefix)}\\d{4}-\\d{2}-\\d{2}T`);
  const names = fs
    .readdirSync(root)
    .filter((n) => re.test(n) && fs.statSync(path.join(root, n)).isDirectory())
    .sort();
  return names.length ? path.join(root, names[names.length - 1]) : null;
}

/** Nhận mã issue (lấy run mới nhất) hoặc đường dẫn thư mục run. */
export function resolveRun(arg, project, { kind = '' } = {}) {
  if (!arg) throw new UsageError('Cần mã issue (PROJ-123) hoặc đường dẫn thư mục run.');
  if (/^[A-Z][A-Z0-9_]+-\d+$/.test(arg)) {
    const dir = latestRun(project, arg, { kind });
    if (!dir) throw new UsageError(`Chưa có run nào cho ${arg} trong ${runsRoot(project)}. Chạy "analyze-requirement ${arg}" trước.`);
    return dir;
  }
  const dir = path.resolve(arg);
  if (!fs.existsSync(dir)) throw new UsageError(`Không thấy thư mục run: ${dir}`);
  return dir;
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new UsageError(`JSON không hợp lệ trong ${file}: ${e.message}`);
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function updateManifest(dir, patch) {
  const file = path.join(dir, 'manifest.json');
  const m = readJson(file) || {};
  const next = { ...m, ...patch, artifacts: { ...(m.artifacts || {}), ...(patch.artifacts || {}) } };
  writeJson(file, next);
  return next;
}

export const rel = (dir, f) => path.relative(dir, f).split(path.sep).join('/');

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
