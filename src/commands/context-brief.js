import path from 'node:path';
import { parseArgs, printPlan, requireIssueKey } from '../args.js';
import { confluenceClient } from '../clients/confluence.js';
import { jiraClient } from '../clients/jira.js';
import { fetchPages, firstLine, pageIdsFrom } from '../collect.js';
import { loadProject } from '../config.js';
import { issueToMarkdown, relationsOf } from '../issue.js';
import { writeSource } from '../output.js';
import { makeCleaner } from '../redact.js';
import { createRun, rel, runsRoot, updateManifest } from '../run-layout.js';

export const HELP = `context-brief — đọc một vòng quanh issue A để hiểu ngữ cảnh (chỉ đọc)

Cách dùng
  context-brief <PROJ-123> [--no-confluence] [--config <file>] [--dry-run]

Lấy đúng một vòng liên kết quanh A, không đi tiếp và không kéo cả backlog:
  - issue cha của A
  - issue con của A (sub-task và issue có parent = A)
  - issue mà A chặn, và issue chặn A
  - page Confluence gắn trên A và trên các issue đó

Tạo runs/<KEY>-context-<thời điểm>/ gồm jira/<KEY>.md cho từng issue, confluence/*.md,
manifest.json (vai trò của từng issue). Skill context-brief viết report/context-brief.md.
Không chấm tiêu chí chấp nhận, không viết test (analyze-requirement làm việc đó sau).

Mã thoát: 0 xong, 1 lỗi API, 2 sai cách dùng, 3 thiếu biến môi trường.
`;

export async function run(argv) {
  const { flags, positionals, dryRun, help } = parseArgs(argv, { 'no-confluence': { type: 'boolean' }, config: { type: 'string' } });
  if (help) return process.stdout.write(HELP), 0;
  const key = requireIssueKey(positionals[0]);
  const project = loadProject({ configPath: flags.config });
  const max = project.config.limits.maxRelatedIssues;

  if (dryRun) {
    printPlan(`context-brief ${key}`, [
      `Tạo ${path.join(runsRoot(project), `${key}-context-<thời điểm>`)}`,
      `GET /rest/api/3/issue/${key} (cha, sub-task, liên kết chặn/bị chặn)`,
      `POST /rest/api/3/search/jql với "parent = ${key}" (issue con, tối đa ${max})`,
      `GET từng issue liên quan một lần (tối đa ${max}); không đọc liên kết của chúng`,
      flags['no-confluence'] ? 'Bỏ qua Confluence' : 'GET page Confluence gắn trên các issue đó',
      'Ghi manifest.json',
    ]);
    return 0;
  }

  const jira = jiraClient(project);
  const root = await jira.getIssue(key);
  const dir = createRun(project, key, { kind: 'context' });
  const warnings = [];
  const notes = {};

  // Vòng 1: quan hệ trực tiếp của A
  const rel1 = relationsOf(root);
  try {
    for (const c of await jira.getChildren(key, max)) {
      if (!rel1.children.some((x) => x.key === c.key)) rel1.children.push({ key: c.key, summary: c.fields?.summary || '' });
    }
  } catch (e) {
    warnings.push(`Không tìm được issue con qua JQL: ${firstLine(e)}`);
  }
  const roles = new Map(); // key → vai trò
  if (rel1.parent) roles.set(rel1.parent.key, 'parent');
  for (const c of rel1.children) roles.set(c.key, roles.get(c.key) || 'child');
  for (const b of rel1.blocks) roles.set(b.key, roles.get(b.key) || 'blocked-by-A');
  for (const b of rel1.blockedBy) roles.set(b.key, roles.get(b.key) || 'blocks-A');
  roles.delete(key);
  const related = [...roles.keys()];
  if (related.length > max) warnings.push(`Có ${related.length} issue liên quan; chỉ đọc ${max} issue đầu (limits.maxRelatedIssues).`);

  // Ghi A và các issue liên quan. Không đi tiếp vòng 2.
  const issues = [];
  const pageLinks = new Map(); // page id → các issue gắn page
  const urlsByIssue = [];
  const write = async (payload, role) => {
    const k = payload.key;
    const remote = await jira.getRemoteLinks(k).catch((e) => (warnings.push(`Remote link ${k}: ${firstLine(e)}`), []));
    const clean = makeCleaner(project.config.dataBoundary);
    const md = issueToMarkdown(payload, { acFieldId: project.config.jira?.acceptanceCriteriaField, remoteLinks: remote, base: jira.base, clean });
    const file = path.join(dir, 'jira', `${k}.md`);
    const note = writeSource(file, md.markdown, project, clean.counts);
    if (note) notes[rel(dir, file)] = note;
    issues.push({ key: k, role, summary: payload.fields?.summary || '', status: payload.fields?.status?.name || '', file: rel(dir, file) });
    urlsByIssue.push([k, md.urls]);
  };
  await write(root, 'A');
  for (const k of related.slice(0, max)) {
    try {
      await write(await jira.getIssueBrief(k), roles.get(k));
    } catch (e) {
      warnings.push(`Issue ${k}: ${firstLine(e)}`);
    }
  }

  // Page gắn trên các issue đó (chỉ page gắn trực tiếp, không theo link trong page)
  let pages = [];
  if (!flags['no-confluence']) {
    try {
      const wiki = confluenceClient(project);
      for (const [k, urls] of urlsByIssue) {
        for (const id of await pageIdsFrom(urls, wiki, wiki.base, warnings)) pageLinks.set(id, [...(pageLinks.get(id) || []), k]);
      }
      const res = await fetchPages([...pageLinks.keys()], { wiki, base: wiki.base, dir, project, max: project.config.limits.maxPages, warnings, notes, linkedFrom: pageLinks });
      pages = res.pages;
    } catch (e) {
      warnings.push(`Confluence: ${firstLine(e)}`);
    }
  }

  updateManifest(dir, {
    kind: 'context',
    issueKey: key,
    fetchedAt: new Date().toISOString(),
    site: jira.base,
    hops: 1,
    relations: {
      parent: rel1.parent?.key || null,
      children: rel1.children.map((c) => c.key),
      blocks: rel1.blocks.map((b) => b.key),
      blockedBy: rel1.blockedBy.map((b) => b.key),
    },
    issues,
    sources: { confluence: pages },
    dataBoundary: notes,
    warnings,
  });

  const roleName = { A: 'đang làm', parent: 'issue cha', child: 'issue con', 'blocked-by-A': 'A chặn', 'blocks-A': 'chặn A' };
  console.log(`Thư mục: ${dir}\n`);
  console.log('Issue (một vòng quanh A):');
  for (const i of issues) console.log(`  - ${i.key.padEnd(12)} ${roleName[i.role] || i.role}: ${i.summary} [${i.status}]  → ${i.file}`);
  console.log(`Confluence: ${pages.length} page${pages.map((p) => `\n  - ${p.file}  (${p.title}; gắn trên ${p.linkedFrom.join(', ')})`).join('')}`);
  if (Object.keys(notes).length) console.log(`\nGiới hạn dữ liệu:\n${Object.entries(notes).map(([f, n]) => `  - ${f}: ${n}`).join('\n')}`);
  if (warnings.length) console.log(`\nCảnh báo:\n${warnings.map((w) => `  ! ${w}`).join('\n')}`);
  return 0;
}
