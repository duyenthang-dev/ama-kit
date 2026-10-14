// fetch có retry (429/5xx, theo Retry-After). Lỗi → ApiError (exit 1). Không bao giờ in header hay token.

import fs from 'node:fs';
import { ApiError } from './errors.js';

export function basicAuth(user, secret) {
  return 'Basic ' + Buffer.from(`${user}:${secret}`).toString('base64');
}

const RETRYABLE = new Set([429, 502, 503, 504]);

export async function request(url, { method = 'GET', headers = {}, body, json = true, retries = 3, label } = {}) {
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetch(url, { method, headers, body });
    } catch (e) {
      if (attempt < retries) {
        attempt++;
        await sleep(500 * attempt);
        continue;
      }
      throw new ApiError(`${label || 'Request'} thất bại: không kết nối được ${hostOf(url)} (${e.cause?.code || e.message})`);
    }
    if (RETRYABLE.has(res.status) && attempt < retries) {
      attempt++;
      const ra = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 1000 * 2 ** attempt;
      process.stderr.write(`… ${label || 'request'} nhận HTTP ${res.status}, thử lại sau ${Math.round(wait / 1000)}s\n`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {}
      throw new ApiError(`${label || 'Request'} thất bại: HTTP ${res.status} tại ${redactUrl(url)}\n${hintFor(res.status)}${detail ? `\nPhản hồi: ${detail}` : ''}`, res.status);
    }
    if (!json) return res;
    if (res.status === 204) return null;
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError(`${label || 'Request'}: phản hồi không phải JSON từ ${hostOf(url)}`);
    }
  }
}

export async function download(url, file, { headers = {}, label } = {}) {
  const res = await request(url, { headers, json: false, label });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf.length;
}

function hintFor(status) {
  switch (status) {
    case 401:
      return 'Gợi ý: credential bị từ chối. Kiểm tra bằng "workflow doctor".';
    case 403:
      return 'Gợi ý: token hợp lệ nhưng không có quyền với tài nguyên này.';
    case 404:
      return 'Gợi ý: không tồn tại, hoặc tài khoản không thấy được.';
    case 429:
      return 'Gợi ý: bị giới hạn tần suất. Chờ rồi thử lại; Figma gói thấp giới hạn chặt.';
    default:
      return '';
  }
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'máy chủ';
  }
}

/** Bỏ query string (URL ký sẵn của Figma/S3 chứa chữ ký) trước khi in. */
export function redactUrl(url) {
  try {
    const u = new URL(url);
    if (u.search) u.search = '?…';
    return u.toString();
  } catch {
    return '[url]';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
