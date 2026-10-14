#!/usr/bin/env node
// confluence — xem "confluence --help". Logic nằm ở src/commands/confluence.js.
import { main } from '../src/cli.js';

main('confluence', process.argv.slice(2));
