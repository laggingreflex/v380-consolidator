const OS = require('os');
const Path = require('path');
const fs = require('fs').promises;
const pAll = require('p-all');
const ProgressBar = require('progress');
const { ffprobe } = require('ffmpeg-simple');

const _ = exports;

_.defaults = {
  cwd: process.cwd(),
  homedir: OS.homedir(),
  tmpdir: OS.tmpdir(),
};

_.tmpfile = (p = String(+new Date)) => Path.join(OS.tmpdir(), p);

_.pathFrom = (input, mods = {}) => {
  if (!input) throw new Error('Need an input');
  let output = input;
  for (const key in mods) {
    if (!(key in Path)) throw new Error(`'${key}' is not a valid Path attribute`);
    const attribute = Path[key](output);
    output = output.replace(attribute, mods[key]);
  }
  return output;
}

_.normalize = (path, {
  cwd = _.defaults.cwd,
  homedir = _.defaults.homedir,
} = {}) => {
  if (Array.isArray(path)) path = Path.join(...path);
  if (Path.isAbsolute(path)) return path;
  if (path.startsWith('~')) return Path.join(homedir, path.substr(1));
  return Path.join(cwd, path);
};

_.sort = (x, m) => (a, b) => (x(a) - x(b)) * m;

_.all = (array, cb, opts) => {
  const bar = new ProgressBar(':percent :current/:total ETA::eta', { total: array.length })
  return pAll(array.map((item, i) => async () => {
    try {
      return await cb(item);
    } catch (error) {
      if (opts.halt) throw error;
      if (opts.errors) opts.errors.push({ i, item, error });
    } finally {
      bar.tick();
    }
  }), { concurrency: opts.concurrency || 10 })
};

_.stat = async (file, cache = {}) => {
  if (cache[file] && cache[file].stats) return cache[file].stats;
  const stats = await fs.stat(file);
  const data = {
    size: stats.size,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    atime: stats.atimeMs,
    mtime: stats.mtimeMs,
    ctime: stats.ctimeMs,
  }
  cache[file] = { ...cache[file], stats: data };
  return data;
}

_.ffprobe = async (file, { cache = {}, retry = false } = {}) => {
  if (cache[file] && cache[file].ffprobe) return cache[file].ffprobe;
  if (cache[file]) {
    if (cache[file].ffprobe) return cache[file].ffprobe;
    if (cache[file].ffprobeError && !retry) throw new Error(cache[file].ffprobeError);
  }
  try {
    const probe = await ffprobe(file);
    cache[file] = { ...cache[file], ffprobe: probe, ffprobeError: null };
    return probe;
  } catch (error) {
    cache[file] = { ...cache[file], ffprobeError: error.message };
    throw error;
    // return { error };
  }
}
