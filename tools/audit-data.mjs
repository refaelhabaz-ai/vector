#!/usr/bin/env node
// Integrity audit of the data embedded in index.html. It needs no network: it checks that the data agrees with itself.
// It cannot tell whether a number is the number the institution published today: that is what watch-sources.mjs is for.
//
//   node tools/audit-data.mjs            human readable report, exit code 1 if there is an error
//   node tools/audit-data.mjs --json     the same findings as JSON
//   node tools/audit-data.mjs --today 2026-10-25   (for tests) the date used for the freshness check
import { loadSite } from './lib/site-data.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const TODAY = new Date((val('--today', '') || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');

const { DATA } = loadSite();
const INST = new Map(DATA.inst.map((i) => [i.id, i]));
const DEG = new Map();
const findings = [];
const add = (level, code, msg, ids = []) => findings.push({ level, code, msg, ids });
const names = (L) => L.map((x) => x.n || x.id || x);

// ---- 1. identifiers ----
const dup = (arr, f) => { const s = new Set(), d = new Set(); arr.forEach((x) => { const k = f(x); if (s.has(k)) d.add(k); s.add(k); }); return [...d]; };
{
  const d1 = dup(DATA.inst, (i) => i.id);
  if (d1.length) add('error', 'inst.id.dup', 'institution ids repeat', d1);
  const d2 = dup(DATA.deg, (d) => d.id);
  if (d2.length) add('error', 'deg.id.dup', 'degree ids repeat', d2);
  DATA.deg.forEach((d) => DEG.set(d.id, d));
}

// ---- 2. references ----
{
  const badOf = [], badTh = [], thNotOffered = [], emptyOf = [];
  const thrKnown = new Set(Object.keys(DATA.thr || {}));
  for (const d of DATA.deg) {
    if (!d.of.length) emptyOf.push(d.id);
    for (const o of d.of) if (!INST.has(o.i)) badOf.push(`${d.id}:${o.i}`);
    for (const i of Object.keys(d.th || {})) {
      if (!INST.has(i)) badTh.push(`${d.id}:${i}`);
      else if (!d.of.some((o) => o.i === i)) thNotOffered.push(`${d.id}:${i}`);
      else if (!thrKnown.has(i)) badTh.push(`${d.id}:${i} (no source in DATA.thr)`);
    }
  }
  if (badOf.length) add('error', 'of.inst.missing', 'a degree is offered by an institution that does not exist', badOf);
  if (badTh.length) add('error', 'th.inst.invalid', 'threshold rows of an unknown institution', badTh);
  if (thNotOffered.length) add('warn', 'th.not.offered', 'threshold rows of an institution that does not offer the degree', thNotOffered);
  if (emptyOf.length) add('info', 'deg.no.offer', `${emptyOf.length} degrees have no institution (merged into another by an alias, or placeholders)`, emptyOf.slice(0, 30));
  const aliasBad = Object.entries(DATA.alias || {}).filter(([a, b]) => !DEG.has(b)).map(([a, b]) => `${a}->${b}`);
  if (aliasBad.length) add('error', 'alias.target.missing', 'an alias points to a degree that does not exist', aliasBad);
  const aliasLive = Object.keys(DATA.alias || {}).filter((a) => DEG.has(a));
  if (aliasLive.length) add('warn', 'alias.source.live', 'an alias id still exists as a degree (the alias hides it)', aliasLive);
  const avBad = DATA.deg.filter((d) => d.av && !DATA.af[d.av]).map((d) => `${d.id}:${d.av}`);
  if (avBad.length) add('error', 'av.missing', 'a degree points at an Avodata field that is not in the data', avBad);
  const occBad = [];
  for (const [id, f] of Object.entries(DATA.af)) for (const o of f.occ || []) if (!DATA.oc[o.id]) occBad.push(`${id}:${o.id}`);
  if (occBad.length) add('error', 'occ.missing', 'a field lists an occupation that is not in the data', occBad);
  const admBad = Object.keys(DATA.adm || {}).filter((i) => !INST.has(i));
  if (admBad.length) add('error', 'adm.inst.missing', 'admission text of an unknown institution', admBad);
}

