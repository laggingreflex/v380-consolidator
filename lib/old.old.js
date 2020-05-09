const { ffmpeg } = require('ffmpeg-simple');
const { confirm } = require('enquire-simple');
const fs = require('fs-extra');
const _ = require('./utils');

const DIR = (...p) => paths.path.join('C:/Users/x/Documents/V380', ...p);
const VIDS_DIR = (...p) => DIR('Record', ...p);
const OUTPUT_DIR = (...p) => DIR('Date', ...p);
const EXT = '.mp4'
const speed = 10;

const cleanup = [];

module.exports = async (...args) => {
  try {
    return await main(...args);
  } finally {
    for (const fn of cleanup) {
      await _.try(fn);
    }
  }
};

async function main(argv) {

  await fs.ensureDir(OUTPUT_DIR());

  let array = await fs.fs.readdir(VIDS_DIR());
  array = array.filter(f => f.endsWith(EXT));
  array.sort();
  const object = {};
  // console.debug(files);

  for (const file of array) {
    const path = VIDS_DIR(file);
    const base = paths.path.basename(file, EXT);
    const [camera, date, time] = base.split('_');
    // console.debug({ camera, date, time });
    object[camera] = object[camera] || {};
    object[camera][date] = object[camera][date] || {};
    if (object[camera][date][time]) {
      console.error({ camera, date, time }, object[camera][date][time]);
      throw new Error('Invalid file');
    }
    object[camera][date][time] = { file, path };
  }


  const object2_pre = {};
  outer: for (const camera in object) {
    // let skipper = 0;
    for (const date in object[camera]) {
      // if (skipper++ >= 2) break outer;
      object2_pre[date] = object2_pre[date] || {};
      // object2_pre[date][camera] = object2_pre[date][camera] || {};
      object2_pre[date][camera] = object[camera][date];
    }
  }

  const object2 = {};
  for (const date of Object.keys(object2_pre).sort()) {
    object2[date] = object2_pre[date];
  }


  // console.debug(object2);
  // return

  for (const date in object2) {

    const isLast = date === Object.keys(object2).pop();
    // if (isLast) console.log('last date:', date);
    // continue

    for (const camera in object2[date]) {
      // const output = DIR(`${camera}_${date}.mkv`);
      const output = OUTPUT_DIR(`${date}_${camera}.mkv`);
      if (fs.exists(output) && !isLast) {
        // continue;
      }
      const subtitlesFile = fs.tmp() + '.srt';
      cleanup.push(() => fs.remove(subtitlesFile));

      let subtitles = [];
      let filelist = [];

      let skipper = 0;
      for (const time in object[camera][date]) {
        // if (skipper++ >= 12) continue;
        // if ((skipper++ % 30)) continue;
        const { path } = object[camera][date][time];

        if (isLast) {
          // console.log('To be kept:', path);
        } else {
          // console.log('To be deleted:', path);
          // cleanup.push(() => trash([path]));
          cleanup.push(() => fs.remove(path));
        }

        // continue;

        filelist.push(`file '${path}'`);
        const probe = await ffmpeg.probe(path);
        const { duration } = probe.format;
        const [year, month, day] = date.split('-');
        const [hour, minute, second] = time.split('-');
        let d = new Date();
        d.setFullYear(year);
        d.setMonth(month - 1);
        d.setDate(day);
        d.setHours(hour);
        d.setMinutes(minute);
        d.setSeconds(second);
        // console.debug({ camera, date, time, duration, year, month, day, hour, minute, second, toLocaleTimeString: d.toLocaleTimeString(), toLocaleString: d.toLocaleString(), });
        // const array = [];
        for (let i = 0; i < duration; i++) {
          // array.push(d.toLocaleString())
          // const localeString = d.toLocaleString();
          // subtitles.push(localeString);
          // array.push(`${i} ` + d.toLocaleString())
          subtitles.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
          // console.debug(subtitles, d);
          // return
          d = new Date(+d + 1000);
        }
        // console.debug(array);
        // return
      }
      // console.debug({ subtitles });
      // return


      let [hour, minute, second] = [0, 0, -1];
      subtitles = subtitles.map((timestamp, i) => {
        second++;
        if (second >= 60) {
          second = 0;
          minute++;
        }
        if (minute >= 60) {
          minute = 0
          hour++;
        }
        return [
          i + 1,
          `${pad(hour)}:${pad(minute)}:${pad(second)},000 --> ${next({hour, minute, second}).string}`,
          `${timestamp}`,
          '',
        ].join('\n');
      });
      subtitles = subtitles.join('\n');
      await fs.writeFile(subtitlesFile, subtitles);


      // const array = Object.keys(object[camera][date]);
      // let filelist = Object.values(object[camera][date]);
      // filelist = filelist.map(({ path }) => `file '${path}'`);

      // filelist = filelist.filter((x, i) => !(i % 20));
      // filelist = filelist.filter((x, i) => i >= 0 && i < 2);
      // filelist = filelist.filter((x, i) => i >= 2 && i < 4);
      // filelist = filelist.filter((x, i) => !(i % 5))
      // return console.debug(filelist);

      // if (fs.exists(output)) {
      //   const org = output.replace('.mp4', '_org.mp4');
      //   await fs.rename(output, org);
      //   filelist.unshift(`file '${org}'`);
      // }
      // filelist = [...filelist]
      filelist = filelist.join('\n');



      // console.debug({ filelist, subtitles });
      // console.debug(subtitles);
      // return
      // continue;
      const tmp = fs.tmp();
      cleanup.push(() => fs.remove(tmp));
      // return console.debug({ output })
      await fs.writeFile(tmp, filelist);


      // if (fs.exists(output) && !isLast) {
      //   continue;
      // }


      const { output: { probe: outputProbe } } = await ffmpeg.Ffmpeg(async ffmpeg => {
        ffmpeg.input(tmp);
        ffmpeg.inputOptions('-f', 'concat');
        ffmpeg.inputOptions('-safe', 0);
        ffmpeg.input(subtitlesFile);
        ffmpeg.inputOptions('-f', 'srt');
        // ffmpeg.videoCodec('libx265');
        // ffmpeg.videoFilters('rotate=45');
        // ffmpeg.videoFilters(`setpts=${1/speed}*PTS`);
        // ffmpeg.audioFilters(`atempo=${speed}`);
        // ffmpeg.fps(120);
        ffmpeg.outputOptions('-c', 'copy');
        // ffmpeg.outputOptions('-metadata:s:s:0', 'language=en');
        ffmpeg.output(output);
      });


      // console.debug(outputProbe);

      // subtitles.push(1);

      // return

    }
  }
}

function next({ hour, minute, second }) {
  second++;
  if (second >= 60) {
    second = 0;
    minute++;
  }
  if (minute >= 60) {
    minute = 0
    hour++;
  }
  const string = `${pad(hour)}:${pad(minute)}:${pad(second)},000`;
  return { hour, minute, second, string };
}

function pad(input) {
  return String(input).padStart(2, 0);
}
