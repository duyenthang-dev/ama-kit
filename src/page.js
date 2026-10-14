// Page Confluence v2 → Markdown. Macro không đọc được bị bỏ, kèm một dòng ghi chú.

import { adfToMarkdown, collectUrls } from './adf.js';
import { storageToMarkdown } from './storage.js';

export function pageUrl(page, base) {
  const webui = page?._links?.webui;
  if (!webui) return `${base}/wiki/pages/viewpage.action?pageId=${page.id}`;
  return (page._links.base || `${base}/wiki`) + webui;
}

export function pageBodyMarkdown(page) {
  if (page._format === 'storage' || !page.body?.atlas_doc_format) return storageToMarkdown(page.body?.storage?.value || '');
  return adfToMarkdown(page.body.atlas_doc_format.value);
}

export function pageUrls(page) {
  if (page.body?.atlas_doc_format?.value) {
    try {
      return collectUrls(JSON.parse(page.body.atlas_doc_format.value));
    } catch {}
  }
  return collectUrls(page.body?.storage?.value || '');
}

/** clean: hàm che dữ liệu cho thân page (không áp dụng cho tiêu đề phụ do kit sinh). */
export function pageToMarkdown(page, base, { clean = (s) => s } = {}) {
  const head = [
    `# ${clean(page.title || '')}`,
    '',
    `- **Page ID:** ${page.id}`,
    `- **Version:** ${page.version?.number ?? '?'}${page.version?.createdAt ? ` (${page.version.createdAt})` : ''}`,
    `- **Link:** ${pageUrl(page, base)}`,
    '',
    '---',
    '',
  ];
  return head.join('\n') + clean(pageBodyMarkdown(page));
}
