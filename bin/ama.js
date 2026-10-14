#!/usr/bin/env node
// ama — gọi mọi lệnh của kit qua một tên: "ama <lệnh> ...". Ví dụ: ama jira issue PROJ-123
import { COMMANDS, main, OVERVIEW } from '../src/cli.js';

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === '--help' || cmd === '-h') {
  process.stdout.write(OVERVIEW);
  process.exit(cmd ? 0 : 2);
}
if (cmd === '--version' || cmd === '-v') {
  const { readFileSync } = await import('node:fs');
  console.log(JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version);
  process.exit(0);
}
if (!COMMANDS.includes(cmd)) {
  process.stderr.write(`Lệnh không rõ: "${cmd}".\n\n${OVERVIEW}`);
  process.exit(2);
}
main(cmd, rest);
