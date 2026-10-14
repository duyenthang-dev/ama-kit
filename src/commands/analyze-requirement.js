import path from 'node:path';
import { parseArgs, printPlan, requireIssueKey } from '../args.js';
import { confluenceClient } from '../clients/confluence.js';
import { jiraClient } from '../clients/jira.js';
import { fetchPages, firstLine, pageIdsFrom } from '../collect.js';
import { loadProject, projectFrames } from '../config.js';
import { exportFrames } from '../frames.js';
import { issueToMarkdown } from '../issue.js';
import { normalizeNodeId, parseFigmaUrl } from '../links.js';
import { writeSource } from '../output.js';
import { makeCleaner } from '../redact.js';
import { createRun, rel, runsRoot, updateManifest } from '../run-layout.js';

export const HELP = `analyze-requirement — gom dữ liệu để phân tích requirement của một issue

Cách dùng
  analyze-requirement <PROJ-123> [--no-confluence] [--no-figma] [--force] [--config <file>] [--dry-run]

Tạo runs/<KEY>-<thời điểm>/ gồm:
  jira/issue.md            issue: summary, mô tả, tiêu chí chấp nhận (nguyên văn + nguồn), link
  confluence/*.md          page được gắn trong issue (remote link, URL trong mô tả/AC)
  figma/*.png              frame trong config + frame được link trong issue/page
  report/                  nơi skill analyze-requirement viết analysis.md và ac.json
  manifest.json            nguồn đã lấy, cảnh báo, những gì đã bị che

Lệnh này chỉ lấy dữ liệu. Phần phân tích do skill (workflows/analyze-requirement) làm.
Mã thoát: 0 xong (kể cả khi vài nguồn lỗi, xem cảnh báo), 1 lỗi API với issue, 2 sai cách dùng, 3 thiếu biến môi trường.
`;