// ---- 3. a degree split into variants is invisible from its main page ----
// "מדעי המחשב (ארבע-שנתי)" and "(תלת-שנתי)" are one subject for a reader. When the Council lists each length of study as a separate degree, the institution
// that offers only those (the Technion) is missing from the main degree. The site joins them when it loads (normalizeDegrees in index.html); this finds them.
{
  const byName = new Map(); DATA.deg.forEach((d) => { if (!byName.has(d.n)) byName.set(d.n, d); });
  const rx = /^(.*?)\s*\((?:ארבע|תלת|חד|דו|חמש|שש)-שנתי\)\s*$/;
  const L = [];
  for (const d of DATA.deg) {
    const m = d.n.match(rx); if (!m) continue;
    const base = byName.get(m[1].trim());
    if (!base || base.id === d.id) { L.push(`${d.id} "${d.n}": no main degree named "${m[1].trim()}"`); continue; }
    const missing = d.of.filter((o) => !base.of.some((b) => b.i === o.i)).map((o) => INST.get(o.i).n);
    if (missing.length) L.push(`${d.id} "${d.n}" -> ${base.id} "${base.n}": ${missing.join(', ')} not listed on the main degree`);
  }
  if (L.length) add('warn', 'variant.split', 'a length-of-study variant holds institutions that its main degree does not list (joined by the site when it loads: normalizeDegrees in index.html)', L);
}

// ---- 4. thresholds ----
{
  // the plausible range of each published scale; a value outside it is a typo or a column that moved
  const RANGE = { huji: [10, 30], tau: [300, 800], bgu: [300, 800], haifa: [400, 800], technion: [70, 110] };
  const out = [], repeats = [], noNum = [];
  for (const d of DATA.deg) for (const [i, rows] of Object.entries(d.th || {})) {
    const seen = new Set();
    for (const r of rows) {
      const k = JSON.stringify([r.n, r.v, r.extra || '', r.dep || '', r.fac || '']);
      if (seen.has(k)) repeats.push(`${d.id}@${i} "${r.n}" ${r.v}`);
      seen.add(k);
      if (typeof r.v === 'number') { const R = RANGE[i]; if (R && (r.v < R[0] || r.v > R[1])) out.push(`${d.id}@${i} "${r.n}" = ${r.v} (expected ${R[0]}-${R[1]})`); }
      else noNum.push(`${d.id}@${i} "${r.n}"`);
    }
  }
  if (out.length) add('error', 'th.range', 'a threshold outside the range of its scale', out);
  if (repeats.length) add('warn', 'th.row.dup', 'the same threshold row appears twice (the site shows it once)', repeats);
  if (noNum.length) add('info', 'th.nonnumeric', `${noNum.length} threshold rows have no number (text conditions only)`, noNum.slice(0, 20));
  // an institution with a table, and how much of what it offers has a row
  const cov = [];
  for (const i of Object.keys(DATA.thr || {})) {
    const offered = DATA.deg.filter((d) => d.of.some((o) => o.i === i));
    const has = offered.filter((d) => (d.th || {})[i]);
    cov.push(`${INST.get(i).n}: ${has.length} of ${offered.length} degrees have a threshold row`);
  }
  add('info', 'th.coverage', 'threshold coverage of the universities that publish a table', cov);
  const miss = Object.entries(DATA.missing || {}).map(([i, why]) => `${INST.has(i) ? INST.get(i).n : i}: ${why}`);
  if (miss.length) add('info', 'th.missing.institutions', 'institutions whose thresholds were not collected', miss);
}

// ---- 5. text of names ----
{
  const latin = [], odd = [];
  const check = (id, s) => {
    if (typeof s !== 'string') return;
    // an English word inside a Hebrew name is fine ("Embedded"); it is suspicious when it is lower case and in no English dictionary order: a reversed word
    for (const w of s.match(/[A-Za-z]{4,}/g) || []) if (/[א-ת]/.test(s) && w === w.toLowerCase()) latin.push(`${id}: "${s}"`);
    if (/\s{2,}|^\s|\s$/.test(s) || /[‎‏‪-‮]/.test(s)) odd.push(`${id}: ${JSON.stringify(s)}`);
  };
  DATA.deg.forEach((d) => check(d.id, d.n));
  DATA.inst.forEach((i) => check(i.id, i.n));
  DATA.mahat.forEach((m, k) => check('mahat#' + k, m.n));
  if (latin.length) add('warn', 'name.latin', 'a lower-case English word inside a Hebrew name (a word kept in reversed order looks like this)', latin);
  if (odd.length) add('warn', 'name.space', 'a name with double, leading or trailing spaces, or with direction marks', odd);
}

