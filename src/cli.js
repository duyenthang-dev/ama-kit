// Entrypoint chung cho mọi lệnh trong bin/. Ánh xạ lỗi sang mã thoát:
//   0 xong · 1 lỗi API · 2 sai cách dùng · 3 thiếu biến môi trường

import { AmaError } from './errors.js';

export const COMMANDS = ['jira', 'confluence', 'figma', 'mobile-test', 'context-brief', 'analyze-requirement', 'qe-workflow', 'workflow'];

export const OVERVIEW = `ama-kit (Ask Me Anything kit) — CLI hiểu ngữ cảnh task, phân tích requirement, chạy QE mobile

Lệnh (mỗi lệnh có --help và --dry-run):
  jira issue <KEY> | jira comment <KEY> --file <md> [--yes]
  confluence page <url-hoặc-id>
  figma export
  mobile-test run --suite smoke [--issue <KEY>] [--yes]
  context-brief <KEY>
  analyze-requirement <KEY>
  qe-workflow <KEY>
  workflow skills | rules | adapt cursor --out <dir> | validate | init | doctor | status <KEY>

Gọi trực tiếp (bin/<lệnh>.js) hoặc qua "ama <lệnh> ...".
Mã thoát: 0 xong, 1 lỗi API, 2 sai cách dùng, 3 thiếu biến môi trường.
`;

export async function main(command, argv) {
  try {
    if (!COMMANDS.includes(command)) {
      process.stderr.write(`Lệnh không rõ: "${command}".\n\n${OVERVIEW}`);
      process.exit(2);
    }
    const mod = await import(`./commands/${command}.js`);
    const code = await mod.run(argv);
    process.exit(code ?? 0);
  } catch (e) {
    if (e instanceof AmaError) {
      process.stderr.write(`${command}: ${e.message}\n`);
      process.exit(e.exitCode);
    }
    process.stderr.write(`${command}: lỗi không mong đợi: ${e?.stack || e}\n`);
    process.exit(1);
  }
}
