// Tiện ích test: chạy CLI như tiến trình con và dựng server HTTP giả cho Jira, Confluence, Figma, BrowserStack.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT = fileURLToPath(new URL('..', import.meta.url));
export const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

/** Chạy bin/<cmd>.js; luôn resolve với { code, stdout, stderr }. */
export function cli(cmd, args, { cwd, env = {} } = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(KIT, 'bin', `${cmd}.js`), ...args], { cwd: cwd || KIT, env: { PATH: process.env.PATH, HOME: cwd || os.tmpdir(), AMA_NO_KEYCHAIN: '1', AMA_NO_ENV_FILE: '1', ...env } }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr })
    );
  });
}

export function tmpdir(prefix = 'ama-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...c) => ({ type: 'paragraph', content: c });
export const doc = (...c) => ({ version: 1, type: 'doc', content: c });
export const adf = { t, p, doc };

/**
 * Server giả. routes(req, url, body) trả [status, json] | { raw: Buffer, type } | null (404).
 * Ghi lại mọi request vào server.log.
 */
export async function mockServer(routes) {
  const log = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      log.push({ method: req.method, path: url.pathname, search: url.search, body, auth: !!(req.headers.authorization || req.headers['x-figma-token']) });
      const r = routes(req, url, body, base);
      if (!r) return res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: `no route ${req.method} ${url.pathname}` }));
      if (r.raw) return res.writeHead(200, { 'Content-Type': r.type || 'application/octet-stream' }).end(r.raw);
      res.writeHead(r[0], { 'Content-Type': 'application/json' }).end(JSON.stringify(r[1]));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, log, close: () => new Promise((r) => server.close(r)) };
}
