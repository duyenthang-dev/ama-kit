#!/usr/bin/env node
// Cài (hoặc cập nhật) ama-kit thành plugin Claude Code từ chính repo này, trên máy người dùng.
//
//   node scripts/install-claude.js              cài mới, hoặc cập nhật nếu đã cài
//   node scripts/install-claude.js --check      cài xong thì chạy "workflow doctor" để thử kết nối
//   node scripts/install-claude.js --uninstall  gỡ plugin và marketplace
//   node scripts/install-claude.js --dry-run    chỉ in các bước, không chạy gì
//
// Script không đọc, không in giá trị credential. Nó chỉ tạo ~/.ama/.env (quyền 600) nếu chưa có.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKETPLACE = JSON.parse(fs.readFileSync(path.join(KIT, '.claude-plugin', 'marketplace.json'), 'utf8')).name;
const PLUGIN = JSON.parse(fs.readFileSync(path.join(KIT, '.claude-plugin', 'plugin.json'), 'utf8'));
const ID = `${PLUGIN.name}@${MARKETPLACE}`;
const USER_ENV = path.join(os.homedir(), '.ama', '.env');
const KIT_ENV = path.join(KIT, '.env');

const args = new Set(process.argv.slice(2));
const known = new Set(['--check', '--uninstall', '--dry-run', '--help', '-h']);
for (const a of args) {
  if (!known.has(a)) {
    console.error(`Không hiểu tham số: ${a}. Xem --help.`);
    process.exit(2);
  }
}
if (args.has('--help') || args.has('-h')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 9).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const DRY = args.has('--dry-run');

const step = (msg) => console.log(`\n▸ ${msg}`);
const ok = (msg) => console.log(`  ✔ ${msg}`);
const fail = (msg, code = 1) => {
  console.error(`  ✘ ${msg}`);
  process.exit(code);
};

/** Chạy lệnh claude; trả { status, out } để quyết định bước tiếp, không ném lỗi. */
function claude(...cmd) {
  if (DRY) {
    console.log(`  (dry-run) claude ${cmd.join(' ')}`);
    return { status: 0, out: '' };
  }
  const r = spawnSync('claude', cmd, { encoding: 'utf8' });
  if (r.error) return { status: -1, out: String(r.error.message) };
  return { status: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

// 1. điều kiện
step('Kiểm tra Node và Claude Code');
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) fail(`Cần Node 20 trở lên (đang có ${process.versions.node}).`, 2);
ok(`Node ${process.versions.node}`);
if (!DRY) {
  try {
    ok(`Claude Code ${execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim()}`);
  } catch {
    fail('Không tìm thấy lệnh "claude". Cài Claude Code: https://docs.claude.com/en/docs/claude-code/setup', 2);
  }
}

// gỡ cài đặt
if (args.has('--uninstall')) {
  step(`Gỡ ${ID}`);
  claude('plugin', 'uninstall', ID);
  claude('plugin', 'marketplace', 'remove', MARKETPLACE);
  ok(`Đã gỡ. ${USER_ENV} vẫn giữ nguyên; tự xóa nếu không dùng nữa.`);
  process.exit(0);
}

// 2. kiểm tra kit trước khi cài
step('Kiểm tra kit (validator)');
if (DRY) console.log('  (dry-run) node scripts/validate-governance.js');
else {
  const v = spawnSync(process.execPath, [path.join(KIT, 'scripts', 'validate-governance.js')], { encoding: 'utf8' });
  if (v.status !== 0) {
    console.error(v.stdout + v.stderr);
    fail('Validator báo lỗi, sửa trước khi cài.');
  }
  ok('Hợp lệ');
}

// 3. marketplace: thêm mới, hoặc cập nhật nếu đã có (plugin chạy từ bản copy, phải cập nhật mới thấy code mới)
step(`Marketplace "${MARKETPLACE}" → ${KIT}`);
let r = claude('plugin', 'marketplace', 'add', KIT);
if (r.status === 0) ok('Đã thêm');
else if (/already|exists|đã có/i.test(r.out)) {
  r = claude('plugin', 'marketplace', 'update', MARKETPLACE);
  if (r.status !== 0) fail(`Cập nhật marketplace thất bại:\n${r.out}`);
  ok('Đã có, đã cập nhật');
} else fail(`Thêm marketplace thất bại:\n${r.out}`);

// 4. plugin: cài lại để lấy bản mới nhất
step(`Plugin ${ID} (v${PLUGIN.version})`);
const removed = claude('plugin', 'uninstall', ID).status === 0;
r = claude('plugin', 'install', ID);
if (r.status !== 0) fail(`Cài plugin thất bại:\n${r.out}`);
ok(removed && !DRY ? 'Đã cài lại bản mới' : 'Đã cài');

// 5. file credential dùng chung
step(`Credential: ${USER_ENV}`);
if (fs.existsSync(USER_ENV)) ok('Đã có, giữ nguyên');
else if (DRY) console.log(`  (dry-run) tạo ${USER_ENV} từ ${fs.existsSync(KIT_ENV) ? '.env của kit' : '.env.example'}`);
else {
  fs.mkdirSync(path.dirname(USER_ENV), { recursive: true, mode: 0o700 });
  if (fs.existsSync(KIT_ENV)) {
    fs.copyFileSync(KIT_ENV, USER_ENV);
    ok(`Đã chép từ ${KIT_ENV}. Có thể xóa file đó để token chỉ còn một chỗ.`);
  } else {
    fs.copyFileSync(path.join(KIT, '.env.example'), USER_ENV);
    ok('Đã tạo từ .env.example. Mở file và điền giá trị (hoặc dùng keychain, xem README).');
  }
  fs.chmodSync(USER_ENV, 0o600);
}

// 6. thử kết nối
if (args.has('--check')) {
  step('Thử kết nối (workflow doctor)');
  if (DRY) console.log('  (dry-run) node bin/workflow.js doctor --only jira,confluence,figma');
  else spawnSync(process.execPath, [path.join(KIT, 'bin', 'workflow.js'), 'doctor', '--only', 'jira,confluence,figma'], { stdio: 'inherit', cwd: process.cwd() });
}

console.log(`
Xong. Mở Claude Code trong project của bạn:
  cd <project> && claude
rồi gõ /${PLUGIN.name}:setup (kiểm tra), /${PLUGIN.name}:analyze-requirement PROJ-123, /${PLUGIN.name}:qe PROJ-123.
Sửa code kit xong thì chạy lại script này để cập nhật plugin.`);
