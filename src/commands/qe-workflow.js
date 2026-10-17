import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, printPlan } from '../args.js';
import { loadProject } from '../config.js';
import { UsageError } from '../errors.js';
import { readJson, resolveRun, updateManifest } from '../run-layout.js';
import { figmaIdsFromManifest, renderObjectiveMatrix, renderTestCases, renderTestMatrix, validateAc, validateTestCases } from '../traceability.js';

export const HELP = `qe-workflow — kiểm tra và dựng truy vết cho run QE của một issue

Cách dùng
  qe-workflow <PROJ-123 | thư mục run> [--config <file>] [--dry-run]

Đọc run mới nhất của issue (do analyze-requirement tạo) rồi:
  - kiểm schema report/ac.json (bắt buộc) và report/test-cases.json (nếu có)
  - sinh report/test-cases.md và hai ma trận tách nhau:
      report/traceability-objectives.md   mục tiêu (AC) → nguồn
      report/traceability-tests.md        test case → mục tiêu
  - đọc report/qe-plan.json (agent tự lập sau khi đọc Jira, Confluence, Figma, analysis): artifact nào làm, cái nào bỏ
    và vì sao; kiểm các artifact đã chọn có đủ. Không có kế hoạch thì chỉ liệt kê các artifact có thể làm (đều tùy chọn).

Comment tóm tắt lên Jira: "jira comment <KEY> --file <run>/report/summary.md", chỉ sau khi người dùng xác nhận.
Mã thoát: 0 xong, 2 thiếu file hoặc sai schema.
`;

// Danh mục artifact QE có thể làm. Không cái nào bắt buộc: agent chọn theo issue trong report/qe-plan.json.
export const CATALOG = [
  ['test-strategy.md', 'chiến lược test: tầng test, rủi ro, dữ liệu'],
  ['test-plan.md', 'test plan: phạm vi, môi trường, thứ tự, điều kiện dừng'],
  ['test-cases.json', 'test case có truy vết tới tiêu chí và frame'],
  ['mobile.md', 'kết quả smoke Appium trên device cloud'],
  ['summary.md', 'tóm tắt để comment lên Jira'],
];

export function validatePlan(plan, report) {
  const errors = [];
  const warnings = [];
  if (!plan || typeof plan !== 'object') return { errors: ['qe-plan.json không phải object'], warnings, chosen: [], skipped: [] };
  const list = (k) => (Array.isArray(plan[k]) ? plan[k] : []);
  const chosen = list('deliverables');
  const skipped = list('skipped');
  if (!String(plan.rationale || '').trim()) errors.push('qe-plan.json: thiếu "rationale" (vì sao chọn phạm vi QE này)');
  if (!chosen.length) warnings.push('qe-plan.json: không chọn artifact nào');
  for (const [i, d] of chosen.entries()) {
    if (!d?.file || !/^[\w.-]+\.(md|json)$/.test(d.file)) errors.push(`qe-plan.json: deliverables[${i}].file không hợp lệ`);
    if (!String(d?.why || '').trim()) errors.push(`qe-plan.json: deliverables[${i}] (${d?.file}) thiếu "why"`);
  }
  for (const [i, d] of skipped.entries()) {
    if (!d?.file) errors.push(`qe-plan.json: skipped[${i}] thiếu "file"`);
    if (!String(d?.why || '').trim()) errors.push(`qe-plan.json: skipped[${i}] (${d?.file}) thiếu "why"`);
  }
  const missing = chosen.filter((d) => d?.file && !fs.existsSync(path.join(report, d.file)));
  return { errors, warnings, chosen, skipped, missing };
}

