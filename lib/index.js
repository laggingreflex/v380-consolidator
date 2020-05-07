const fs = require('fs-extra');
const _ = require('./utils');
const { concat } = require('ffmpeg-simple');
const { concatDemux } = require('ffmpeg-simple');
const DateFns = require('date-fns');
const undb = require('undb');

module.exports = main;

const defaults = {
  baseDir: _.normalize('~/Documents/V380'),
  vidsDir(baseDir = defaults.baseDir) { return _.normalize([baseDir, 'Record']) },
  outputDir(baseDir = defaults.baseDir) { return _.normalize([baseDir, 'Consolidated']) },
  configDir(baseDir = defaults.baseDir) { return _.normalize([baseDir, 'v380-consolidator']) },
};


/**
 * @param {Object} opts
 * @param {String} [opts.baseDir=~/Documents/V380]
 * @param {String} [opts.vidsDir=baseDir/Record]
 * @param {String} [opts.outputDir=baseDir/Consolidated]
 * @param {String} [opts.configDir=baseDir/v380-consolidator]
 * @param {Boolean} [opts.speed]
 * @param {Number} [opts.rotate]
 * @param {Boolean} [opts.audio]
 * @param {Number} [opts.fps]
 */
async function main(opts) {
  opts.baseDir = opts.baseDir || defaults.baseDir;
  opts.vidsDir = _.normalize(opts.vidsDir || defaults.vidsDir(opts.baseDir), { cwd: opts.baseDir });
  opts.outputDir = _.normalize(opts.outputDir || defaults.outputDir(opts.baseDir), { cwd: opts.baseDir });
  opts.configDir = _.normalize(opts.configDir || defaults.configDir(opts.baseDir), { cwd: opts.baseDir });

  // const
  const [cache] = undb({
    path: _.normalize([opts.configDir, 'cache.json']),
    throttle: 5000,
    silent: true,
  });
  const [config] = undb({
    path: _.normalize([opts.configDir, 'config.json']),
    silent: true,
  });

  const data = await readdir(opts.vidsDir);
  console.log(`Found:
  ${Object.keys(data.cameras).length} cameras:\t${Object.keys(data.cameras).join(', ')}
  ${Object.keys(data.dates).length} dates:\t${Object.keys(data.dates).join(', ')}
  ${data.array.length} files`);

  console.log('Getting metadata...');
  const metadataResult = await getMetadata(data.array, { cache });
  if (metadataResult.errors.length) {
    console.warn(`${metadataResult.errors.length}/${data.array.length} unreadable/corrupt files will be skipped`);
  }

  for (const date in data.dates) {
    const dateData = data.dates[date];
    for (const camera in dateData) {
      const cameraData = dateData[camera];
      const cameraConfig = config[camera] || {};
      if (cameraConfig.disabled) {
        console.log(`Skipping disabled camera: ${camera}`);
        continue;
      }
      // console.log(`Processing: ${camera}_${date}...`);
      console.log(`Processing Camera: ${camera}, Date: ${date}`);
      let clips = Object.values(cameraData);
      clips = clips.filter((x, i) => {
        return true;
        if (i === 0) return true;
        if (i === Math.floor(clips.length / 2)) return true;
        if (i === clips.length - 1) return true;
      })
      // clips.splice(2, Infinity);
      const c = { ...opts, ...cameraConfig, ...config };
      await processClip(clips, {
        cache,
        output: _.normalize([opts.outputDir, `${camera}_${date}.mp4`]),
        ...c,
      });
      // break;
      // return;
    }
    // break;
  }
}

/**
 * @typedef {Object} vidsData
 * @property {object} cameras
 * @property {Object} dates
 * @property {vidData[]} array
 */

/**
 * @typedef {Object} vidData
 * @property {String} camera
 * @property {String} date
 * @property {String} time
 * @property {Date} dateTime
 * @property {String} file
 * @property {object} [metadata]
 */

/**
 * @param {String} vidsDir
 * @returns {Promise<vidsData>} data
 */
