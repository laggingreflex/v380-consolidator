#!/usr/bin/env node

const yargs = require('yargs');
const { name } = require('../package');
const lib = require('.');

yargs.scriptName(name);
yargs.options({});
yargs.command({
  command: 'clean',
  desc: 'Clean non-existing files',
  handler: opts => lib(opts),
});


yargs.demandCommand();

yargs.argv;

// main().finally(e => {
//   process.exitCode = 1;
// });
