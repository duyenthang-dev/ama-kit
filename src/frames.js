// Xuất frame Figma ra PNG, cache theo version file để đỡ bị giới hạn tần suất.
// URL ảnh ký sẵn chỉ dùng để tải; manifest chỉ lưu link figma.com (không token, không chữ ký).

import fs from 'node:fs';
import path from 'node:path';
import { figmaClient } from './clients/figma.js';
import { download, redactUrl } from './http.js';
import { nodeSlug, slugify } from './links.js';
import { readJson, writeJson } from './run-layout.js';

const BATCH = 25;
const CONTAINER_TYPES = new Set(['CANVAS', 'SECTION']);
const SCREEN_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);

/** @returns {Promise<{frames: Array<{fileKey,nodeId,name,type,file,link}>, warnings: string[], version: string|null}>} */
export async function exportFrames(fileKey, nodes, outDir, { scale = 2, force = false, maxFrames = 50 } = {}) {
  const api = figmaClient();
  const warnings = [];
  fs.mkdirSync(outDir, { recursive: true });
  const cacheFile = path.join(outDir, 'nodes.json');
  const cache = readJson(cacheFile) || {};
  const ids = [...new Set(nodes.map((n) => n.nodeId))];
  const label = Object.fromEntries(nodes.filter((n) => n.name).map((n) => [n.nodeId, n.name]));

  let version = null;
  const fetchMeta = async (list) => {
    const out = {};
    for (let i = 0; i < list.length; i += BATCH) {
      const res = await api.getNodes(fileKey, list.slice(i, i + BATCH));
      version = res.version || version;
      Object.assign(out, res.nodes || {});
    }
    return out;
  };
  const meta = await fetchMeta(ids);

  // Link tới page (CANVAS) hoặc section: mở rộng thành các màn hình con (tối đa 2 tầng section).
  const targets = [];
  const seen = new Set();
  const addTarget = (id, doc, parent) => {
    if (seen.has(id)) return;
    seen.add(id);
    targets.push({ id, doc, parent });
  };
  let containers = [];
  for (const id of ids) {
    const doc = meta[id]?.document;
    if (!doc) {
      warnings.push(`Không thấy frame ${id} trong file ${fileKey} (đã xóa hoặc sai file).`);
      continue;
    }
    if (CONTAINER_TYPES.has(doc.type)) containers.push({ doc, path: [label[id] || doc.name] });
    else addTarget(id, doc, null);
  }
  // Đã có link tới màn hình cụ thể thì không mở rộng page/section (link section thường là link cũ, quá rộng).
  if (targets.length && containers.length) {
    warnings.push(
      `Bỏ qua ${containers.map((c) => `"${c.path.join(' / ')}"`).join(', ')} (page/section) vì đã có link tới màn hình cụ thể. Gỡ link page/section khỏi issue nếu không cần.`
    );
    containers = [];
  }
  for (let depth = 0; depth < 2 && containers.length; depth++) {
    const nested = [];
    for (const { doc, path: trail } of containers) {
      const kids = doc.children || [];
      const screens = kids.filter((k) => SCREEN_TYPES.has(k.type));
      for (const k of screens) addTarget(k.id, k, trail.join(' / '));
      for (const k of kids.filter((k) => CONTAINER_TYPES.has(k.type))) nested.push({ id: k.id, path: [...trail, k.name] });
      if (!screens.length && !kids.some((k) => CONTAINER_TYPES.has(k.type))) warnings.push(`"${trail.join(' / ')}" không có frame nào bên trong.`);
    }
    if (!nested.length) break;
    const more = await fetchMeta(nested.map((n) => n.id));
    containers = nested.filter((n) => more[n.id]?.document).map((n) => ({ doc: more[n.id].document, path: n.path }));
  }
  if (targets.length > maxFrames) {
    warnings.push(`Page/section có ${targets.length} màn hình; chỉ xuất ${maxFrames} màn đầu (limits.maxFrames).`);
    targets.length = maxFrames;
  }

  const frames = [];
  const todo = [];
  for (const { id, doc, parent } of targets) {
    const name = label[id] || doc.name;
    const file = path.join(outDir, `${slugify(name, 40)}--${nodeSlug(id)}.png`);
    const entry = { fileKey, nodeId: id, name, ...(parent ? { parent } : {}), type: doc.type, file, link: `https://www.figma.com/design/${fileKey}/?node-id=${encodeURIComponent(id.replace(':', '-'))}` };
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