// ---- 6. links ----
{
  const bad = [];
  const seen = new Set();
  const chk = (u, w) => { if (typeof u !== 'string' || seen.has(u)) return; seen.add(u); if (!/^https:\/\//.test(u)) bad.push(`${w}: ${u}`); };
  DATA.inst.forEach((i) => { chk(i.site, i.id); chk(i.che, i.id); });
  Object.entries(DATA.thr).forEach(([i, t]) => [t.src, t.calc, t.sheet].forEach((u) => chk(u, i)));
  if (bad.length) add('warn', 'url.not.https', 'a source that is not an https link', bad);
  const noSite = DATA.inst.filter((i) => !i.site).map((i) => i.n);
  if (noSite.length) add('info', 'inst.no.site', 'institutions without a site link', noSite);
}

// ---- 7. freshness ----
{
  const age = (iso) => Math.round((TODAY - new Date(iso + 'T00:00:00Z')) / 864e5);
  const L = [['degrees and institutions', DATA.built], ['Avodata (fields)', DATA.avBuilt], ['Avodata (occupations)', DATA.ocBuilt], ['direction questionnaire', DATA.dir && DATA.dir.built]].filter((x) => x[1]);
  for (const [what, iso] of L) {
    const n = age(iso);
    add(n > 120 ? 'warn' : 'info', 'fresh', `${what}: collected ${iso}, ${n} days ago${n > 120 ? ' (older than 120 days: re-collect before the next registration season)' : ''}`);
  }
}

// ---- 8. the example the owner asked about: computer science and the Technion ----
{
  const fam = (rx) => DATA.deg.filter((d) => rx.test(d.n));
  const cs = fam(/^מדעי המחשב( \(|$)/);
  const insts = new Set(); cs.forEach((d) => d.of.forEach((o) => insts.add(o.i)));
  const list = [...insts].map((i) => INST.get(i).n).sort((a, b) => a.localeCompare(b, 'he'));
  add('info', 'cs.institutions', `computer science is offered at ${insts.size} institutions (main degree and its variants): ${list.join(' | ')}`);
  const main = DATA.deg.find((d) => d.n === 'מדעי המחשב');
  if (main && !main.of.some((o) => o.i === 'technion') && cs.some((d) => d.of.some((o) => o.i === 'technion')))
    add('warn', 'cs.technion', 'the Technion offers computer science only under variant ids: it is missing from the main degree page unless the variants are joined (normalizeDegrees)', cs.filter((d) => d.of.some((o) => o.i === 'technion')).map((d) => d.id));
}

// ---- report ----
const order = { error: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.level] - order[b.level]);
if (flag('--json')) {
  console.log(JSON.stringify({ today: TODAY.toISOString().slice(0, 10), counts: Object.fromEntries(['error', 'warn', 'info'].map((l) => [l, findings.filter((f) => f.level === l).length])), findings }, null, 1));
} else {
  const mark = { error: 'ERROR', warn: 'WARN ', info: 'info ' };
  for (const f of findings) {
    console.log(`${mark[f.level]} ${f.code}: ${f.msg}`);
    for (const id of f.ids.slice(0, flag('--all') ? 1e9 : 12)) console.log(`        ${id}`);
    if (f.ids.length > 12 && !flag('--all')) console.log(`        ... and ${f.ids.length - 12} more (--all shows everything)`);
  }
  const n = (l) => findings.filter((f) => f.level === l).length;
  console.log(`\n${n('error')} error(s), ${n('warn')} warning(s), ${n('info')} note(s)`);
}
process.exit(findings.some((f) => f.level === 'error') ? 1 : 0);
