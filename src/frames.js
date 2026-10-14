// Xuất frame Figma ra PNG, cache theo version file để đỡ bị giới hạn tần suất.
// URL ảnh ký sẵn chỉ dùng để tải; manifest chỉ lưu link figma.com (không token, không chữ ký).

import fs from 'node:fs';
import path from 'node:path';
import { figmaClient } from './clients/figma.js';
import { download, redactUrl } from './http.js';
import { nodeSlug, slugify } from './links.js';
import { readJson, writeJson } from './run-layout.js';

const BATCH = 25;

/** @returns {Promise<{frames: Array<{fileKey,nodeId,name,type,file,link}>, warnings: string[], version: string|null}>} */
export async function exportFrames(fileKey, nodes, outDir, { scale = 2, force = false } = {}) {
  const api = figmaClient();
  const warnings = [];
  fs.mkdirSync(outDir, { recursive: true });
  const cacheFile = path.join(outDir, 'nodes.json');
  const cache = readJson(cacheFile) || {};
  const ids = [...new Set(nodes.map((n) => n.nodeId))];
  const label = Object.fromEntries(nodes.filter((n) => n.name).map((n) => [n.nodeId, n.name]));

  const meta = {};
  let version = null;
  for (let i = 0; i < ids.length; i += BATCH) {
    const res = await api.getNodes(fileKey, ids.slice(i, i + BATCH));
    version = res.version || version;
    Object.assign(meta, res.nodes || {});
  }

  const frames = [];
  const todo = [];
  for (const id of ids) {
    const doc = meta[id]?.document;
    if (!doc) {
      warnings.push(`Không thấy frame ${id} trong file ${fileKey} (đã xóa hoặc sai file).`);
      continue;
    }
    const name = label[id] || doc.name;
    const file = path.join(outDir, `${slugify(name, 40)}--${nodeSlug(id)}.png`);
    const entry = { fileKey, nodeId: id, name, type: doc.type, file, link: `https://www.figma.com/design/${fileKey}/?node-id=${encodeURIComponent(id.replace(':', '-'))}` };
    frames.push(entry);
    const cached = cache[`${fileKey}:${id}`];
    if (!force && cached && cached.version === version && fs.existsSync(file)) continue;
    todo.push(entry);
  }

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const res = await api.renderImages(fileKey, batch.map((f) => f.nodeId), { scale });
    if (res.err) warnings.push(`Figma báo lỗi render: ${res.err}`);
    for (const f of batch) {
      const url = res.images?.[f.nodeId];
      if (!url) {
        warnings.push(`Figma không trả ảnh cho ${f.nodeId} (${f.name}); frame có thể rỗng hoặc bị ẩn.`);
        f.file = null;
        continue;
      }
      try {
        await download(url, f.file, { label: `Ảnh Figma ${f.nodeId}` });
      } catch (e) {
        warnings.push(String(e.message).split('\n')[0].replace(url, redactUrl(url)));
        f.file = null;
        continue;
      }
      cache[`${fileKey}:${f.nodeId}`] = { version, name: f.name, file: path.basename(f.file) };
    }
  }
  writeJson(cacheFile, cache);
  return { frames: frames.filter((f) => f.file), warnings, version };
}
