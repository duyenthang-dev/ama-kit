// Ghi hoặc in nội dung đã qua giới hạn dữ liệu.

import fs from 'node:fs';
import path from 'node:path';
import { describeCounts, truncateSource } from './redact.js';

export function boundaryOf(project) {
  return project?.config?.dataBoundary || {};
}

/**
 * In ra stdout hoặc ghi --output. `text` đã được che ở bộ chuyển đổi; ở đây chỉ cắt theo maxSourceChars.
 * @param {Record<string, number>} counts số mục đã che, để báo trên stderr
 */
export function emit(text, { file, project, counts = {}, raw = false } = {}) {
  const res = raw ? { text, truncated: false } : truncateSource(text, boundaryOf(project));
  const body = res.text.endsWith('\n') ? res.text : res.text + '\n';
  if (file) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, body);
    console.log(`Đã ghi ${path.resolve(file)}`);
  } else {
    process.stdout.write(body);
  }
  const note = describeCounts(counts, res.truncated);
  if (note) console.error(`giới hạn dữ liệu: ${note}`);
  return res;
}

/** Ghi một file nguồn trong thư mục run; trả về ghi chú giới hạn dữ liệu (rỗng nếu không có gì). */
export function writeSource(file, text, project, counts = {}, { raw = false } = {}) {
  const res = raw ? { text, truncated: false } : truncateSource(text, boundaryOf(project));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, res.text.endsWith('\n') ? res.text : res.text + '\n');
  return describeCounts(counts, res.truncated);
}
