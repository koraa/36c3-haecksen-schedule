// USAGE: node ./format.js fahrplan.html.pug < fahrplan.csv > fahrplan.html

const { floor, round } = Math;
const fs = require('fs');
const process = require('process');
const { promisify } = require('util');
const neatCsv = require('neat-csv');
const { renderFile: pugRender } = require('pug');
const {
  curry, isdef, pipe, map, list, obj, all, any, filter, group, uniq,
  empty, size, eq, each, setdefault, reject, mapSort,
} = require('ferrum');

const readFile = (file) => promisify(fs.readFile)(file, 'utf-8');

// Weird format dude (fraction of 24h)
// => Number of minutes
const decodeCsvTime = (t) => t * 24 * 60;

// Zero pad a number
const zpad = (n, cnt) => String(n).padStart(cnt, '0');

// Minutes => "HH:mm"
const fmtTime = (m) => `${zpad(floor(m/60), 2)}:${zpad(round(m % 60), 2)}`;

// Minutes => 2h or 2:30h or 30m
const fmtDuration = (t) => {
  const h = floor(t/60);
  const m = round(t%60);
  if (h > 0 && m > 0)
    return `${h}:${zpad(m, 2)}h`;
  else if (h == 0)
    return `${m}m`;
  else
    return `${h}h`;
};

// Monadic option chaining "map_opt"
const mopt = curry('mopt', (opt, fn) => isdef(opt) ? fn(opt) : opt);

// group() from ferrum with explicit container
const groupInto = curry('groupInto', (seq, cont, keyfn) => {
  each(seq, (elm) => setdefault(cont, keyfn(elm), []).push(elm));
  return cont;
});

// Import data to a sane format
const importTalk = o => ({
  speaker: o['Wer'],
  title: o['Was?'],
  day: mopt(o['Tag'], Number),
  start: mopt(o['Beginn'], decodeCsvTime),
  end: mopt(o['Ende'], decodeCsvTime),
  location: o['Raum'],
  description: o['Beschreibung (description)'],
  link: o['Link'],
});

// Validate a talk; returns whether the talk is OK
const validateTalk = o => {
  const required = ['title', 'day', 'start', 'end', 'location'];
  const {got = new Set(), missing = new Set()} = pipe(
    group(required, k => isdef(o[k]) ? 'got' : 'missing'),
    map(uniq), // toSet
    obj);

  // This is not an actual talk entry
  if (empty(got) || eq(got, uniq(['day'])))
    return false;

  if ((o.end - o.start) === 0) {
    console.warn(`[WARNING] Zero length talk? This can't be right!`, o);
    return false;
  }

  // Corrupt talk entry
  if (!empty(got) && !empty(missing)) {
    console.warn(`[WARNING] Corrupt talk entry is missing the keys {${missing}}:`, o);
    return false;
  }

  // Good talk
  return true;
};

const main = async (template = `${__dirname}/fahrplan.html.pug`) => pipe(
  // Parse CSV and interpret '' as null
  await neatCsv(process.stdin),
  map(map(([k, v]) => [k, (v === '' ? null : v)])),
  map(obj),

  map(importTalk),
  filter(validateTalk),

  // Hide talks
  reject(({day}) => day === 0),

  // Group by day and make a list of days
  group(({day}) => day),
  mapSort(([dayNo, v]) => dayNo), // chronological ordering
  map(([name, talks]) => ({
    name,
    talks: mapSort(talks, ({start}) => start), // chronological
  })),

  // Render
  days => pugRender(template, {
    pretty: true, // opts
    require, // helpers
    days: list(days), // variables
  }),

  // Output
  console.log);

const onUncaught = (e) => {
  console.error('[FATAL] Uncaught exception: ', e);
  process.exit(1);
};

const init = async () => {
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUncaught);
  process.on('SIGINT', () => exit(128));
  process.on('SIGTERM', () => exit(128));
  process.exitCode = (await main(...process.argv.slice(2))) || 0;
};

if (require.main === module)
  init();

module.exports = {
  init,
  main,
  onUncaught,
  validateTalk,
  importTalk,
  groupInto,
  mopt,
  fmtDuration,
  fmtTime,
  zpad,
  decodeCsvTime,
  readFile,
};
