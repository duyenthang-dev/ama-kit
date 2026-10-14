// Atlassian Document Format (ADF) <-> Markdown.
// Jira Cloud REST v3 and Confluence v2 (body-format=atlas_doc_format) both use ADF.

// ---------------- ADF -> Markdown ----------------

export function adfToMarkdown(doc) {
  if (doc == null) return '';
  if (typeof doc === 'string') {
    // Some fields (or Jira v2-style fields) are plain strings already.
    try {
      doc = JSON.parse(doc);
    } catch {
      return doc;
    }
  }
  const out = blocks(doc.content || (Array.isArray(doc) ? doc : [doc]), { indent: '' });
  return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function blocks(nodes = [], ctx) {
  return nodes
    .map((n) => block(n, ctx))
    .filter((s) => s !== '')
    .join('\n\n');
}

function block(node, ctx) {
  const c = node.content || [];
  const a = node.attrs || {};
  switch (node.type) {
    case 'doc':
    case 'layoutSection':
    case 'layoutColumn':
      return blocks(c, ctx);
    case 'paragraph':
      return prefixLines(inline(c), ctx.indent);
    case 'heading':
      return `${'#'.repeat(Math.min(Math.max(a.level || 1, 1), 6))} ${inline(c)}`;
    case 'bulletList':
      return list(c, ctx, () => '- ');
    case 'orderedList': {
      const start = a.order || 1;
      return list(c, ctx, (i) => `${start + i}. `);
    }
    case 'taskList':
      return c
        .map((item) => {
          const box = item.attrs?.state === 'DONE' ? '[x]' : '[ ]';
          return `${ctx.indent}- ${box} ${inline(item.content || [])}`;
        })
        .join('\n');
    case 'decisionList':
      return c.map((item) => `${ctx.indent}- **Decision:** ${inline(item.content || [])}`).join('\n');
    case 'codeBlock': {
      const text = c.map((t) => t.text || '').join('');
      return prefixLines('```' + (a.language || '') + '\n' + text + '\n```', ctx.indent);
    }
    case 'blockquote':
      return prefixLines(blocks(c, { indent: '' }), ctx.indent + '> ');
    case 'panel': {
      const kind = (a.panelType || 'info').toUpperCase();
      return prefixLines(`**${kind}:**\n\n` + blocks(c, { indent: '' }), ctx.indent + '> ');
    }
    case 'expand':
    case 'nestedExpand':
      return (a.title ? `**${a.title}**\n\n` : '') + blocks(c, ctx);
    case 'rule':
      return '---';
    case 'table':
      return table(node);
    case 'mediaSingle':
    case 'mediaGroup':
      return c.map((m) => `[attachment: ${m.attrs?.alt || m.attrs?.id || 'media'}]`).join('\n');
    case 'blockCard':
    case 'embedCard':
      return a.url ? `<${a.url}>` : '';
    case 'extension':
    case 'bodiedExtension':
      // Macro không đọc được: bỏ nội dung, giữ một dòng ghi chú.
      return `> Đã bỏ macro "${a.extensionKey || 'không rõ'}": không đọc được qua API.` + (c.length ? '\n\n' + blocks(c, ctx) : '');
    default:
      // Unknown block: render children if any, else treat as inline.
      if (c.length) return blocks(c, ctx);
      return inline([node]);
  }
}

function list(items, ctx, marker) {
  return items
    .map((item, i) => {
      const m = marker(i);
      const pad = ' '.repeat(m.length);
      const parts = (item.content || []).map((child, j) => {
        if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
          return block(child, { indent: ctx.indent + pad });
        }
        const text = block(child, { indent: '' });
        return prefixLines(text, ctx.indent + (j === 0 ? '' : pad), j === 0 ? ctx.indent + m : null);
      });
      return parts.join('\n');
    })
    .join('\n');
}

