import path from 'node:path';
import { parseArgs, printPlan } from '../args.js';
import { loadProject, projectFrames } from '../config.js';
import { UsageError } from '../errors.js';
import { exportFrames } from '../frames.js';
import { normalizeNodeId, parseFigmaUrl } from '../links.js';

export const HELP = `figma — tải PNG các frame Figma

Cách dùng
  figma export [--out <thư mục>] [--config <file>] [--scale 2] [--force] [--dry-run]
      Mặc định tải các frame khai báo trong config: figma.fileKey và figma.frames[{nodeId, name}].
  figma export --url <link Figma có node-id> [--url ...] [--out <thư mục>]
  figma export --file <FILE_KEY> --nodes 12:34,56:78 [--out <thư mục>]

Ảnh được cache theo version file; --force để tải lại. Báo cáo và manifest chỉ ghi link figma.com,
không ghi URL ảnh ký sẵn (có chữ ký) và không ghi token.

Credential: FIGMA_ACCESS_TOKEN.
Mã thoát: 0 xong, 1 lỗi API, 2 sai cách dùng, 3 thiếu biến môi trường.
`;

export async function run(argv) {
  const { flags, positionals, dryRun, help } = parseArgs(argv, {
    url: { type: 'string', multiple: true },
    file: { type: 'string' },
    nodes: { type: 'string' },
    out: { type: 'string' },
    scale: { type: 'string' },
    force: { type: 'boolean' },
    config: { type: 'string' },
  });
  if (help) return process.stdout.write(HELP), 0;
  if (positionals[0] !== 'export') throw new UsageError(`${positionals[0] ? `Lệnh con không rõ: "figma ${positionals[0]}".` : 'Thiếu lệnh con.'}\n\n${HELP}`);

  const project = loadProject({ configPath: flags.config });
  const byFile = new Map();
  const add = (fk, nodeId, name) => byFile.set(fk, [...(byFile.get(fk) || []), { nodeId, name }]);

  for (const u of flags.url || []) {
    const p = parseFigmaUrl(u);
    if (!p) throw new UsageError(`Không phải link file Figma: ${u}`);
    if (!p.nodeId) throw new UsageError(`Link không có node-id (chọn frame trong Figma rồi "Copy link to selection"): ${u}`);
    add(p.fileKey, p.nodeId);
  }
  const fileKey = flags.file || project.config.figma?.fileKey;
  if (flags.nodes) {
    if (!fileKey) throw new UsageError('--nodes cần --file hoặc figma.fileKey trong config.');
    for (const n of flags.nodes.split(',')) add(fileKey, normalizeNodeId(n));
  }
  if (!flags.url && !flags.nodes) {
    const frames = projectFrames(project);
    if (!fileKey || !frames.length) throw new UsageError('Không có frame nào: đặt figma.fileKey và figma.frames trong config, hoặc dùng --url / --nodes.');
    for (const f of frames) add(fileKey, normalizeNodeId(f.nodeId), f.name);
  }

  const out = path.resolve(flags.out || 'figma');
  if (dryRun) {
    const steps = [];
    for (const [fk, nodes] of byFile) {
      steps.push(`GET /v1/files/${fk}/nodes?ids=${nodes.map((n) => n.nodeId).join(',')} (tên frame, version)`);
      steps.push(`GET /v1/images/${fk}?format=png (${nodes.length} frame), tải PNG về ${out}`);
    }
    printPlan('figma export', steps);
    return 0;
  }

  let failed = 0;
  for (const [fk, nodes] of byFile) {
    const res = await exportFrames(fk, nodes, out, { scale: Number(flags.scale || 2), force: flags.force });
    for (const f of res.frames) console.log(`${f.nodeId}\t${f.name}\t${f.file}`);
    for (const w of res.warnings) console.error(`cảnh báo: ${w}`);
    failed += nodes.length - res.frames.length;
  }
  return failed ? 1 : 0;
}