async function readdir(vidsDir) {
  let files = await fs.readdir(vidsDir);
  files = files.filter(f => f.endsWith('.mp4'));
  files.sort();
  // console.log(array);
  const dates = {};
  const cameras = {};

  /** @type {vidData[]} */
  const array = [];
  // const cameras = new Set;
  for (const item of files) {
    const [, camera, date, time] = item.match(/([0-9]+)_([0-9-]+)_([0-9-]+)/);
    const dateTime = DateFns.parse(`${date}_${time}`, 'yyyy-MM-dd_HH-mm-ss', new Date);
    // console.log({ id: camera, date, time, dateTime: dateTime.toLocaleString() });
    if (!dates[date]) dates[date] = {};
    if (!dates[date][camera]) dates[date][camera] = {};
    if (!cameras[camera]) cameras[camera] = {};
    if (!cameras[camera][date]) cameras[camera][date] = {};
    const file = _.normalize([vidsDir, `${camera}_${date}_${time}.mp4`]);
    // const metadata = await ffprobe(file);
    /** @type {vidData} */
    const vidData = { camera, date, time, dateTime, file };
    dates[date][camera][time] = vidData;
    cameras[camera][date][time] = vidData;
    array.push(vidData);
    // console.log({ camera, date, time, dateTime, file });
  }
  array.sort(_.sort(x => `${x.date}_${x.camera}_${x.time}`));
  return { cameras, dates, array };
}

/**
 * @param {vidData[]} array
 * @param {Object} [opts]
 * @param {object} [opts.cache]
 * @param {Boolean} [opts.halt]
 * @param {Boolean} [opts.force]
 * @param {Boolean} [opts.retry]
 */
async function getMetadata(array, { halt = false, force = false, cache = {}, retry = false } = {}) {
  const errors = [];
  await _.all(array, async data => {
    try {
      data.metadata = await _.ffprobe(data.file, { cache, retry });
    } catch (error) {
      data.error = error;
      throw error;
    }
  }, { errors, halt });
  return { errors };
}

/**
 * @param {vidData[]} array
 * @param {Object} opts
 * @param {String} opts.output
 * @param {Object} [opts.cache]
 * @param {Number} [opts.rotate]
 * @param {Number} [opts.speed]
 * @param {Boolean} [opts.audio]
 * @param {Number} [opts.fps]
 * @param {Number} [opts.quality]
 * @param {Boolean} [opts.demux]
 */
async function processClip(array, { output, cache = {}, ...opts }) {
  array = array.filter(d => d.metadata);
  const files = array.map(d => d.file);

  const concatOpts = {
    inputs: files,
    outputOptions: [],
    filterComplex: [],
    output,
    audio: false,
  };
  const subtitles = await generateSubtitles(array, {
    ...opts,
    output: _.pathFrom(output, { dirname: _.defaults.tmpdir, extname: '.srt' }),
  });
  concatOpts.subtitles = subtitles;

  let runner;

  if (opts.demux) {
    runner = concatDemux;
  } else {
    runner = concat;
    Object.assign(concatOpts, opts);
    if (opts.quality) {
      concatOpts.outputOptions.push('-cq:v', opts.quality);
    }
  }

  try {
    await runner(concatOpts);
  } finally {
    fs.remove(subtitles);
  }
}

async function generateSubtitles(array, opts) {
  let subtitles = [];
  opts.output = opts.output || _.tmpfile(+new Date + '.srt');
  for (const item of array) {
    try {
      const { metadata: { videoDuration, audioDuration }, dateTime } = item;
      const duration = videoDuration;
      for (let i = 0; i < duration; i++) {
        const d = new Date(+dateTime + (i * 1000));
        subtitles.push(DateFns.format(d, 'yyyy-MM-dd HH:mm:ss'));
      }
    } catch (error) {
      console.error(item);
      throw error;
    }
  }

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


  await fs.writeFile(opts.output, subtitles.join('\n'));

  return opts.output;

  function pad(input) {
    return String(input).padStart(2, 0);
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

}
