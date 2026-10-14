import fs from 'node:fs';
import { parseArgs, printPlan, requireIssueKey } from '../args.js';
import { markdownToAdf } from '../adf.js';
import { jiraClient } from '../clients/jira.js';
import { loadProject } from '../config.js';
import { UsageError } from '../errors.js';
import { issueToMarkdown } from '../issue.js';
import { emit } from '../output.js';
import { applyBoundary, makeCleaner } from '../redact.js';

export const HELP = `jira — đọc issue Jira Cloud (REST API v3) thành Markdown, hoặc thêm comment

Cách dùng
  jira issue <PROJ-123> [--output <file>] [--json] [--config <file>] [--dry-run]
      Markdown gồm summary, mô tả, tiêu chí chấp nhận (nguyên văn, ghi rõ nguồn) và link.
      Field AC: jira.acceptanceCriteriaField trong config, hoặc tự dò theo tên field,
      hoặc mục "Acceptance criteria" trong mô tả.

  jira comment <PROJ-123> --file <report.md> [--yes] [--dry-run]
      Thêm comment từ file Markdown. Không có --yes thì chỉ xem trước, không gửi.
      Chỉ thêm --yes sau khi người dùng xác nhận. Không bao giờ đổi trạng thái issue.

Credential (biến môi trường hoặc keychain): ATLASSIAN_SITE, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN.
Mã thoát: 0 xong, 1 lỗi API, 2 sai cách dùng, 3 thiếu biến môi trường.
`;

export async function run(argv) {
  const { flags, positionals, dryRun, help } = parseArgs(argv, {
    json: { type: 'boolean' },
    output: { type: 'string', short: 'o' },
    file: { type: 'string' },
    yes: { type: 'boolean' },
    config: { type: 'string' },
  });
  const [sub, key] = positionals;
  if (help) return process.stdout.write(HELP), 0;
  if (!sub) throw new UsageError(`Thiếu lệnh con.\n\n${HELP}`);
  requireIssueKey(key);

  if (sub === 'issue') {
    if (dryRun) {
      printPlan(`jira issue ${key}`, [
        `GET /rest/api/3/issue/${key}?expand=names&fields=*all`,
        `GET /rest/api/3/issue/${key}/remotelink`,
        'Chuyển ADF sang Markdown, che email/số tài khoản/token trong nội dung',
        flags.output ? `Ghi ${flags.output}` : 'In ra stdout',
      ]);
      return 0;
    }
    const project = loadProject({ configPath: flags.config });
    const api = jiraClient(project);
    const issue = await api.getIssue(key);
    if (flags.json) {
      const r = applyBoundary(JSON.stringify(issue, null, 2), { ...project.config.dataBoundary, maxSourceChars: 0 });
      return emit(r.text, { file: flags.output, project, counts: r.counts, raw: true }), 0;
    }
    const remote = await api.getRemoteLinks(key).catch(() => []);
    const clean = makeCleaner(project.config.dataBoundary);
    const { markdown } = issueToMarkdown(issue, { acFieldId: project.config.jira?.acceptanceCriteriaField, remoteLinks: remote, base: api.base, clean });
    emit(markdown, { file: flags.output, project, counts: clean.counts });
    return 0;
  }

  if (sub === 'comment') {
    if (!flags.file) throw new UsageError('Cần --file <file Markdown>.');
    if (!fs.existsSync(flags.file)) throw new UsageError(`Không thấy file ${flags.file}.`);
    const raw = fs.readFileSync(flags.file, 'utf8');
    if (!raw.trim()) throw new UsageError(`${flags.file} rỗng.`);
    // Không bao giờ gửi token/email/số tài khoản lên Jira.
    const { text: md, counts } = applyBoundary(raw, { maxSourceChars: 0 });
    if (md.length > 30000) throw new UsageError(`Comment dài ${md.length} ký tự; giữ dưới 30000 (gửi tóm tắt, không gửi cả báo cáo).`);
    if (dryRun) {
      printPlan(`jira comment ${key}`, [`POST /rest/api/3/issue/${key}/comment với ${md.length} ký tự Markdown đổi sang ADF`, 'Không đổi trạng thái hay field nào']);
      return 0;
    }
    if (!flags.yes) {
      console.log(`XEM TRƯỚC — chưa gửi gì lên ${key}.\n\n----- comment -----\n${md.trim()}\n-------------------\n\nCần người dùng xác nhận. Sau khi họ đồng ý, chạy lại với --yes.`);
      if (Object.keys(counts).length) console.error('Lưu ý: đã che dữ liệu nhạy cảm trong comment trước khi gửi.');
      return 0;
    }
    const project = loadProject({ configPath: flags.config });
    const api = jiraClient(project);
    const res = await api.addComment(key, markdownToAdf(md));
    console.log(`Đã thêm comment ${res.id} vào ${key}: ${api.base}/browse/${key}?focusedCommentId=${res.id}`);
    return 0;
  }

  throw new UsageError(`Lệnh con không rõ: "jira ${sub}".\n\n${HELP}`);
}
