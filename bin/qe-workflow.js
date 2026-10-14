#!/usr/bin/env node
// qe-workflow — xem "qe-workflow --help". Logic nằm ở src/commands/qe-workflow.js.
import { main } from '../src/cli.js';

main('qe-workflow', process.argv.slice(2));
