import { parseArgs, printPlan } from '../args.js';
import { confluenceClient } from '../clients/confluence.js';
import { loadProject } from '../config.js';
import { UsageError } from '../errors.js';
import { parseConfluenceUrl } from '../links.js';
import { emit } from '../output.js';
import { pageToMarkdown } from '../page.js';
import { applyBoundary, makeCleaner } from '../redact.js';

export const HELP = `confluence — lấy page Confluence Cloud (REST API v2) và chuyển thành Markdown

Cách dùng
  confluence page <url-hoặc-id> [--output <file>] [--json] [--config <file>] [--dry-run]

Nhận URL /wiki/spaces/<space>/pages/<id>/..., viewpage.action?pageId=..., link rút gọn /wiki/x/...
hoặc page ID. Macro không đọc được bị bỏ và thay bằng một dòng "Đã bỏ macro ...".
Khi phân tích một issue, ưu tiên page gắn trong issue (analyze-requirement tự làm việc đó).

Credential dùng chung với Jira: ATLASSIAN_SITE, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN.
Mã thoát: 0 xong, 1 lỗi API, 2 sai cách dùng, 3 thiếu biến môi trường.
`;

export async function run(argv) {
  const { flags, positionals, dryRun, help } = parseArgs(argv, { json: { type: 'boolean' }, output: { type: 'string', short: 'o' }, config: { type: 'string' } });
  const [sub, ref] = positionals;
  if (help) return process.stdout.write(HELP), 0;
  if (sub !== 'page') throw new UsageError(`${sub ? `Lệnh con không rõ: "confluence ${sub}".` : 'Thiếu lệnh con.'}\n\n${HELP}`);
  if (!ref) throw new UsageError('confluence page cần URL hoặc page ID.');

  let id = /^\d+$/.test(ref) ? ref : null;
  const parsed = id ? null : parseConfluenceUrl(ref);
  if (!id && !parsed) throw new UsageError(`Không nhận ra page ID trong "${ref}".`);
  id = id || parsed.pageId;

  if (dryRun) {
    printPlan(`confluence page ${ref}`, [
      ...(parsed?.tinyUrl ? [`GET ${parsed.tinyUrl} (theo redirect để lấy page ID)`] : []),
      `GET /wiki/api/v2/pages/${id || '<id>'}?body-format=atlas_doc_format (dự phòng: body-format=storage)`,
      'Chuyển sang Markdown, bỏ macro không đọc được, che dữ liệu nhạy cảm',
      flags.output ? `Ghi ${flags.output}` : 'In ra stdout',
    ]);
    return 0;
  }

  const project = loadProject({ configPath: flags.config });
  const api = confluenceClient(project);
  if (!id && parsed?.tinyUrl) id = parseConfluenceUrl(await api.resolveTinyUrl(parsed.tinyUrl))?.pageId;
  if (!id) throw new UsageError(`Link rút gọn ${ref} không trỏ tới page nào.`);
  const page = await api.getPage(id);
  if (flags.json) {
    const r = applyBoundary(JSON.stringify(page, null, 2), { ...project.config.dataBoundary, maxSourceChars: 0 });
    return emit(r.text, { file: flags.output, project, counts: r.counts, raw: true }), 0;
  }
  const clean = makeCleaner(project.config.dataBoundary);
  emit(pageToMarkdown(page, api.base, { clean }), { file: flags.output, project, counts: clean.counts });
  return 0;
}
