// Kiểm schema report/ac.json, report/test-cases.json và sinh hai ma trận truy vết tách nhau:
//   1. traceability-objectives.md: mục tiêu (AC) → nguồn (field/mục Jira, page Confluence, frame Figma)
//   2. traceability-tests.md:      test case → mục tiêu (AC)
// Schema chi tiết: knowledge/qe-workflow.md.

const LEVELS = ['unit', 'integration', 'e2e', 'smoke', 'manual'];
const MOSCOW = ['must', 'should', 'could', 'wont'];
const SOURCES = ['jira', 'confluence', 'figma', 'user', 'inferred'];
const enumOf = (v, allowed) => allowed.includes(v);

export function validateAc(ac) {
  const errors = [];
  const warnings = [];
  if (!ac || typeof ac !== 'object') return { errors: ['ac.json thiếu hoặc không phải object'], warnings, acIds: new Set() };
  if (!Array.isArray(ac.acceptanceCriteria)) errors.push('acceptanceCriteria phải là mảng');
  const ids = new Set();
  (ac.acceptanceCriteria || []).forEach((c, i) => {
    const at = `acceptanceCriteria[${i}]`;
    if (!/^AC-\d+$/.test(c.id || '')) errors.push(`${at}.id phải có dạng AC-1`);
    if (ids.has(c.id)) errors.push(`${at}.id ${c.id} bị trùng`);
    ids.add(c.id);
    if (!c.original) errors.push(`${at}.original (câu gốc, nguyên văn) là bắt buộc`);
    if (!enumOf(c.source, SOURCES)) errors.push(`${at}.source phải là ${SOURCES.join('|')}`);
    if (!c.sourceRef) errors.push(`${at}.sourceRef là bắt buộc (field, mục, page hoặc frame cụ thể)`);
    if (!enumOf(c.quality, ['testable', 'ambiguous', 'untestable'])) errors.push(`${at}.quality phải là testable|ambiguous|untestable`);
    if (!enumOf(c.testLevel, LEVELS)) errors.push(`${at}.testLevel phải là ${LEVELS.join('|')}`);
    if (c.moscow !== undefined && !enumOf(c.moscow, MOSCOW)) errors.push(`${at}.moscow phải là ${MOSCOW.join('|')}`);
    if (c.quality !== 'testable' && !(c.issues || []).length) warnings.push(`${at} (${c.id}) là ${c.quality} nhưng không ghi vấn đề trong issues`);
    if (c.interpretation && c.interpretation === c.original) warnings.push(`${at} (${c.id}): interpretation giống hệt original, bỏ đi nếu không diễn giải gì`);
  });
  const gapIds = new Set();
  (ac.gaps || []).forEach((g, i) => {
    if (!/^GAP-\d+$/.test(g.id || '')) errors.push(`gaps[${i}].id phải có dạng GAP-1`);
    if (gapIds.has(g.id)) errors.push(`gaps[${i}].id ${g.id} bị trùng`);
    gapIds.add(g.id);
    if (!g.description) errors.push(`gaps[${i}].description là bắt buộc`);
    if (!enumOf(g.severity, ['high', 'medium', 'low'])) errors.push(`gaps[${i}].severity phải là high|medium|low`);
  });
  (ac.questions || []).forEach((q, i) => {
    if (!/^Q-\d+$/.test(q.id || '')) errors.push(`questions[${i}].id phải có dạng Q-1`);
    if (!q.question) errors.push(`questions[${i}].question là bắt buộc`);
    if (!enumOf(q.priority, ['high', 'medium', 'low'])) errors.push(`questions[${i}].priority phải là high|medium|low`);
    for (const r of q.relatesTo || []) if (/^AC-/.test(r) && !ids.has(r)) errors.push(`questions[${i}].relatesTo tham chiếu ${r} không tồn tại`);
  });
  if (!(ac.gaps || []).length && !(ac.questions || []).length) warnings.push('Không có gap và câu hỏi mở nào. Kiểm tra lại: requirement hiếm khi đầy đủ.');
  return { errors, warnings, acIds: ids };
}

export function validateTestCases(tc, acIds, figmaIds = new Set()) {
  const errors = [];
  const warnings = [];
  if (!tc || !Array.isArray(tc.testCases)) return { errors: ['testCases phải là mảng'], warnings, covered: new Set() };
  const ids = new Set();
  const covered = new Set();
  tc.testCases.forEach((t, i) => {
    const at = `testCases[${i}]`;
    if (!/^TC-\d+$/.test(t.id || '')) errors.push(`${at}.id phải có dạng TC-1`);
    if (ids.has(t.id)) errors.push(`${at}.id ${t.id} bị trùng`);
    ids.add(t.id);
    if (!t.title) errors.push(`${at}.title là bắt buộc`);
    if (!Array.isArray(t.acIds) || !t.acIds.length) errors.push(`${at} (${t.id}) phải truy vết tới ít nhất một AC trong acIds`);
    for (const a of t.acIds || []) {
      if (!acIds.has(a)) errors.push(`${at} (${t.id}) tham chiếu ${a} không tồn tại`);
      covered.add(a);
    }
    if (!enumOf(t.level, LEVELS)) errors.push(`${at}.level phải là ${LEVELS.join('|')}`);
    if (!enumOf(t.priority, ['P1', 'P2', 'P3'])) errors.push(`${at}.priority phải là P1|P2|P3`);
    if (!Array.isArray(t.steps) || !t.steps.length) errors.push(`${at}.steps phải là mảng không rỗng`);
    if (!t.expected || (Array.isArray(t.expected) && !t.expected.length)) errors.push(`${at}.expected là bắt buộc`);
    for (const n of t.figmaNodes || []) if (figmaIds.size && !figmaIds.has(n)) warnings.push(`${at} (${t.id}) tham chiếu frame Figma ${n} chưa được tải`);
    const st = t.automation?.status;
    if (st && !enumOf(st, ['automated', 'candidate', 'manual'])) errors.push(`${at}.automation.status phải là automated|candidate|manual`);
    if (t.data && /\b(prod|production|real customer|khách hàng thật)\b/i.test(JSON.stringify(t.data))) warnings.push(`${at} (${t.id}) có vẻ dùng dữ liệu thật; dùng fixture/factory/mock`);
  });
  for (const a of acIds) if (!covered.has(a)) warnings.push(`${a} chưa có test case nào`);
  return { errors, warnings, covered };
}

