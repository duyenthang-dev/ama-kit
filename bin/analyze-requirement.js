#!/usr/bin/env node
// analyze-requirement — xem "analyze-requirement --help". Logic nằm ở src/commands/analyze-requirement.js.
import { main } from '../src/cli.js';

main('analyze-requirement', process.argv.slice(2));