export async function run(argv) {
  const { flags, positionals, dryRun, help } = parseArgs(argv, { config: { type: 'string' } });
  if (help) return process.stdout.write(HELP), 0;
  if (!positionals[0]) throw new UsageError(`Cần mã issue hoặc thư mục run.\n\n${HELP}`);
  const project = loadProject({ configPath: flags.config });
  const dir = resolveRun(positionals[0], project);
  const report = path.join(dir, 'report');

  if (dryRun) {
    printPlan(`qe-workflow ${positionals[0]}`, [`Đọc ${dir}`, 'Kiểm report/ac.json và report/test-cases.json', 'Ghi report/test-cases.md, traceability-objectives.md, traceability-tests.md']);
    return 0;
  }

  const manifest = readJson(path.join(dir, 'manifest.json'));
  const ac = readJson(path.join(report, 'ac.json'));
  if (!ac) throw new UsageError(`Chưa có ${path.join(report, 'ac.json')}. Chạy skill analyze-requirement trước.`);
  const tc = readJson(path.join(report, 'test-cases.json'));

  const acRes = validateAc(ac);
  const tcRes = tc ? validateTestCases(tc, acRes.acIds, figmaIdsFromManifest(manifest)) : null;
  const errors = [...acRes.errors.map((e) => `ac.json: ${e}`), ...(tcRes?.errors || []).map((e) => `test-cases.json: ${e}`)];
  const warnings = [...acRes.warnings.map((e) => `ac.json: ${e}`), ...(tcRes?.warnings || []).map((e) => `test-cases.json: ${e}`)];

  const n = ac.acceptanceCriteria?.length || 0;
  const weak = (ac.acceptanceCriteria || []).filter((c) => c.quality !== 'testable').length;
  console.log(`Run: ${dir}`);
  console.log(`ac.json: ${n} tiêu chí (${weak} chưa đo được như đang viết), ${(ac.gaps || []).length} gap, ${(ac.questions || []).length} câu hỏi mở`);
  if (tc) console.log(`test-cases.json: ${tc.testCases?.length || 0} test case, phủ ${tcRes.covered?.size || 0}/${n} tiêu chí`);
  for (const e of errors) console.log(`  ✘ ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  if (errors.length) return 2;

  fs.writeFileSync(path.join(report, 'traceability-objectives.md'), renderObjectiveMatrix(ac, manifest));
  const artifacts = { traceabilityObjectives: 'report/traceability-objectives.md' };
  if (tc) {
    fs.writeFileSync(path.join(report, 'test-cases.md'), renderTestCases(tc, ac, manifest));
    fs.writeFileSync(path.join(report, 'traceability-tests.md'), renderTestMatrix(tc, ac));
    Object.assign(artifacts, { testCases: 'report/test-cases.md', traceabilityTests: 'report/traceability-tests.md' });
  }
  updateManifest(dir, { artifacts });
  console.log(`  ✔ schema hợp lệ; đã ghi ${Object.values(artifacts).join(', ')}`);

  const plan = readJson(path.join(report, 'qe-plan.json'));
  if (!plan) {
    console.log('\nChưa có report/qe-plan.json. Agent đọc Jira, Confluence, Figma và analysis.md rồi tự chọn làm gì; các artifact có thể làm (đều tùy chọn):');
    for (const [f, d] of CATALOG) console.log(`  - report/${f}${fs.existsSync(path.join(report, f)) ? ' (đã có)' : ''}: ${d}`);
    return 0;
  }
  const pr = validatePlan(plan, report);
  console.log(`\nKế hoạch QE: ${String(plan.rationale || '').split('\n')[0]}`);
  for (const d of pr.chosen) console.log(`  ${fs.existsSync(path.join(report, d.file || '')) ? '✔' : '·'} ${d.file} — ${d.why}`);
  for (const d of pr.skipped) console.log(`  – bỏ ${d.file} — ${d.why}`);
  for (const e of pr.errors) console.log(`  ✘ ${e}`);
  for (const w of pr.warnings) console.log(`  ! ${w}`);
  if (pr.errors.length) return 2;
  if (pr.missing.length) console.log(`\nCòn làm theo kế hoạch: ${pr.missing.map((d) => d.file).join(', ')}`);
  else if (pr.chosen.some((d) => d.file === 'summary.md')) console.log('\nĐủ theo kế hoạch. Bước cuối: xem trước rồi comment summary.md lên Jira sau khi người dùng xác nhận.');
  else console.log('\nĐủ theo kế hoạch.');
  return 0;
}
