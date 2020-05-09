const fs = require('fs-extra');
const _ = require('./utils');
const { concat } = require('ffmpeg-simple');
const { concatDemux } = require('ffmpeg-simple');
const DateFns = require('date-fns');
const undb = require('undb');
const Subtitle = require('subtitle');
const { confirm } = require('enquire-simple');

const defaults = {
  baseDir: _.normalize('~/Documents/V380'),
  vidsDir(baseDir = defaults.baseDir) { return _.normalize([baseDir, 'Record']) },
  outputDir(baseDir = defaults.baseDir) { return _.normalize([baseDir, 'Consolidated']) },
  configDir(baseDir = defaults.baseDir) { return _.normalize([baseDir, 'v380-consolidator']) },
};

module.exports = main;


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

  if (!data.array.length) throw new Error(`No files found`)

  console.log(`Found:
  ${Object.keys(data.cameras).length} cameras:\t${Object.keys(data.cameras).join(', ')}
  ${Object.keys(data.dates).length} dates:\t${Object.keys(data.dates).join(', ')}
  ${data.array.length} files`);

  console.log('Getting metadata...');
  const metadataResult = await getMetadata(data.array, { cache });
  if (metadataResult.errors.length) {
    console.warn(`${metadataResult.errors.length}/${data.array.length} unreadable/corrupt files will be skipped`);
  }

  const jobs = [];

  const dates = Object.keys(data.dates).sort().reverse();
  for (const date of dates) {
    const dateData = data.dates[date];
    const cameras = Object.keys(dateData).sort();
    for (const camera of cameras) {
      const cameraData = dateData[camera];
      const cameraConfig = config[camera] || {};
      if (cameraConfig.disabled) {
        console.log(`Skipping disabled camera: ${camera}`);
        continue;
      }
      let clips = Object.values(cameraData);
      clips = clips.filter(x => x?.metadata?.duration);
      clips = clips.filter((x, i) => {
        return true;
        // return i === 0
        // // if (!debug) return true;
        // if (i === 0) return true;
        // if (i === Math.floor(clips.length / 2)) return true;
        // if (i === clips.length - 1) return true;
      })
      jobs.push({ camera, date, clips, config: { ...opts, ...cameraConfig, ...config } })
    }
    break;
  }

  const totalClips = jobs.reduce((p, c) => p + c.clips.length, 0);
  if (!await confirm(`Processing ${jobs.length} clips?`)) return;
  // console.log(`Processing ${jobs.length} clips...`);
  const startedAt = new Date;
  const eta = _.eta({ total: jobs.length });
  for (let i = 0; i < jobs.length; i++) {
    const { camera, date, clips, config } = jobs[i];
    console.log(`Job: ${i+1}/${jobs.length}. Camera: ${camera}, Date: ${date}`);
    await processClip(clips, {
      cache,
      output: _.normalize([opts.outputDir, `${camera}_${date}.mp4`]),
      onProgress(progress) {
        const ratio = ((i + (progress?.ratio || 0)) / jobs.length) || 0;
        const percent = Math.floor(ratio * 100);
        const e = eta({ ratio });
        const pretty = {}
        pretty.percent = `${percent}%`;
        if (progress.pretty) {
          if (progress.pretty.percent)
            pretty.currentPercent = `Current (${i+1}/${jobs.length}): ${progress.pretty.percent}`;
          if (progress.pretty.timemark)
            pretty.timemark = progress.pretty.timemark;
          if (progress.pretty.bitrate)
            pretty.bitrate = progress.pretty.bitrate;
          if (progress.pretty.size)
            pretty.size = progress.pretty.size;
          if (progress.pretty.fps)
            pretty.fps = progress.pretty.fps;
        }
        pretty.elapsed = `Elapsed: ${_.prettyMs(e.elapsed)}`;
        pretty.remaining = `ETA: ${_.prettyMs(e.remaining)}`;

        const string = Object.values(pretty).join(' | ');

        _.stdoutLine(string);
      },
      ...config,
    });
  }

  console.log(`All Done (in ${_.prettyMs(+new Date - +startedAt)})!`);
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
 * @param {Boolean|String} [opts.timestamp]
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
    onProgress: opts.onProgress
  };
  const subtitles = await generateSubtitles(array, {
    ...opts,
    output: _.pathFrom(output, { dirname: _.defaults.tmpdir, extname: '.srt' }),
  });
  if (opts.timestamp !== false) {
    if (opts.timestamp === 'srt') {
      const path = _.pathFrom(output, { extname: '.srt' });
      await fs.remove(path);
      await fs.move(subtitles, _.pathFrom(output, { extname: '.srt' }));
    } else {
      concatOpts.subtitles = subtitles;
    }
  }

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
  const speed = opts.speed || 1;
  opts.output = opts.output || _.tmpfile(+new Date + '.srt');
  const subtitlesArray = [];
  let I = 0
  for (const item of array) {
    const { metadata: { videoDuration, audioDuration }, dateTime } = item;
    const duration = videoDuration;
    for (let i = 0; i < duration; i += 1 * speed) {
      const d = new Date(+dateTime + (i * 1000));
      subtitlesArray.push({
        start: I,
        end: I += 1000,
        text: DateFns.format(d, 'yyyy-MM-dd HH:mm:ss'),
      });
    }
  }
  const srt = Subtitle.stringify(subtitlesArray);
  await fs.writeFile(opts.output, srt);
  return opts.output;
}
