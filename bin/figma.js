#!/usr/bin/env node
// figma — xem "figma --help". Logic nằm ở src/commands/figma.js.
import { main } from '../src/cli.js';

main('figma', process.argv.slice(2));
