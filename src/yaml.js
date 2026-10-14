// YAML tối giản, không phụ thuộc, đủ cho registry/skills.yml, config/project.yml và frontmatter.
// Hỗ trợ: map, list (của scalar hoặc map), lồng theo thụt lề, scalar (chuỗi có/không nháy,
// số, true/false, null, ~), list nội dòng [a, b], map rỗng {}, chú thích #.
// Không hỗ trợ: anchor/alias, chuỗi nhiều dòng (| >), tab để thụt lề.

export class YamlError extends Error {}

export function parseYaml(text) {
  const lines = [];
  String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((raw, i) => {
      if (/^\s*(#.*)?$/.test(raw) || /^---\s*$/.test(raw)) return;
      if (/^\t/.test(raw)) throw new YamlError(`Dòng ${i + 1}: không dùng tab để thụt lề`);
      const indent = raw.match(/^ */)[0].length;
      lines.push({ indent, text: stripComment(raw.slice(indent)), no: i + 1 });
    });
  if (!lines.length) return null;
  const [value, next] = parseBlock(lines, 0, lines[0].indent);
  if (next < lines.length) throw new YamlError(`Dòng ${lines[next].no}: thụt lề không hợp lệ`);
  return value;
}

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

function parseBlock(lines, i, indent) {
  return lines[i].text.startsWith('- ') || lines[i].text === '-' ? parseList(lines, i, indent) : parseMap(lines, i, indent);
}

function parseList(lines, i, indent) {
  const out = [];
  while (i < lines.length && lines[i].indent === indent && (lines[i].text.startsWith('- ') || lines[i].text === '-')) {
    const rest = lines[i].text === '-' ? '' : lines[i].text.slice(2).trim();
    const no = lines[i].no;
    i++;
    if (!rest) {
      if (i < lines.length && lines[i].indent > indent) {
        const [v, n] = parseBlock(lines, i, lines[i].indent);
        out.push(v);
        i = n;
      } else out.push(null);
      continue;
    }
    if (isKeyLine(rest)) {
      // "- key: value" mở một map; các khóa tiếp theo thụt lề bằng vị trí sau "- "
      const childIndent = indent + 2;
      const synthetic = [{ indent: childIndent, text: rest, no }];
      let j = i;
      while (j < lines.length && lines[j].indent >= childIndent) synthetic.push(lines[j++]);
      const [v] = parseMap(synthetic, 0, childIndent);
      out.push(v);
      i = j;
    } else out.push(scalar(rest, no));
  }
  return [out, i];
}

function isKeyLine(s) {
  return /^("[^"]*"|'[^']*'|[^\s:'"#][^:#]*?)\s*:(\s|$)/.test(s);
}

function parseMap(lines, i, indent) {
  const out = {};
  while (i < lines.length && lines[i].indent === indent) {
    const { text, no } = lines[i];
    if (text.startsWith('- ')) break;
    const m = text.match(/^("[^"]*"|'[^']*'|[^\s:'"#][^:#]*?)\s*:(?:\s+(.*))?$/);
    if (!m) throw new YamlError(`Dòng ${no}: cần "khóa: giá trị"`);
    const key = unquote(m[1]);
    const rest = (m[2] || '').trim();
    i++;
    if (rest) out[key] = scalar(rest, no);
    else if (i < lines.length && lines[i].indent > indent) {
      const [v, n] = parseBlock(lines, i, lines[i].indent);
      out[key] = v;
      i = n;
    } else if (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith('- ')) {
      const [v, n] = parseList(lines, i, indent);
      out[key] = v;
      i = n;
    } else out[key] = null;
  }
  return [out, i];
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    const inner = s.slice(1, -1);
    return s[0] === '"' ? inner.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'");
  }
  return s;
}

function scalar(s, no) {
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner ? splitFlow(inner).map((x) => scalar(x.trim(), no)) : [];
  }
  if (s === '{}') return {};
  if (s.startsWith('{')) throw new YamlError(`Dòng ${no}: map nội dòng chưa được hỗ trợ, hãy viết nhiều dòng`);
  if (/^["']/.test(s)) {
    if (s.length < 2 || s[s.length - 1] !== s[0]) throw new YamlError(`Dòng ${no}: thiếu dấu nháy đóng`);
    return unquote(s);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function splitFlow(s) {
  const parts = [];
  let q = null;
  let cur = '';
  for (const c of s) {
    if (q) {
      cur += c;
      if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if (c === ',') {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  return parts;
}

/** Tách frontmatter YAML ở đầu file Markdown. Trả về { data, body } hoặc { data: null, body }. */
export function parseFrontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: null, body: String(text) };
  return { data: parseYaml(m[1]) || {}, body: m[2] };
}

/** Ghi YAML đơn giản (map/list/scalar) cho file sinh ra. */
export function stringifyYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value
      .map((v) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const body = stringifyYaml(v, indent + 2).trimStart();
          return `${pad}- ${body}`;
        }
        return `${pad}- ${scalarOut(v)}`;
      })
      .join('\n');
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return keys
      .map((k) => {
        const v = value[k];
        if (v && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length)) {
          return `${pad}${k}:\n${stringifyYaml(v, indent + 2)}`;
        }
        return `${pad}${k}: ${v && typeof v === 'object' ? (Array.isArray(v) ? '[]' : '{}') : scalarOut(v)}`;
      })
      .join('\n');
  }
  return pad + scalarOut(value);
}

function scalarOut(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '' || /^[\s-?:,[\]{}#&*!|>'"%@`]|[:#]\s|\s$|^(true|false|null|~|-?\d+(\.\d+)?)$/.test(s) || s.includes('\n')) {
    return JSON.stringify(s);
  }
  return s;
}
