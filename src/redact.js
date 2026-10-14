// Giới hạn dữ liệu đưa cho agent. Xem rules/agent-data-boundary.md.
// Luôn che: token/bí mật, email, số tài khoản (và số thẻ). Có thể thêm 'phones' qua dataBoundary.extraRedact.
// Chỉ áp dụng cho NỘI DUNG lấy về (mô tả, AC, thân page), không cho metadata kit tự sinh (ID page, khóa issue).

const PATTERNS = {
  tokens: [
    [/\bATATT[A-Za-z0-9_\-=]{20,}/g, '[ĐÃ CHE:token]'],
    [/\bfigd_[A-Za-z0-9_\-]{20,}/g, '[ĐÃ CHE:token]'],
    [/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, '[ĐÃ CHE:token]'],
    [/\bAKIA[0-9A-Z]{16}\b/g, '[ĐÃ CHE:token]'],
    [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[ĐÃ CHE:token]'],
    [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[ĐÃ CHE:token]'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[ĐÃ CHE:private-key]'],
    [/\b(Bearer|Basic)\s+[A-Za-z0-9._\-+/=]{16,}/g, (m, kind) => `${kind} [ĐÃ CHE:token]`],
    [/((?:password|passwd|pwd|mật khẩu|secret|api[_-]?key|access[_-]?key|token)\s*[:=]\s*)(["']?)[^\s"'<>]{6,}\2/gi, (m, pre) => `${pre}[ĐÃ CHE]`],
  ],
  emails: [[/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[ĐÃ CHE:email]']],
  // 8–19 chữ số (có thể nhóm bằng khoảng trắng/gạch), không dính vào chữ, URL, đường dẫn hay ngày tháng.
  accounts: [[/(?<![\w/.=:#+-])\+?\d(?:[ -]?\d){7,18}(?![\w/.:-])/g, (m) => (/^\d{4}-\d{2}-\d{2}$/.test(m) ? m : '[ĐÃ CHE:số tài khoản]')]],
  phones: [[/(?<![\w/.-])\+\d[\d ().-]{7,}\d(?![\w/.-])/g, '[ĐÃ CHE:số điện thoại]']],
};

export const ALWAYS = ['tokens', 'emails', 'accounts'];
export const REDACTION_KINDS = Object.keys(PATTERNS);

/**
 * @param {string} text
 * @param {{ extraRedact?: string[], maxSourceChars?: number }} boundary
 * @returns {{ text: string, counts: Record<string, number>, truncated: boolean }}
 */
export function applyBoundary(text, boundary = {}) {
  const kinds = [...new Set([...ALWAYS, ...(boundary.extraRedact || [])])];
  const counts = {};
  let out = String(text ?? '');
  for (const kind of kinds) {
    for (const [re, rep] of PATTERNS[kind] || []) {
      out = out.replace(re, (...args) => {
        const m = args[0];
        const replaced = typeof rep === 'function' ? rep(...args) : rep;
        if (replaced !== m) counts[kind] = (counts[kind] || 0) + 1;
        return replaced;
      });
    }
  }
  const max = boundary.maxSourceChars ?? 120000;
  let truncated = false;
  if (max > 0 && out.length > max) {
    const dropped = out.length - max;
    out = out.slice(0, max) + `\n\n> [ĐÃ CẮT theo giới hạn dữ liệu: bỏ ${dropped} ký tự. Tăng dataBoundary.maxSourceChars nếu cần.]\n`;
    truncated = true;
  }
  return { text: out, counts, truncated };
}

/** Bộ đếm + hàm che dùng trong bộ chuyển đổi: chỉ che, không cắt. */
export function makeCleaner(boundary = {}) {
  const counts = {};
  const clean = (text) => {
    const r = applyBoundary(text, { ...boundary, maxSourceChars: 0 });
    for (const [k, n] of Object.entries(r.counts)) counts[k] = (counts[k] || 0) + n;
    return r.text;
  };
  clean.counts = counts;
  return clean;
}

export function describeCounts(counts, truncated = false) {
  const parts = Object.entries(counts).map(([k, n]) => `che ${n} ${k}`);
  if (truncated) parts.push('đã cắt bớt');
  return parts.join(', ');
}

/** Cắt theo maxSourceChars (sau khi đã che). */
export function truncateSource(text, boundary = {}) {
  const r = applyBoundary(text, { ...boundary, extraRedact: [], maxSourceChars: boundary.maxSourceChars ?? 120000 });
  // applyBoundary luôn che ALWAYS; văn bản đã được che nên không đổi thêm.
  return { text: r.text, truncated: r.truncated };
}
