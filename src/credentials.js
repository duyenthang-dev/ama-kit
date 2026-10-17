// Credential chỉ đọc từ biến môi trường hoặc OS keychain. Xem rules/credential-protection.md.
//   1. biến môi trường
//   2. file .env — .ama/.env của dự án, ~/.ama/.env, rồi .env ở gốc kit. File phải được git bỏ qua (.gitignore)
//      hoặc nằm ngoài repo git; nếu git đang theo dõi được file thì token trong đó bị bỏ qua kèm cảnh báo.
//   3. macOS Keychain:   security find-generic-password -s ama-kit -a <TÊN_BIẾN> -w
//      Linux libsecret:  secret-tool lookup service ama-kit account <TÊN_BIẾN>
// Không có cờ dòng lệnh cho token.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MissingEnvError } from './errors.js';
import { KIT_ROOT } from './root.js';

export const CREDENTIAL_KEYS = [
  'ATLASSIAN_SITE',
  'ATLASSIAN_EMAIL',
  'ATLASSIAN_API_TOKEN',
  'FIGMA_ACCESS_TOKEN',
  'BROWSERSTACK_USERNAME',
  'BROWSERSTACK_ACCESS_KEY',
];

export const SECRET_KEYS = new Set(['ATLASSIAN_API_TOKEN', 'FIGMA_ACCESS_TOKEN', 'BROWSERSTACK_ACCESS_KEY']);

export const SERVICE_KEYS = {
  atlassian: ['ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'],
  figma: ['FIGMA_ACCESS_TOKEN'],
  browserstack: ['BROWSERSTACK_USERNAME', 'BROWSERSTACK_ACCESS_KEY'],
};

const KEYCHAIN_SERVICE = 'ama-kit';

function fromKeychain(key) {
  if (process.env.AMA_NO_KEYCHAIN) return undefined;
  const run = (cmd, args) => {
    try {
      const v = execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim();
      return v || undefined;
    } catch {
      return undefined;
    }
  };
  if (process.platform === 'darwin') return run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', key, '-w']);
  if (process.platform === 'linux') return run('secret-tool', ['lookup', 'service', KEYCHAIN_SERVICE, 'account', key]);
  return undefined;
}

/**
 * Các file .env được đọc, theo thứ tự ưu tiên:
 *   <project>/.ama/.env (và mọi .ama/.env ở thư mục cha) → ~/.ama/.env (dùng chung mọi dự án) → .env ở gốc kit.
 * Cài kit dạng plugin Claude Code thì gốc kit là bản copy trong cache, nên đặt .env ở ~/.ama/.env.
 */
export function envFileCandidates(cwd = process.cwd()) {
  const out = [];
  const add = (p) => {
    if (!out.includes(p) && fs.existsSync(p)) out.push(p);
  };
  let dir = path.resolve(cwd);
  for (;;) {
    add(path.join(dir, '.ama', '.env'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  add(path.join(os.homedir(), '.ama', '.env'));
  if (!process.env.AMA_NO_KIT_ENV_FILE) add(path.join(KIT_ROOT, '.env'));
  return out;
}

/** File có an toàn để chứa token không: git bỏ qua nó, hoặc nó không nằm trong repo git nào. */
export function envFileIsPrivate(file) {
  const dir = path.dirname(file);
  const git = (args) => {
    try {
      execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore', timeout: 5000 });
      return 0;
    } catch (e) {
      return typeof e.status === 'number' ? e.status : -1;
    }
  };
  if (git(['check-ignore', '-q', file]) === 0) return true;
  return git(['rev-parse', '--is-inside-work-tree']) !== 0;
}

let fileCache = null;
const warned = new Set();

/** Đọc KEY=VALUE từ các file .env; chỉ giữ biến trong CREDENTIAL_KEYS. Token chỉ lấy từ file mà git không theo dõi. */
export function loadEnvFiles(cwd = process.cwd()) {
  if (process.env.AMA_NO_ENV_FILE) return {};
  if (fileCache && fileCache.cwd === cwd) return fileCache.values;
  const values = {};
  for (const file of envFileCandidates(cwd)) {
    let isPrivate;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]*)[ \t]*=[ \t]*(.*?)[ \t]*$/);
      if (!m) continue;
      const [, key, raw] = m;
      const value = raw.replace(/^(['"])(.*)\1$/, '$2');
      if (!value || !CREDENTIAL_KEYS.includes(key)) continue;
      if (SECRET_KEYS.has(key)) {
        isPrivate ??= envFileIsPrivate(file);
        if (!isPrivate) {
          const w = `${file}:${key}`;
          if (!warned.has(w)) {
            warned.add(w);
            process.stderr.write(`Cảnh báo: bỏ qua ${key} trong ${file} — git có thể commit file này. Thêm nó vào .gitignore hoặc dùng keychain.\n`);
          }
          continue;
        }
      }
      if (!(key in values)) values[key] = { value, file };
    }
  }
  fileCache = { cwd, values };
  return values;
}

/** { value, source } — source là 'env' | 'file:<đường dẫn>' | 'keychain' | null. */
export function lookupCredential(key) {
  if (process.env[key]) return { value: process.env[key], source: 'env' };
  const f = loadEnvFiles()[key];
  if (f) return { value: f.value, source: `file:${f.file}` };
  const k = fromKeychain(key);
  if (k) return { value: k, source: 'keychain' };
  return { value: undefined, source: null };
}

/** Lấy nhiều biến cùng lúc; thiếu biến nào thì báo đủ tên (exit 3), không in giá trị. */
export function requireCredentials(keys, hint) {
  const out = {};
  const missing = [];
  for (const k of keys) {
    const { value } = lookupCredential(k);
    if (value) out[k] = value;
    else missing.push(k);
  }
  if (missing.length) throw new MissingEnvError(missing, hint);
  return out;
}

export function mask(value) {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 3)}…${value.slice(-3)}`;
}

/** Mọi giá trị bí mật đang có, để che khỏi log của tiến trình con. */
export function knownSecrets() {
  return [...SECRET_KEYS].map((k) => lookupCredential(k).value).filter((v) => v && v.length >= 6);
}
