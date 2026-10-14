// Lấy page Confluence được gắn trong issue (remote link + URL trong mô tả/AC), ghi vào thư mục run.
// Dùng chung cho analyze-requirement và context-brief.

import path from 'node:path';
import { parseConfluenceUrl, slugify } from './links.js';
import { writeSource } from './output.js';
import { pageToMarkdown, pageUrl, pageUrls } from './page.js';
import { makeCleaner } from './redact.js';
import { rel } from './run-layout.js';

/** Các page ID cùng site trong danh sách URL (giải link rút gọn /wiki/x/...). */
export async function pageIdsFrom(urls, wiki, base, warnings) {
  const ids = [];
  for (const u of urls) {
    if (!sameSite(u, base)) continue;
    let p = parseConfluenceUrl(u);
    if (p?.tinyUrl) {
      try {
        p = parseConfluenceUrl(await wiki.resolveTinyUrl(p.tinyUrl));
      } catch (e) {
        warnings.push(`Không giải được link rút gọn ${u}: ${firstLine(e)}`);
        continue;
      }
    }
    if (p?.pageId && !ids.includes(p.pageId)) ids.push(p.pageId);
  }
  return ids;
}

/**
 * Tải và ghi các page; trả về [{ id, title, version, url, file, linkedFrom }] và danh sách URL bên trong page.
 * @param {Map<string,string[]>} linkedFrom page id → các issue gắn page đó
 */
export async function fetchPages(ids, { wiki, base, dir, project, max, warnings, notes, linkedFrom = new Map() }) {
  const pages = [];
  const innerUrls = [];
  if (ids.length > max) warnings.push(`Có ${ids.length} page được gắn; chỉ lấy ${max} page đầu (limits.maxPages).`);
  for (const id of ids.slice(0, max)) {
    try {
      const page = await wiki.getPage(id);
      const clean = makeCleaner(project.config.dataBoundary);
      const file = path.join(dir, 'confluence', `${id}-${slugify(page.title, 50)}.md`);
      const note = writeSource(file, pageToMarkdown(page, base, { clean }), project, clean.counts);
      if (note) notes[rel(dir, file)] = note;
      pages.push({ id, title: page.title, version: page.version?.number ?? null, url: pageUrl(page, base), file: rel(dir, file), linkedFrom: linkedFrom.get(id) || [] });
      innerUrls.push(...pageUrls(page));
    } catch (e) {
      warnings.push(`Confluence page ${id}: ${firstLine(e)}`);
    }
  }
  return { pages, innerUrls };
}

export function sameSite(u, base) {
  try {
    return new URL(u).host === new URL(base).host;
  } catch {
    return false;
  }
}

export const firstLine = (e) => String(e?.message || e).split('\n')[0];
