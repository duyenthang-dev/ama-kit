// URL parsing for Confluence pages and Figma frames.

/** Returns { pageId } | { tinyUrl } | null for a Confluence URL. */
export function parseConfluenceUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/\/wiki\//.test(u.pathname)) return null;
  const m = u.pathname.match(/\/pages\/(?:edit-v2\/|edit\/)?(\d+)/);
  if (m) return { pageId: m[1] };
  const q = u.searchParams.get('pageId');
  if (q && /^\d+$/.test(q)) return { pageId: q };
  if (/\/wiki\/x\//.test(u.pathname)) return { tinyUrl: url };
  return null;
}

/** Returns { fileKey, nodeId|null } for a Figma URL, else null. */
export function parseFigmaUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)figma\.com$/.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/(?:file|design|proto|board|make)\/([A-Za-z0-9]+)(?:\/[^/]*)?(?:\/branch\/([A-Za-z0-9]+))?/);
  if (!m) return null;
  const fileKey = m[2] || m[1];
  const raw = u.searchParams.get('node-id');
  return { fileKey, nodeId: raw ? normalizeNodeId(raw) : null };
}

export function normalizeNodeId(id) {
  const s = decodeURIComponent(String(id)).trim();
  // URL form uses "-" (1-2), API form uses ":" (1:2). Instance ids like I1:2;3:4 keep their structure.
  return /^\d+-\d+$/.test(s) ? s.replace('-', ':') : s;
}

/** Turns "1:2" into a filesystem-safe slug. */
export function nodeSlug(id) {
  return String(id).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function slugify(s, max = 60) {
  return (
    String(s)
      .replace(/[đĐ]/g, 'd')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, max) || 'untitled'
  );
}

export function isIssueKey(s) {
  return /^[A-Z][A-Z0-9_]+-\d+$/.test(s);
}
