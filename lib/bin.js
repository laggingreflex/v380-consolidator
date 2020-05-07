#!/usr/bin/env node

const { spawnSync } = require('child_process')

// spawnSync('C:\\apps\\ffmpeg.EXE', [
//   '-i',
//   'C:\\Users\\x\\Documents\\V380\\Record\\19535382_2020-05-02_18-12-55.mp4',
//   '-i',
//   'C:\\Users\\x\\Documents\\V380\\Record\\19535382_2020-05-02_21-02-59.mp4',
//   '-i',
//   'C:\\Users\\x\\Documents\\V380\\Record\\19535382_2020-05-02_23-03-00.mp4',
//   '-y',
//   '-an',
//   '-r',
//   60,
//   '-cq:v',
//   20,
//   '-filter_complex',
//   // 'rotate=1.0995574287564276,subtitles="D\\\\\\\\\\\\:\\\\\\\\\\\\\\19535382.srt",setpts=(PTS-STARTPTS)/5',
//   // 'rotate=1.0995574287564276,subtitles=a\\\\\\\\19535382.srt,setpts=(PTS-STARTPTS)/5',
//   'rotate=1.0995574287564276,subtitles=D\\\\:\\\\\\\\19535382.srt,setpts=(PTS-STARTPTS)/5',
//   'C:\\Users\\x\\Documents\\V380\\Consolidated\\19535382_2020-05-02.mp4'
// ], {stdio: 'inherit'})

// process.exit()

const yargs = require('yargs');
const lib = require('.');

function test(string) {
  string = string.replace(/([:\\])/g, '\\$1')
  return string;
}

// console.log(test(yargs.argv._.join(' ')));

yargs.scriptName('v380');
yargs.options({});
// yargs.command({
//   command: 'consolidate',
//   default: true,
//   desc: 'Clean non-existing files',
//   handler: opts => lib(opts),
// });
// yargs.demandCommand();

// console.log(`yargs.argv:`, yargs.argv);

lib(yargs.argv).catch(error => {
  process.exitCode = 1;
  console.error(error);
});
