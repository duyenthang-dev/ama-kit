// Phân tích tham số chung cho mọi lệnh: --help, --dry-run, và chặn cờ chứa bí mật.

import { parseArgs as nodeParseArgs } from 'node:util';
import { UsageError } from './errors.js';

/** Cờ bị cấm: bí mật không bao giờ đi qua dòng lệnh (lộ trong shell history, ps, log). */
export const FORBIDDEN_FLAGS = ['--token', '--password', '--api-token', '--access-key', '--secret'];

const ENV_HINT = {
  '--token': 'ATLASSIAN_API_TOKEN hoặc FIGMA_ACCESS_TOKEN',
  '--api-token': 'ATLASSIAN_API_TOKEN',
  '--access-key': 'BROWSERSTACK_ACCESS_KEY',
  '--password': 'biến môi trường tương ứng',
  '--secret': 'biến môi trường tương ứng',
};

/** Ném UsageError (exit 2) nếu có cờ bị cấm. Không bao giờ đưa giá trị vào thông báo. */
export function rejectForbiddenFlags(argv) {
  for (const a of argv) {
    const name = a.split('=')[0].toLowerCase();
    if (FORBIDDEN_FLAGS.includes(name)) {
      throw new UsageError(`Cờ ${name} không được phép: bí mật không truyền qua dòng lệnh. Đặt ${ENV_HINT[name]} trong biến môi trường hoặc keychain.`);
    }
  }
}

/**
 * parseArgs có sẵn --help/-h và --dry-run; lỗi tham số thành UsageError (exit 2).
 * @param {string[]} argv
 * @param {Record<string, import('node:util').ParseArgsOptionConfig>} options
 */
export function parseArgs(argv, options = {}) {
  rejectForbiddenFlags(argv);
  try {
    const { values, positionals } = nodeParseArgs({
      args: argv,
      allowPositionals: true,
      options: { help: { type: 'boolean', short: 'h' }, 'dry-run': { type: 'boolean' }, ...options },
    });
    return { flags: values, positionals, dryRun: !!values['dry-run'], help: !!values.help };
  } catch (e) {
    throw new UsageError(e.message);
  }
}

/** Kiểm tra mã issue dạng PROJ-123. */
export function requireIssueKey(key) {
  if (!key || !/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) {
    throw new UsageError(`Mã issue phải có dạng PROJ-123, nhận được "${key || ''}".`);
  }
  return key;
}

/** In kế hoạch cho --dry-run: không gọi API, không cần credential. */
export function printPlan(title, steps) {
  console.log(`DRY RUN — ${title}`);
  console.log('Không gọi API, không đọc credential. Các bước sẽ chạy:');
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
}