function table(node) {
  const rows = (node.content || []).map((row) =>
    (row.content || []).map((cell) => ({
      header: cell.type === 'tableHeader',
      text: cellText(cell),
    }))
  );
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => [...r.map((c) => c.text), ...Array(width - r.length).fill('')];
  const firstIsHeader = rows[0].every((c) => c.header);
  const head = firstIsHeader ? pad(rows[0]) : Array(width).fill('');
  const body = firstIsHeader ? rows.slice(1) : rows;
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(head), line(Array(width).fill('---')), ...body.map((r) => line(pad(r)))].join('\n');
}

function cellText(cell) {
  return (cell.content || [])
    .map((b) => block(b, { indent: '' }))
    .join('<br>')
    .replace(/\n+/g, '<br>')
    .replace(/\|/g, '\\|');
}

function inline(nodes = []) {
  return nodes.map(inlineNode).join('');
}

function inlineNode(n) {
  const a = n.attrs || {};
  switch (n.type) {
    case 'text':
      return applyMarks(n.text || '', n.marks || []);
    case 'hardBreak':
      return '  \n';
    case 'mention':
      return a.text ? (a.text.startsWith('@') ? a.text : '@' + a.text) : '@user';
    case 'emoji':
      return a.text || a.shortName || '';
    case 'inlineCard':
      return a.url ? `<${a.url}>` : '';
    case 'date':
      return a.timestamp ? new Date(Number(a.timestamp)).toISOString().slice(0, 10) : '';
    case 'status':
      return a.text ? `[${a.text}]` : '';
    case 'placeholder':
      return a.text ? `_${a.text}_` : '';
    case 'mediaInline':
      return `[attachment: ${a.alt || a.id || 'media'}]`;
    default:
      return n.content ? inline(n.content) : n.text || '';
  }
}

function applyMarks(text, marks) {
  let t = text;
  const types = marks.map((m) => m.type);
  if (types.includes('code')) {
    t = '`' + t + '`';
  } else {
    if (types.includes('strong')) t = wrapKeepingSpace(t, '**');
    if (types.includes('em')) t = wrapKeepingSpace(t, '_');
    if (types.includes('strike')) t = wrapKeepingSpace(t, '~~');
  }
  const link = marks.find((m) => m.type === 'link');
  if (link?.attrs?.href) t = `[${t}](${link.attrs.href})`;
  return t;
}

function wrapKeepingSpace(t, w) {
  const m = t.match(/^(\s*)(.*?)(\s*)$/s);
  return m[2] ? `${m[1]}${w}${m[2]}${w}${m[3]}` : t;
}

function prefixLines(text, prefix, firstPrefix = null) {
  if (!prefix && firstPrefix == null) return text;
  return text
    .split('\n')
    .map((l, i) => (i === 0 && firstPrefix != null ? firstPrefix : prefix) + l)
    .join('\n');
}

// ---------------- link extraction ----------------