export function figmaIdsFromManifest(manifest) {
  return new Set((manifest?.sources?.figma || []).map((f) => f.nodeId).filter(Boolean));
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, '<br>');
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const cut = (s, n) => {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

/** Ma trận 1: mục tiêu (AC) → nguồn. */
export function renderObjectiveMatrix(ac, manifest) {
  const frameName = new Map((manifest?.sources?.figma || []).map((f) => [f.nodeId, f.name]));
  const out = [`# Ma trận truy vết: mục tiêu → nguồn (${ac.issueKey || manifest?.issueKey || ''})`, ''];
  out.push('| Mục tiêu | Câu gốc | Nguồn | Tham chiếu | Frame Figma | Tầng test | Chất lượng |', '|---|---|---|---|---|---|---|');
  for (const c of ac.acceptanceCriteria || []) {
    const frames = (c.figmaNodes || []).map((n) => `${frameName.get(n) || ''} \`${n}\``.trim()).join(', ') || '—';
    out.push(`| ${c.id} | ${esc(cut(c.original, 90))} | ${c.source} | ${esc(c.sourceRef)} | ${esc(frames)} | ${c.testLevel} | ${c.quality} |`);
  }
  out.push('');
  return out.join('\n');
}

/** Ma trận 2: test case → mục tiêu (AC), kèm độ phủ. */
export function renderTestMatrix(tc, ac) {
  const acIds = (ac.acceptanceCriteria || []).map((c) => c.id);
  const out = [`# Ma trận truy vết: test case → mục tiêu (${tc.issueKey || ac.issueKey || ''})`, ''];
  out.push(`| Test case | Tầng | Ưu tiên | ${acIds.join(' | ')} |`, `|---|---|---|${acIds.map(() => '---').join('|')}|`);
  for (const t of tc.testCases) {
    const marks = acIds.map((a) => ((t.acIds || []).includes(a) ? '✔' : ''));
    out.push(`| ${t.id} ${esc(cut(t.title, 50))} | ${t.level} | ${t.priority} | ${marks.join(' | ')} |`);
  }
  const covered = new Set(tc.testCases.flatMap((t) => t.acIds || []));
  const missing = acIds.filter((a) => !covered.has(a));
  out.push('', `Độ phủ: ${acIds.length - missing.length}/${acIds.length} mục tiêu có ít nhất một test case.`);
  if (missing.length) out.push(`Chưa phủ: ${missing.join(', ')}.`);
  out.push('');
  return out.join('\n');
}

export function renderTestCases(tc, ac, manifest) {
  const acById = new Map((ac.acceptanceCriteria || []).map((c) => [c.id, c]));
  const frameName = new Map((manifest?.sources?.figma || []).map((f) => [f.nodeId, f.name]));
  const out = [`# Test case: ${tc.issueKey || ac.issueKey || ''}`, ''];
  out.push('| ID | Tiêu đề | AC | Tầng | Ưu tiên | Tự động hóa |', '|---|---|---|---|---|---|');
  for (const t of tc.testCases) out.push(`| ${t.id} | ${esc(t.title)} | ${(t.acIds || []).join(', ')} | ${t.level} | ${t.priority} | ${t.automation?.status || 'manual'} |`);
  out.push('');
  for (const t of tc.testCases) {
    out.push(`## ${t.id}: ${t.title}`, '');
    out.push(`- **Phủ:** ${(t.acIds || []).map((a) => `${a}${acById.get(a) ? ` (${cut(acById.get(a).original, 80)})` : ''}`).join('; ')}`);
    out.push(`- **Tầng / loại / ưu tiên:** ${t.level} / ${t.type || '-'} / ${t.priority}`);
    if (t.figmaNodes?.length) out.push(`- **Figma:** ${t.figmaNodes.map((n) => `${frameName.get(n) || ''} \`${n}\``.trim()).join(', ')}`);
    if (t.data) out.push(`- **Dữ liệu (giả):** ${esc(typeof t.data === 'string' ? t.data : JSON.stringify(t.data))}`);
    if (t.automation?.ref) out.push(`- **Tự động hóa:** ${t.automation.status} → \`${t.automation.ref}\``);
    if (t.preconditions) out.push(`- **Điều kiện trước:** ${list(t.preconditions).join('; ')}`);
    out.push('', '**Các bước**', '');
    t.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`));
    out.push('', '**Kết quả mong đợi**', '');
    list(t.expected).forEach((e) => out.push(`- ${e}`));
    out.push('');
  }
  return out.join('\n');
}
