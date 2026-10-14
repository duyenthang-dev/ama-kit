#!/usr/bin/env node
// context-brief — xem "context-brief --help". Logic nằm ở src/commands/context-brief.js.
import { main } from '../src/cli.js';

main('context-brief', process.argv.slice(2));