/** Collects every URL in an ADF document (link marks, cards, plain-text URLs). */
export function collectUrls(doc) {
  const urls = new Set();
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (n.attrs?.url) urls.add(n.attrs.url);
    for (const m of n.marks || []) if (m.type === 'link' && m.attrs?.href) urls.add(m.attrs.href);
    if (n.type === 'text' && n.text) for (const u of n.text.match(/https?:\/\/[^\s<>()\]]+/g) || []) urls.add(u);
    visit(n.content);
  };
  if (typeof doc === 'string') {
    for (const u of doc.match(/https?:\/\/[^\s<>()\]"]+/g) || []) urls.add(u);
  } else {
    visit(doc);
  }
  return [...urls].map((u) => u.replace(/[.,;:!?'"]+$/, ''));
}

// ---------------- Markdown -> ADF (subset) ----------------
// Supports: headings, paragraphs, bullet/ordered lists (one level of nesting by indent),
// fenced code, blockquotes, horizontal rules, tables (as ADF tables), **bold**, _em_/*em*, `code`, [text](url).

export function markdownToAdf(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const content = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const node = { type: 'codeBlock', content: buf.length ? [{ type: 'text', text: buf.join('\n') }] : [] };
      if (fence[1]) node.attrs = { language: fence[1] };
      content.push(node);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      content.push({ type: 'heading', attrs: { level: h[1].length }, content: mdInline(h[2]) });
      i++;
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      content.push({ type: 'rule' });
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const rows = [line];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      content.push(mdTable(rows));
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      content.push({ type: 'blockquote', content: markdownToAdf(buf.join('\n')).content });
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const [node, next] = mdList(lines, i, indentOf(line));
      content.push(node);
      i = next;
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+|\s*\|)/.test(lines[i])) buf.push(lines[i++]);
    content.push({ type: 'paragraph', content: joinWithBreaks(buf) });
  }
  return { version: 1, type: 'doc', content };
}

function indentOf(l) {
  return l.match(/^\s*/)[0].length;
}

function mdList(lines, i, indent) {
  const ordered = /^\s*\d+[.)]\s+/.test(lines[i]);
  const list = { type: ordered ? 'orderedList' : 'bulletList', content: [] };
  if (ordered) list.attrs = { order: Number(lines[i].match(/\d+/)[0]) };
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      // blank line ends list unless next line continues it
      if (i + 1 < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1]) && indentOf(lines[i + 1]) >= indent) {
        i++;
        continue;
      }
      break;
    }
    const m = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (!m) break;
    const ind = m[1].length;
    if (ind < indent) break;
    if (ind > indent) {
      const last = list.content[list.content.length - 1];
      const [sub, next] = mdList(lines, i, ind);
      if (last) last.content.push(sub);
      i = next;
      continue;
    }
    if (/^\d/.test(m[2]) !== ordered) break;
    let text = m[3];
    let task = null;
    const t = text.match(/^\[([ xX])\]\s+(.*)$/);
    if (t) {
      task = t[1] !== ' ';
      text = (task ? '☑ ' : '☐ ') + t[2];
    }
    list.content.push({ type: 'listItem', content: [{ type: 'paragraph', content: mdInline(text) }] });
    i++;
  }
  return [list, i];
}

function mdTable(rows) {
  const cells = (r) =>
    r
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, '|'));
  const [head, ...body] = rows.map(cells);
  const mk = (type, text) => ({
    type,
    content: [{ type: 'paragraph', content: joinWithBreaks(text.split(/<br\s*\/?>/i)) }],
  });
  return {
    type: 'table',
    content: [
      { type: 'tableRow', content: head.map((t) => mk('tableHeader', t)) },
      ...body.map((r) => ({ type: 'tableRow', content: head.map((_, j) => mk('tableCell', r[j] ?? '')) })),
    ],
  };
}

function joinWithBreaks(parts) {
  const out = [];
  parts.forEach((p, idx) => {
    if (idx > 0) out.push({ type: 'hardBreak' });
    out.push(...mdInline(p.replace(/\s+$/, '')));
  });
  return out.filter((n) => n.type !== 'text' || n.text);
}

const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|((?<![\w*])\*[^*\s][^*]*\*(?!\w))|((?<!\w)_[^_\s][^_]*_(?!\w))|(https?:\/\/[^\s<>()]+)/g;

export function mdInline(text) {
  const nodes = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index > last) nodes.push({ type: 'text', text: text.slice(last, m.index) });
    const tok = m[0];
    if (m[1]) nodes.push({ type: 'text', text: tok.slice(1, -1), marks: [{ type: 'code' }] });
    else if (m[2]) nodes.push(...mdInline(tok.slice(2, -2)).map((n) => addMark(n, { type: 'strong' })));
    else if (m[3]) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      nodes.push(...mdInline(lm[1]).map((n) => addMark(n, { type: 'link', attrs: { href: lm[2] } })));
    } else if (m[4] || m[5]) nodes.push(...mdInline(tok.slice(1, -1)).map((n) => addMark(n, { type: 'em' })));
    else if (m[6]) nodes.push({ type: 'text', text: tok, marks: [{ type: 'link', attrs: { href: tok } }] });
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes.filter((n) => n.text !== '');
}

function addMark(node, mark) {
  if (node.type !== 'text') return node;
  const marks = node.marks || [];
  if (marks.some((m) => m.type === 'code') && mark.type !== 'link') return node;
  return { ...node, marks: [...marks, mark] };
}
