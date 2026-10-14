#!/usr/bin/env node
// workflow — xem "workflow --help". Logic nằm ở src/commands/workflow.js.
import { main } from '../src/cli.js';

main('workflow', process.argv.slice(2));
