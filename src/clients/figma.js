// Figma REST API. Tài liệu: https://www.figma.com/developers/api
// URL ảnh do /v1/images trả về là URL ký sẵn, hết hạn: chỉ dùng để tải, không bao giờ ghi vào báo cáo.

import { requireCredentials, SERVICE_KEYS } from '../credentials.js';
import { request } from '../http.js';

export function figmaClient() {
  const base = (process.env.FIGMA_API_BASE || 'https://api.figma.com').replace(/\/+$/, '');
  const { FIGMA_ACCESS_TOKEN } = requireCredentials(SERVICE_KEYS.figma, 'Tạo personal access token trong Figma: Settings → Security (scope: File content read).');
  const headers = { 'X-Figma-Token': FIGMA_ACCESS_TOKEN, Accept: 'application/json' };
  const get = (p, label) => request(base + p, { headers, label });
  const ids = (list) => encodeURIComponent(list.join(','));

  return {
    me: () => get('/v1/me', 'Figma'),
    getNodes: (fileKey, list) => get(`/v1/files/${fileKey}/nodes?ids=${ids(list)}&depth=1`, `Figma nodes ${fileKey}`),
    renderImages: (fileKey, list, { format = 'png', scale = 2 } = {}) =>
      get(`/v1/images/${fileKey}?ids=${ids(list)}&format=${format}&scale=${scale}`, `Figma render ${fileKey}`),
  };
}
