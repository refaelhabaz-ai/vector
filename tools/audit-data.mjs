#!/usr/bin/env node
// Integrity audit of the data embedded in index.html. It needs no network: it checks that the data agrees with itself.
// It cannot tell whether a number is the number the institution published today: that is what watch-sources.mjs is for.
//
//   node tools/audit-data.mjs            human readable report, exit code 1 if there is an error
//   node tools/audit-data.mjs --json     the same findings as JSON
//   node tools/audit-data.mjs --today 2026-10-25   (for tests) the date used for the freshness check
import { loadSite, avodataInstitutions } from './lib/site-data.mjs';
import { calibrate, RULES } from './calibrate-pay.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const TODAY = new Date((val('--today', '') || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');

const { html, DATA } = loadSite();
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

// ---- 3b. one institution listed twice in one degree: the number of institutions would count rows ----
{
  const L = [];
  for (const d of DATA.deg) {
    const seen = new Map();
    for (const o of d.of) { if (seen.has(o.i)) L.push(`${d.id} "${d.n}" @ ${INST.get(o.i).n}: ${seen.get(o.i)} / ${o.t}`); else seen.set(o.i, o.t); }
  }
  if (L.length) add('warn', 'offer.dup', 'the same institution is listed twice in one degree (two types of degree). The site joins them into one offer when it loads (normalizeDegrees in index.html), so it counts institutions, not rows', L);
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

// ---- 9. pay and employment ----
// The Avodata figures are shown as they are published, except where they cannot describe what people earn: tools/calibrate-pay.mjs lists the rules and writes the
// original value next to every figure it changes. This part finds what the rules would still change (the calibration was not run, or the data was collected again),
// the figures that disagree with each other, and the figures that look odd but are left as they are.
{
  const all = (f) => f.stats?.['הכל'] || Object.values(f.stats || {})[0] || null;
  const c56 = (f) => (f.curve || []).find((c) => c.y === '5-6 שנים');
  // 9a. what the rules would change now
  const clone = JSON.parse(JSON.stringify(DATA)), log = calibrate(clone);
  const diff = [];
  for (const sec of ['oc', 'af']) for (const id of Object.keys(DATA[sec])) if (JSON.stringify(DATA[sec][id]) !== JSON.stringify(clone[sec][id])) diff.push(`${sec}/${id} ${DATA[sec][id].n}`);
  DATA.mahat.forEach((m, i) => { if (JSON.stringify(m) !== JSON.stringify(clone.mahat[i])) diff.push(`mahat#${i} ${m.n}`); });
  if (diff.length) add('error', 'pay.not.calibrated', 'the pay figures are not as the rules of tools/calibrate-pay.mjs give (run it, and read what it changed)', diff);
  add('info', 'pay.calibrated', `${Object.values(DATA.oc).filter((o) => o.cal).length} occupations and ${Object.values(DATA.af).filter((f) => f.cal).length} fields carry a calibration note (the original value is in it); ${Object.values(DATA.af).filter((f) => f.few).length} fields are marked as the pay of a few graduates`);
  // 9b. a figure and its own series
  const L1 = [], L2 = [], L3 = [], L4 = [], L5 = [];
  for (const [id, f] of Object.entries(DATA.af)) {
    const s = all(f), c = c56(f);
    if (s && s.sal != null && c && c.v !== s.sal) L1.push(`${id} ${f.n}: stats ${s.sal} vs curve 5-6 ${c.v}`);
    for (const o of f.occ || []) { const oc = DATA.oc[o.id]; if (oc && oc.sal != null && o.sal != null && oc.sal !== o.sal) L2.push(`${id} ${f.n} / ${o.id}: copy ${o.sal} vs occupation ${oc.sal}`); }
    if (s && s.sal != null && (s.sal < 5000 || s.sal > 60000)) L5.push(`${id} ${f.n}: ${s.sal}`);
  }
  for (const [id, o] of Object.entries(DATA.oc)) {
    const sr = o.g?.salary, last = sr && sr[sr.length - 1];
    if (o.sal != null && last && last.v !== o.sal) L3.push(`${id} ${o.n}: sal ${o.sal} vs series ${last.v}`);
    const at = (o.snap || []).indexOf('₪'); if (at > 0 && Number(String(o.snap[at - 1]).replace(/,/g, '')) !== o.sal) L3.push(`${id} ${o.n}: tile ${o.snap[at - 1]} vs sal ${o.sal}`);
    for (const e of o.edu || []) { if (e.kind !== 'Academic') continue; const f = DATA.af[e.id], c = f && c56(f); if (c && e.sal != null && e.sal !== c.v) L4.push(`${id} ${o.n} / ${e.n}: ${e.sal} vs curve 5-6 ${c.v}`); }
    if (o.sal != null && (o.sal < 1500 || o.sal > 80000)) L5.push(`occupation ${id} ${o.n}: ${o.sal}`);
  }
  if (L1.length) add('error', 'pay.field.curve', 'a field says two things about the 5-6 year pay: the figure and the point of its curve', L1);
  if (L2.length) add('error', 'pay.field.occ', 'the pay of an occupation inside a field differs from the occupation itself', L2);
  if (L3.length) add('error', 'pay.occ.series', 'the pay of an occupation differs from its series or its tile', L3);
  if (L4.length) add('error', 'pay.edu.copy', 'the pay of a field inside an occupation differs from the field', L4);
  if (L5.length) add('warn', 'pay.range', 'a pay figure outside what a month of work can be (a field 5,000-60,000, an occupation 1,500-80,000)', L5);
  // 9c. a year that jumps, left as it is because it is below the rule's line, but worth a look
  const J = [];
  for (const [id, o] of Object.entries(DATA.oc)) { const sr = o.g?.salary; if (!o.cal && sr && sr.length > 1) { const a = sr[sr.length - 2].v, b = sr[sr.length - 1].v; if (a > 0 && b / a - 1 > 0.15) J.push(`${id} ${o.n}: ${a} -> ${b} (+${Math.round((b / a - 1) * 100)}%)`); } }
  if (J.length) add('info', 'pay.jump.watch', `${J.length} occupations rose by more than 15% in the last year (below the line of ${RULES.jumpOver * 100}% that the calibration uses, so shown as published)`, J);
  // 9d. employment
  const E = Object.entries(DATA.af).map(([id, f]) => [id, f, all(f)]).filter(([, , s]) => s && s.emp != null && s.emp < 70).sort((a, b) => a[2].emp - b[2].emp).map(([id, f, s]) => `${id} ${f.n}: ${s.emp}%`);
  if (E.length) add('info', 'pay.emp.low', 'fields with an employment rate below 70%: shown as published (the figure is of the graduates who are counted as employed; who is not counted is not stated)', E);
  // 9d2. the pay of one institution only
  const ONE = Object.values(DATA.af).filter((f) => f.one).map((f) => `${f.n}: ${f.one}`);
  add('info', 'pay.one.institution', `${ONE.length} fields have pay figures of one institution only (marked, and the page of a degree that other institutions teach says so)`, ONE);
  // 9e. a field that no degree points at carries data nobody sees
  const used = new Set(DATA.deg.map((d) => d.av).filter(Boolean));
  const U = Object.entries(DATA.af).filter(([id, f]) => !used.has(id) && all(f) && all(f).sal != null).map(([id, f]) => `${id} ${f.n}: ${all(f).sal}`);
  if (U.length) add('info', 'pay.field.unused', 'fields with pay figures that no degree points at', U);
  // 9f. a technician pay range written the wrong way round
  const R = [];
  DATA.mahat.forEach((m) => ((m.page && m.page.w) || []).forEach((l) => { for (const x of l.matchAll(/(\d{1,3},\d{3})-(\d{1,3},\d{3})/g)) if (Number(x[1].replace(',', '')) > Number(x[2].replace(',', ''))) R.push(`${m.n}: ${l}`); }));
  if (R.length) add('warn', 'pay.mahat.range', 'a technician pay range with the higher number first', R);
}

// ---- 10. what the pages can answer ----
// A degree page answers "how much do they earn?", "is there work?" and "where do they work?" from its Avodata field (and the occupations of the field), a technician track from the pay lines
// of its own page and from the entry of Avodata of its discipline. This lists what the pages cannot answer, so that a gap is found here and not by a reader. The rules are those of the pages
// (fieldOf, mainStat, the regional map reads the area breakdown of the occupations).
{
  const all = (f) => f.stats?.['הכל'] || Object.values(f.stats || {})[0] || null;
  const area = (o) => !!o?.g?.Area?.s?.some((x) => x.v > 0);
  const AVN = avodataInstitutions(html);
  const norm = (s) => s.replace(/[–\-,"'״׳()]/g, ' ').replace(/\s+/g, ' ').trim();
  const fieldOf = (d) => DATA.af[d.av];
  const payOf = (f) => !!(all(f)?.sal || (f.curve || []).some((c) => c.v));
  const areaOf = (d) => (d.pro === 'md' ? ['2211', '2212', '2213'] : d.pro === 'dmd' ? ['2261'] : (fieldOf(d)?.occ || []).map((x) => x.id)).some((id) => area(DATA.oc[id]));
  const withField = DATA.deg.filter((d) => fieldOf(d)), noField = DATA.deg.filter((d) => !fieldOf(d) && !d.pro);
  // 10a. a degree that has the name of a field and no connection to it: the table of tools/map-avodata.mjs misses it
  const byName = new Map(Object.entries(DATA.af).map(([id, f]) => [norm(f.n), id]));
  const missed = noField.filter((d) => byName.has(norm(d.n))).map((d) => `${d.id} ${d.n} -> ${byName.get(norm(d.n))}`);
  if (missed.length) add('error', 'answers.deg.missed', 'a degree has the name of an Avodata field and points at nothing (add it to tools/map-avodata.mjs)', missed);
  // 10b. a degree that points at a field that does not exist
  const dangling = DATA.deg.filter((d) => d.av && !DATA.af[d.av]).map((d) => `${d.id} ${d.n}: ${d.av}`);
  if (dangling.length) add('error', 'answers.deg.dangling', 'a degree points at a field that is not in the data', dangling);
  // 10c. what is left
  add('info', 'answers.deg.nofield', `${noField.length} of ${DATA.deg.length} degrees have no field in Avodata: their pages say so and show no figure`, noField.map((d) => `${d.id} ${d.n}`));
  add('info', 'answers.deg.nopay', 'degrees whose field has no pay figure and no point of a curve', withField.filter((d) => !payOf(fieldOf(d))).map((d) => `${d.id} ${d.n}: ${d.av} ${fieldOf(d).n}`));
  add('info', 'answers.deg.noarea', 'degrees with pay whose field has no occupation with an area breakdown (no map of where the graduates work)', withField.filter((d) => payOf(fieldOf(d)) && !areaOf(d)).map((d) => `${d.id} ${d.n}`));
  // 10d. the pay of one institution on the page of a degree of other institutions: the page says so (calFldNote)
  const off = withField.filter((d) => fieldOf(d).one && !(d.of.length && d.of.every((o) => o.i === AVN[fieldOf(d).one]))).map((d) => `${d.id} ${d.n}: ${fieldOf(d).n} is of ${fieldOf(d).one}`);
  add('info', 'answers.deg.oneinst', `${off.length} degrees take the pay of a field that is of one institution which does not teach all of them (the page says whose it is)`, off);
  // 10e. occupations and technician tracks
  add('info', 'answers.occ.nopay', 'occupations with no pay figure (Avodata published none, and none is estimated)', Object.entries(DATA.oc).filter(([, o]) => o.sal == null).map(([id, o]) => `${id} ${o.n}`));
  const hasPay = (m) => ((m.page && m.page.w) || []).some((l) => /\d{1,3},\d{3}/.test(l));
  add('info', 'answers.mahat.nopay', 'technician tracks with no pay line on their page (the page takes the pay of the entry of Avodata where there is one)', DATA.mahat.filter((m) => !hasPay(m)).map((m) => m.n));
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
