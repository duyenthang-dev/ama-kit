#!/usr/bin/env node
// jira — xem "jira --help". Logic nằm ở src/commands/jira.js.
import { main } from '../src/cli.js';

main('jira', process.argv.slice(2));
