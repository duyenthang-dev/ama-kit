// Credential chỉ đọc từ biến môi trường hoặc OS keychain. Xem rules/credential-protection.md.
//   1. biến môi trường
//   2. macOS Keychain:   security find-generic-password -s ama-kit -a <TÊN_BIẾN> -w
//      Linux libsecret:  secret-tool lookup service ama-kit account <TÊN_BIẾN>
// Không có file credential, không có cờ dòng lệnh cho token.

import { execFileSync } from 'node:child_process';
import { MissingEnvError } from './errors.js';

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

/** { value, source } — source là 'env' | 'keychain' | null. */
export function lookupCredential(key) {
  if (process.env[key]) return { value: process.env[key], source: 'env' };
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
