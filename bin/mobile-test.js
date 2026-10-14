#!/usr/bin/env node
// mobile-test — xem "mobile-test --help". Logic nằm ở src/commands/mobile-test.js.
import { main } from '../src/cli.js';

main('mobile-test', process.argv.slice(2));
