// Chuyển issue Jira v3 thành Markdown: summary, mô tả, tiêu chí chấp nhận (giữ nguyên văn + nguồn), liên kết.

import { adfToMarkdown, collectUrls } from './adf.js';

const AC_FIELD_NAME = /acceptance\s*criteria|tiêu chí chấp nhận|^a\.?c\.?$|definition of done/i;
const AC_HEADING = /^#{1,6}\s*(acceptance\s*criteria|tiêu chí chấp nhận|a\.?c\.?)\s*:?\s*$/i;

/** Field AC: id cấu hình trước, sau đó dò theo tên field. */
export function findAcField(issue, configuredId) {
  const fields = issue.fields || {};
  if (configuredId) return fields[configuredId] != null ? { id: configuredId, name: issue.names?.[configuredId] || configuredId } : null;
  for (const [id, name] of Object.entries(issue.names || {})) {
    if (id.startsWith('customfield_') && AC_FIELD_NAME.test(name) && fields[id] != null && fields[id] !== '') return { id, name };
  }
  return null;
}

/** Tách mục "Acceptance criteria" trong mô tả (Markdown) nếu không có field riêng. */
export function acFromDescription(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => AC_HEADING.test(l.trim()));
  if (start < 0) return null;
  const level = lines[start].match(/^#+/)[0].length;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#+)\s/);
    if (h && h[1].length <= level) break;
    body.push(lines[i]);
  }
  const text = body.join('\n').trim();
  return text ? { heading: lines[start].replace(/^#+\s*/, '').trim(), text } : null;
}

/** Quan hệ một vòng: cha, con (subtask), A chặn, chặn A, và liên kết khác. */
export function relationsOf(issue) {
  const f = issue.fields || {};
  const rel = { parent: null, children: [], blocks: [], blockedBy: [], other: [] };
  if (f.parent?.key) rel.parent = { key: f.parent.key, summary: f.parent.fields?.summary || '' };
  for (const s of f.subtasks || []) rel.children.push({ key: s.key, summary: s.fields?.summary || '' });
  for (const l of f.issuelinks || []) {
    const other = l.outwardIssue || l.inwardIssue;
    if (!other?.key) continue;
    const entry = { key: other.key, summary: other.fields?.summary || '', type: l.type?.name || '' };
    const isBlock = /block/i.test(l.type?.name || '') || /block|chặn/i.test(l.type?.outward || '');
    if (isBlock && l.outwardIssue) rel.blocks.push(entry);
    else if (isBlock && l.inwardIssue) rel.blockedBy.push(entry);
    else rel.other.push({ ...entry, relation: l.outwardIssue ? l.type?.outward : l.type?.inward });
  }
  return rel;
}

/**
 * @param {object} issue payload Jira v3 (expand=names)
 * @param {{ acFieldId?: string, remoteLinks?: object[], base?: string, clean?: (s: string) => string }} opts
 *   clean: hàm che dữ liệu, chỉ áp dụng cho nội dung (mô tả, AC), không cho metadata.
 */
export function issueToMarkdown(issue, { acFieldId, remoteLinks = [], base, clean = (s) => s } = {}) {
  const f = issue.fields || {};
  const acField = findAcField(issue, acFieldId);
  const description = f.description ? clean(adfToMarkdown(f.description).trim()) : '';
  const lines = [`# ${issue.key}: ${clean(f.summary || '')}`.trim(), ''];
  const meta = [
    ['Loại', f.issuetype?.name],
    ['Trạng thái', f.status?.name],
    ['Ưu tiên', f.priority?.name],
    ['Người làm', f.assignee?.displayName],
    ['Người tạo', f.reporter?.displayName],
    ['Nhãn', (f.labels || []).join(', ')],
    ['Component', (f.components || []).map((c) => c.name).join(', ')],
    ['Fix version', (f.fixVersions || []).map((c) => c.name).join(', ')],
    ['Issue cha', f.parent ? `${f.parent.key} ${f.parent.fields?.summary || ''}`.trim() : ''],
    ['Cập nhật', f.updated],
    ['Link', base ? `${base}/browse/${issue.key}` : ''],
  ].filter(([, v]) => v);
  for (const [k, v] of meta) lines.push(`- **${k}:** ${v}`);
  lines.push('', '## Mô tả', '', description || '_(trống)_', '');

  // Tiêu chí chấp nhận: giữ nguyên văn, ghi rõ lấy từ đâu.
  lines.push('## Tiêu chí chấp nhận', '');
  let acSource = null;
  if (acField) {
    acSource = { kind: 'field', field: acField.id, name: acField.name };
    lines.push(`> Nguồn: field "${acField.name}" (${acField.id}) trên ${issue.key}. Nguyên văn, chưa diễn giải.`, '');
    lines.push(clean(adfToMarkdown(f[acField.id]).trim()), '');
  } else {
    const fromDesc = description ? acFromDescription(description) : null;
    if (fromDesc) {
      acSource = { kind: 'description', heading: fromDesc.heading };
      lines.push(`> Nguồn: mục "${fromDesc.heading}" trong mô tả của ${issue.key}. Nguyên văn, chưa diễn giải.`, '');
      lines.push(fromDesc.text, '');
    } else {
      lines.push('> Không tìm thấy tiêu chí chấp nhận (không có field AC, mô tả không có mục "Acceptance criteria").', '');
    }
  }

  const rel = relationsOf(issue);
  const relLines = [];
  if (rel.parent) relLines.push(`- Issue cha: **${rel.parent.key}** ${rel.parent.summary}`);
  for (const c of rel.children) relLines.push(`- Issue con: **${c.key}** ${c.summary}`);
  for (const b of rel.blocks) relLines.push(`- ${issue.key} chặn: **${b.key}** ${b.summary}`);
  for (const b of rel.blockedBy) relLines.push(`- Bị chặn bởi: **${b.key}** ${b.summary}`);
  for (const o of rel.other) relLines.push(`- ${o.relation || 'liên quan'}: **${o.key}** ${o.summary}`);
  if (relLines.length) lines.push('## Issue liên quan', '', ...relLines, '');

  const remote = remoteLinks.map((r) => `- [${r.object?.title || r.object?.url}](${r.object?.url})`);
  if (remote.length) lines.push('## Link ngoài', '', ...remote, '');

  const att = (f.attachment || []).map((a) => `- ${a.filename} (${a.mimeType}, ${a.size} bytes)`);
  if (att.length) lines.push('## File đính kèm (không tải về)', '', ...att, '');

  return {
    markdown: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n',
    acField,
    acSource,
    relations: rel,
    urls: [...collectUrls(f.description), ...(acField ? collectUrls(f[acField.id]) : []), ...remoteLinks.map((r) => r.object?.url).filter(Boolean)],
  };
}
