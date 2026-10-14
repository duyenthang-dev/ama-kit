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
  - liệt kê artifact còn thiếu: test-strategy.md, test-plan.md, mobile.md (hoặc lý do chưa chạy), summary.md

Comment tóm tắt lên Jira: "jira comment <KEY> --file <run>/report/summary.md", chỉ sau khi người dùng xác nhận.
Mã thoát: 0 xong, 2 thiếu file hoặc sai schema.
`;

const EXPECTED = [
  ['analysis.md', 'phân tích requirement (analyze-requirement)'],
  ['ac.json', 'tiêu chí chấp nhận có ID (analyze-requirement)'],
  ['test-strategy.md', 'chiến lược test'],
  ['test-plan.md', 'test plan'],
  ['test-cases.json', 'test case có truy vết'],
  ['mobile.md', 'kết quả smoke, hoặc lý do chưa chạy'],
  ['summary.md', 'tóm tắt để comment lên Jira'],
];

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

  const missing = EXPECTED.filter(([f]) => !fs.existsSync(path.join(report, f)));
  if (missing.length) console.log(`\nCòn thiếu:\n${missing.map(([f, d]) => `  - report/${f}: ${d}`).join('\n')}`);
  else console.log('\nĐủ artifact. Bước cuối: xem trước rồi comment summary.md lên Jira sau khi người dùng xác nhận.');
  return 0;
}