export async function run(argv) {
  const { flags, positionals, dryRun, help } = parseArgs(argv, {
    'no-confluence': { type: 'boolean' },
    'no-figma': { type: 'boolean' },
    force: { type: 'boolean' },
    config: { type: 'string' },
  });
  if (help) return process.stdout.write(HELP), 0;
  const key = requireIssueKey(positionals[0]);
  const project = loadProject({ configPath: flags.config });

  if (dryRun) {
    printPlan(`analyze-requirement ${key}`, [
      `Tạo ${path.join(runsRoot(project), `${key}-<thời điểm>`)}/{jira,confluence,figma,report}`,
      `GET /rest/api/3/issue/${key} và /remotelink → jira/issue.md`,
      flags['no-confluence'] ? 'Bỏ qua Confluence' : `GET /wiki/api/v2/pages/<id> cho mỗi page gắn trong issue (tối đa ${project.config.limits.maxPages}) → confluence/*.md`,
      flags['no-figma'] ? 'Bỏ qua Figma' : `Tải PNG frame trong config + frame được link (tối đa ${project.config.limits.maxFrames}) → figma/*.png`,
      'Ghi manifest.json',
    ]);
    return 0;
  }

  const jira = jiraClient(project);
  const issue = await jira.getIssue(key); // lỗi ở đây là lỗi thật: dừng trước khi tạo thư mục
  const dir = createRun(project, key);
  const warnings = [];
  const notes = {};

  // 1. Issue
  const remote = await jira.getRemoteLinks(key).catch((e) => (warnings.push(`Remote link: ${firstLine(e)}`), []));
  const clean = makeCleaner(project.config.dataBoundary);
  const md = issueToMarkdown(issue, { acFieldId: project.config.jira?.acceptanceCriteriaField, remoteLinks: remote, base: jira.base, clean });
  const n1 = writeSource(path.join(dir, 'jira', 'issue.md'), md.markdown, project, clean.counts);
  if (n1) notes['jira/issue.md'] = n1;
  if (!md.acSource) warnings.push('Không tìm thấy tiêu chí chấp nhận (không có field AC, mô tả không có mục "Acceptance criteria").');

  // 2. Page gắn trong issue
  let pages = [];
  const urls = [...md.urls];
  if (!flags['no-confluence']) {
    try {
      const wiki = confluenceClient(project);
      const ids = await pageIdsFrom(md.urls, wiki, wiki.base, warnings);
      const linkedFrom = new Map(ids.map((id) => [id, [key]]));
      const res = await fetchPages(ids, { wiki, base: wiki.base, dir, project, max: project.config.limits.maxPages, warnings, notes, linkedFrom });
      pages = res.pages;
      urls.push(...res.innerUrls);
    } catch (e) {
      warnings.push(`Confluence: ${firstLine(e)}`);
    }
  }

  // 3. Frame Figma: config + link có node-id trong issue/page
  let frames = [];
  if (!flags['no-figma']) {
    const byFile = new Map();
    const add = (fk, nodeId, name) => {
      const list = byFile.get(fk) || [];
      if (!list.some((n) => n.nodeId === nodeId)) list.push({ nodeId, name });
      byFile.set(fk, list);
    };
    for (const u of urls) {
      const p = parseFigmaUrl(u);
      if (!p) continue;
      if (p.nodeId) add(p.fileKey, p.nodeId);
      else warnings.push(`Link Figma không có node-id (cả file) bị bỏ qua: ${u}. Hãy link từng frame hoặc khai báo trong figma.frames.`);
    }
    const fk = project.config.figma?.fileKey;
    for (const f of projectFrames(project)) {
      if (!fk) {
        warnings.push('figma.frames có giá trị nhưng figma.fileKey rỗng.');
        break;
      }
      add(fk, normalizeNodeId(f.nodeId), f.name);
    }
    let budget = project.config.limits.maxFrames;
    const total = [...byFile.values()].reduce((n, l) => n + l.length, 0);
    if (total > budget) warnings.push(`Có ${total} frame; chỉ tải ${budget} frame đầu (limits.maxFrames).`);
    for (const [fileKey, nodes] of byFile) {
      if (budget <= 0) break;
      const take = nodes.slice(0, budget);
      budget -= take.length;
      try {
        const res = await exportFrames(fileKey, take, path.join(dir, 'figma'), { force: flags.force });
        warnings.push(...res.warnings);
        frames.push(...res.frames.map(({ file, ...f }) => ({ ...f, file: rel(dir, file) })));
      } catch (e) {
        warnings.push(`Figma file ${fileKey}: ${firstLine(e)}`);
      }
    }
  }

  updateManifest(dir, {
    kind: 'analysis',
    issueKey: key,
    fetchedAt: new Date().toISOString(),
    site: jira.base,
    sources: {
      issue: { file: 'jira/issue.md', summary: issue.fields?.summary, status: issue.fields?.status?.name, updated: issue.fields?.updated, acSource: md.acSource },
      confluence: pages,
      figma: frames,
    },
    dataBoundary: notes,
    warnings,
  });

  console.log(`Thư mục run: ${dir}\n`);
  console.log(`Issue:      ${key} — ${issue.fields?.summary || ''} [${issue.fields?.status?.name || '?'}]`);
  console.log(`AC:         ${md.acSource ? (md.acSource.kind === 'field' ? `field "${md.acSource.name}" (${md.acSource.field})` : `mục "${md.acSource.heading}" trong mô tả`) : 'không tìm thấy'}`);
  console.log(`Confluence: ${pages.length} page${pages.map((p) => `\n  - ${p.file}  (${p.title}, v${p.version})`).join('')}`);
  console.log(`Figma:      ${frames.length} frame${frames.map((f) => `\n  - ${f.file}  (${f.name}, ${f.nodeId})`).join('')}`);
  if (Object.keys(notes).length) console.log(`\nGiới hạn dữ liệu:\n${Object.entries(notes).map(([f, n]) => `  - ${f}: ${n}`).join('\n')}`);
  if (warnings.length) console.log(`\nCảnh báo:\n${warnings.map((w) => `  ! ${w}`).join('\n')}`);
  return 0;
}
