// Fallback converter for Confluence "storage" (XHTML) bodies.
// The kit prefers atlas_doc_format (ADF); this only runs when a page has no ADF body.

export function storageToMarkdown(html) {
  if (!html) return '';
  let s = html;
  // Code macros
  s = s.replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/g, (_, code) => `\n\n\`\`\`\n${code}\n\`\`\`\n\n`);
  // Info/note/warning panels → keep body
  s = s.replace(/<ac:structured-macro[^>]*ac:name="(info|note|warning|tip)"[^>]*>[\s\S]*?<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>[\s\S]*?<\/ac:structured-macro>/g, (_, kind, body) => `\n\n> **${kind.toUpperCase()}:** ${body}\n\n`);
  // Other macros → placeholder
  s = s.replace(/<ac:structured-macro[^>]*ac:name="([^"]+)"[^>]*\/>/g, '\n\n> Đã bỏ macro "$1": không đọc được qua API.\n\n');
  s = s.replace(/<ac:structured-macro[^>]*ac:name="([^"]+)"[^>]*>[\s\S]*?<\/ac:structured-macro>/g, '\n\n> Đã bỏ macro "$1": không đọc được qua API.\n\n');
  // Links
  s = s.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, text) => `[${strip(text) || href}](${href})`);
  s = s.replace(/<ri:attachment ri:filename="([^"]+)"[^>]*\/>/g, '[attachment: $1]');
  // Headings
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g, (_, l, t) => `\n\n${'#'.repeat(Number(l))} ${strip(t)}\n\n`);
  // Tables
  s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/g, (_, t) => '\n\n' + table(t) + '\n\n');
  // Lists
  s = s.replace(/<li[^>]*>/g, '\n- ').replace(/<\/li>/g, '');
  s = s.replace(/<\/?(ul|ol)[^>]*>/g, '\n');
  // Inline
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, '**$2**').replace(/<(em|i)>([\s\S]*?)<\/\1>/g, '_$2_').replace(/<code>([\s\S]*?)<\/code>/g, '`$1`');
  s = s.replace(/<br\s*\/?>/g, '  \n').replace(/<\/p>/g, '\n\n').replace(/<hr\s*\/?>/g, '\n\n---\n\n');
  s = strip(s);
  return s.replace(/[ \t]+\n/g, (m) => (m.startsWith('  ') ? '  \n' : '\n')).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function table(inner) {
  const rows = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
    [...r[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t\1>/g)].map((c) => strip(c[2]).replace(/\s*\n\s*/g, '<br>').replace(/\|/g, '\\|'))
  );
  if (!rows.length) return '';
  const w = Math.max(...rows.map((r) => r.length));
  const pad = (r) => [...r, ...Array(w - r.length).fill('')];
  const line = (r) => `| ${pad(r).join(' | ')} |`;
  return [line(rows[0]), line(Array(w).fill('---')), ...rows.slice(1).map(line)].join('\n');
}

function strip(s) {
  return decode(s.replace(/<[^>]+>/g, ''));
}

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}
