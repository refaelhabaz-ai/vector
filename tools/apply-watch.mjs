#!/usr/bin/env node
// Writes the result of the source watch into the site's data (a small "watch" object at the end of the DATA line of index.html),
// so that the site can say, next to an institution, "its conditions page changed after we collected the data".
// It changes nothing else, and keeps the line endings of the file.
//
//   node tools/apply-watch.mjs --state data/watch            writes
//   node tools/apply-watch.mjs --state data/watch --dry-run  prints what it would write
import { readFileSync, writeFileSync } from 'node:fs';
import { SITE, loadSite } from './lib/site-data.mjs';
import { loadState, cadence } from './watch-sources.mjs';

const args = process.argv.slice(2);
const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dir = val('--state', 'data/watch');
const today = val('--today', new Date().toISOString().slice(0, 10));
const { DATA } = loadSite();
const INST = new Set(DATA.inst.map((i) => i.id));
const state = loadState(dir);
if (!Object.keys(state.sources).length) { console.error('no state in ' + dir + ': run tools/watch-sources.mjs first'); process.exit(1); }

/** the pages that changed after the data was collected, for the institutions they belong to (a page that changes on every look is noise and is left out) */
export function summarize(state, built, today) {
  const changed = [];
  let failed = 0;
  for (const [url, r] of Object.entries(state.sources)) {
    if (r.status !== 'ok') failed++;
    if (!r.lastChanged || r.lastChanged < built) continue;
    if (cadence(r, today).cls === 'volatile') continue;
    const kind = (r.kinds || []).find((k) => k === 'thresholds' || k === 'admission' || k === 'registration' || k === 'calculator');
    const inst = (r.who || []).find((w) => INST.has(w));
    if (!kind || !inst) continue;
    changed.push({ i: inst, k: kind, t: r.lastChanged, u: url });
  }
  changed.sort((a, b) => b.t.localeCompare(a.t));
  return { checked: state.checked || today, total: Object.keys(state.sources).length, failed, changed: changed.slice(0, 300) };
}

const summary = summarize(state, DATA.built, today);
if (args.includes('--dry-run')) { console.log(JSON.stringify(summary, null, 1)); process.exit(0); }

const text = readFileSync(SITE, 'utf8');
const lines = text.split('\n');
const idx = lines.findIndex((l) => l.startsWith('const DATA = '));
if (idx < 0) throw new Error('the DATA line was not found');
const m = /^(const DATA = )(.*)(;\s*)$/s.exec(lines[idx]);
if (!m) throw new Error('the DATA line does not end with ";"');
let body = m[2];
const at = body.lastIndexOf(',"watch":');
if (at >= 0) body = body.slice(0, at) + '}';                         // the watch object is always the last key: replace it
if (!body.endsWith('}')) throw new Error('the DATA object does not end with "}"');
body = body.slice(0, -1) + ',"watch":' + JSON.stringify(summary) + '}';
lines[idx] = m[1] + body + m[3];
writeFileSync(SITE, lines.join('\n'));
console.log(`index.html: watch of ${summary.checked}, ${summary.total} pages, ${summary.changed.length} changed since ${DATA.built}, ${summary.failed} not readable`);
