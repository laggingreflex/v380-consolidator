const OS = require('os');
const Path = require('path');
const fs = require('fs').promises;
const pAll = require('p-all');
const { ffprobe } = require('ffmpeg-simple');
const prettyMs = require('pretty-ms');
const prettyBytes = require('pretty-bytes');
const lodash = require('lodash');

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
  const total = array.length;
  const eta = _.eta({ total });
  const log = lodash.throttle(_.stdoutLine, 1000, { trailing: false });
  return pAll(array.map((item, i) => async () => {
    try {
      return await cb(item);
    } catch (error) {
      if (opts.halt) throw error;
      if (opts.errors) opts.errors.push({ i, item, error });
    } finally {
      const e = eta();
      log(`${e.percent}% ${e.count}/${total} ETA: ${e.string}`);
      // _.stdoutLine(`${e.percent}% ${e.count}/${total} ETA: ${e.string}`);
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

_.safeInteger = n => Math.min(n || 0, Number.MAX_SAFE_INTEGER);
_.prettyMs = (ms, opts) => prettyMs(_.safeInteger(ms), { ...opts });
_.prettyS = (s, opts) => _.prettyMs(s * 1000, { ...opts });
_.prettyBytes = (size, opts) => prettyBytes(_.safeInteger(size), { ...opts });

_.eta = ({ total = NaN } = {}) => {
  let started;
  let lastCount = 0;
  return ({ ratio, percent, count } = {}) => {
    if (!started) started = +new Date;
    const now = +new Date;
    const elapsed = now - started;
    if (!ratio) {
      if (percent) {
        ratio = percent / 100;
      } else if (total) {
        if (count !== undefined) {
          ratio = count / total;
          percent = Math.floor(ratio * 100);
        } else {
          lastCount++;
          ratio = lastCount / total;
          percent = Math.floor(ratio * 100);
        }
      } else {
        return { started, percent, count: lastCount, total, elapsed, remaining: Infinity, string: '∞' };
        throw new Error(`Need either: ratio|percent|count`);
      }
    }
    const estimatedTotal = elapsed / ratio;
    const remaining = estimatedTotal - elapsed;
    const string = _.prettyMs(remaining);
    return { started, count: lastCount, total, percent, ratio, elapsed, remaining, string };
  }
}

_.stdoutLine = str => {
  process.stdout.clearLine();
  process.stdout.write(str);
  process.stdout.cursorTo(0);
};
