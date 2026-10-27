#!/usr/bin/env node
// Calibrates the pay figures of the Avodata snapshot that is embedded in index.html (the `DATA` line), by rules that are written down here,
// and keeps the original of every figure it changes, so that nothing is lost and the rules can be run again with other numbers.
//
// Why: the snapshot is faithful to Avodata, but some figures cannot be right as a description of what a graduate or a worker earns:
//   - an occupation whose 2023 average jumps by more than a quarter in one year (the median change of all occupations is 7%, and the Central Bureau
//     of Statistics reports 6.8% for the high-tech sector in 2024) is a change of sample or of definition, not of pay;
//   - a field whose 5-6 year average is one fifth above the computer-science field, and whose first two years already pay more than the whole
//     high-tech sector earns on average, is the pay of a small group of top earners (bonuses, shares), not of the field;
//   - a field whose pay is the pay of one institution is marked (`one`), and a curve of a few points is marked (`few`): the page says so;
//   - a field whose "5-6 years" figure differs from the 5-6 point of its own curve says two things about the same year.
// It does not invent anything: every new number is computed from other numbers of the same file or from a published average that the rule names.
//
//   node tools/calibrate-pay.mjs             apply the rules to index.html (writes)
//   node tools/calibrate-pay.mjs --check     exit 1 if index.html is not exactly what the rules give (writes nothing)
//   node tools/calibrate-pay.mjs --report    print what the rules change (writes nothing); --json for the same as JSON
//   node tools/calibrate-pay.mjs --restore   put back every original value and remove the notes (the audit then says that the rules would change them again:
//                                            to keep the originals, set the line of a rule to Infinity in RULES below)
//
// The note on every changed entity is `cal`: { r: [rules], was: {original values}, ... }. `restore()` undoes all of them.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SITE } from './lib/site-data.mjs';
import { splitSite, joinSite, spliceChanged } from './lib/data-splice.mjs';

/** The rules. Every number has a reason in a comment. */
export const RULES = {
  // an occupation: a last-year average that is higher than the year before by more than this is treated as a change of sample, not of pay
  jumpOver: 0.25,
  // a field: the field that the others are measured against (computer science: the biggest tech field, and its figure is confirmed by other sources)
  benchField: '930',
  // a field is an outlier when its 5-6 year average is above the benchmark by more than this ...
  ceilingOver: 1.10,
  // ... and its first two years already pay more than this: the average pay in high-tech in 2023 (29,826 NIS a month; CBS, as reported in the press:
  // two separate reports give 29.8k for the year and 29.3k for July 2023). See tools/verification/2026-10-26-pay.md
  entryMax: 29826,
  // a curve with fewer points than this is the pay of a few graduates
  fewPoints: 4,
  // the thresholds Avodata's own labels follow ("below / like / above the average"), read from the labels of the file
  labelLow: 14200,
  labelHigh: 17400,
};

const GROUPS = ['Gender', 'OccupationManner', 'Education', 'Sector', 'Hitech', 'Area', 'Age']; // {s:[{x,v,p}]}: the pay of a group of the workers
const SIM = 'שכר דומה לממוצע במשק', HI = 'השכר בתחום גבוה מהממוצע', LO = 'השכר בתחום נמוך מהממוצע';
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const fmtNum = (n) => Math.round(n).toLocaleString('en-US');
const all = (f) => f.stats?.['הכל'] || Object.values(f.stats || {})[0] || null;
const last2 = (o) => { const s = o.g?.salary; if (!s || s.length < 2) return null; const a = s[s.length - 2], b = s[s.length - 1]; return a.v > 0 && b.v > 0 ? { a, b } : null; };

/** Puts back every original value that a previous run wrote down (and removes the notes). */
export function restore(DATA) {
  for (const o of Object.values(DATA.oc)) {
    if (!o.cal) continue;
    const w = o.cal.was;
    o.sal = w.sal;
    const s = o.g.salary; s[s.length - 1].v = w.sal; s[s.length - 1].p = w.sal;
    for (const gk of GROUPS) if (w.g[gk]) o.g[gk].s.forEach((x, i) => { x.v = w.g[gk][i]; });
    if (w.g.Anaf) o.g.Anaf.forEach((x, i) => { x.v = w.g.Anaf[i]; });
    const at = (o.snap || []).indexOf('₪'); if (at > 0) o.snap[at - 1] = w.tile;
    if (w.lbl) { o.snap[0] = w.lbl[0]; if (o.tn) o.tn.salary = w.lbl[1]; }
    for (const f of Object.values(DATA.af)) for (const x of f.occ || []) if (x.id === o.cal.id) x.sal = w.sal;
    delete o.cal;
  }
  for (const f of Object.values(DATA.af)) {
    if (!f.cal) { delete f.few; delete f.one; continue; }
    const w = f.cal.was;
    for (const [k, v] of Object.entries(w.sal)) if (f.stats[k]) f.stats[k].sal = v;
    (f.curve || []).forEach((c, i) => { c.v = w.curve[i]; });
    for (const [n, v] of Object.entries(w.inst || {})) if (f.byInst[n]) f.byInst[n].salary = v;
    const i56 = (f.curve || []).findIndex((c) => c.y === '5-6 שנים');
    if (i56 >= 0) for (const e of Object.values(DATA.oc)) for (const x of e.edu || []) if (x.kind === 'Academic' && x.id === f.cal.id && x.sal != null) x.sal = w.curve[i56];
    delete f.cal; delete f.few; delete f.one;
  }
  return DATA;
}

/** Applies the rules to the original numbers. Returns what it did. */
export function calibrate(DATA, rules = RULES) {
  restore(DATA);
  const log = { growth: null, fill: [], occ: [], fld: [], few: [], one: [], mahat: 0 };

  // ---- occupations: the figure that was left out ----
  // 26 occupations were written without `sal` although their tile and the last point of their series say the same number (all of them are labelled "like the average"):
  // the page of the occupation said "no data". The number is there, so it is taken from there.
  for (const [id, o] of Object.entries(DATA.oc)) {
    if (o.sal != null) continue;
    const sr = o.g?.salary, last = sr && sr[sr.length - 1], at = (o.snap || []).indexOf('₪');
    if (last && last.v > 0 && at > 0 && Number(String(o.snap[at - 1]).replace(/,/g, '')) === last.v) { o.sal = last.v; log.fill.push({ id, n: o.n, sal: last.v }); }
  }

  // ---- occupations: a jump of the last year ----
  const ch = [];
  for (const o of Object.values(DATA.oc)) { const x = last2(o); if (x) ch.push(x.b.v / x.a.v - 1); }
  const g = Math.round(median(ch) * 1000) / 1000;
  log.growth = g;
  for (const [id, o] of Object.entries(DATA.oc)) {
    const x = last2(o);
    if (!x || x.b.v / x.a.v - 1 <= rules.jumpOver) continue;
    const was = x.b.v, now = Math.round(x.a.v * (1 + g)), k = now / was;
    const wasG = {};
    for (const gk of GROUPS) if (o.g[gk]) { wasG[gk] = o.g[gk].s.map((e) => e.v); o.g[gk].s.forEach((e) => { if (e.v > 0) e.v = Math.round(e.v * k); }); }
    if (o.g.Anaf) { wasG.Anaf = o.g.Anaf.map((e) => e.v); o.g.Anaf.forEach((e) => { if (e.v > 0) e.v = Math.round(e.v * k); }); }
    const at = (o.snap || []).indexOf('₪'), tile = at > 0 ? o.snap[at - 1] : null;
    const cal = { id, r: ['jump'], was: { sal: was, tile, g: wasG }, prev: x.a.v, g, k: Math.round(k * 1000) / 1000 };
    o.sal = now; x.b.v = now; x.b.p = now;
    if (at > 0) o.snap[at - 1] = fmtNum(now);
    // Avodata's own label follows the thresholds of the file: it follows the new number
    const lbl = now >= rules.labelHigh ? HI : now < rules.labelLow ? LO : SIM;
    if (o.snap && o.snap[0] !== lbl) { cal.was.lbl = [o.snap[0], o.tn ? o.tn.salary : null]; o.snap[0] = lbl; if (o.tn) o.tn.salary = lbl === SIM ? o.tn.salary : lbl; }
    o.cal = cal;
    for (const f of Object.values(DATA.af)) for (const e of f.occ || []) if (e.id === id) e.sal = now;
    log.occ.push({ id, n: o.n, was, now, prev: x.a.v });
  }

  // ---- fields ----
  const bench = DATA.af[rules.benchField];
  const benchCurve = (bench?.curve || []).reduce((m, c) => (m[c.y] = c.v, m), {});
  for (const [id, f] of Object.entries(DATA.af)) {
    const s = all(f); if (!s || s.sal == null) continue;
    const was = { sal: Object.fromEntries(Object.entries(f.stats).map(([k, v]) => [k, v.sal])), curve: (f.curve || []).map((c) => c.v), inst: Object.fromEntries(Object.entries(f.byInst || {}).filter(([, v]) => v.salary).map(([n, v]) => [n, v.salary])) };
    const rs = [];
    const c56 = (f.curve || []).find((c) => c.y === '5-6 שנים');
    if (c56 && c56.v !== s.sal) { s.sal = c56.v; rs.push('curve'); }          // one year, one figure
    let k = 1;
    if (id !== rules.benchField && c56 && benchCurve['5-6 שנים']) {
      const c12 = (f.curve || []).find((c) => c.y === '1-2 שנים');
      if (c56.v > rules.ceilingOver * benchCurve['5-6 שנים'] && c12 && c12.v > rules.entryMax) k = benchCurve['5-6 שנים'] / c56.v;
    }
    if (k < 1) {
      const sc = (v) => Math.round((v * k) / 100) * 100;
      for (const st of Object.values(f.stats)) if (st.sal != null) st.sal = sc(st.sal);
      (f.curve || []).forEach((c) => { c.v = sc(c.v); });
      for (const v of Object.values(f.byInst || {})) if (v.salary) v.salary = sc(v.salary);
      rs.push('ceiling');
    }
    if (rs.length) {
      f.cal = { id, r: rs, was };
      if (k < 1) f.cal.k = Math.round(k * 1000) / 1000;
      log.fld.push({ id, n: f.n, r: rs, was: was.sal['הכל'] ?? Object.values(was.sal)[0], now: all(f).sal, k: f.cal.k });
    }
    // a curve of fewer points is the pay of a few graduates
    if ((f.curve || []).length < rules.fewPoints && (f.curve || []).length && !['700', '710'].includes(id)) { f.few = 1; log.few.push({ id, n: f.n, points: f.curve.length }); }
    // the pay of one institution: the page of a degree that other institutions teach too says so
    const withPay = Object.entries(f.byInst || {}).filter(([, v]) => v.salary > 0);
    if (withPay.length === 1) { f.one = withPay[0][0]; log.one.push({ id, n: f.n, inst: f.one }); }
  }
  // the lists of education of the occupations keep the number of the field (the 5-6 point of the curve)
  for (const e of Object.values(DATA.oc)) for (const x of e.edu || []) {
    if (x.kind !== 'Academic') continue; const f = DATA.af[x.id]; const c = f && (f.curve || []).find((c) => c.y === '5-6 שנים');
    if (c && x.sal != null && x.sal !== c.v && f.cal) x.sal = c.v;
  }

  // ---- technician pages: a range of pay is written with the lower number first (the page text came out reversed, like "4-3 years") ----
  for (const m of DATA.mahat || []) {
    const w = m.page && m.page.w; if (!Array.isArray(w)) continue;
    w.forEach((line, i) => {
      const n = line.replace(/(\d{1,3},\d{3})-(\d{1,3},\d{3})/g, (all2, a, b) => (Number(a.replace(',', '')) > Number(b.replace(',', '')) ? `${b}–${a}` : all2));
      if (n !== line) { w[i] = n; log.mahat++; }
    });
  }
  return log;
}

/** The text of the DATA body with every original put back */
export function restoreText(body) {
  const before = JSON.parse(body), after = JSON.parse(body);
  restore(after);
  const r = spliceChanged(body, before, after, ['oc', 'af']);
  return { body: r.body, changed: r.changed };
}

/** The text of the DATA body after the rules, and what they did */
export function calibrateText(body, rules = RULES) {
  const before = JSON.parse(body), after = JSON.parse(body);
  const log = calibrate(after, rules);
  const r = spliceChanged(body, before, after, ['oc', 'af', 'mahat']);
  return { body: r.body, log, changed: r.changed };
}

function main() {
  const args = process.argv.slice(2), flag = (n) => args.includes(n);
  const text = readFileSync(SITE, 'utf8');
  const s = splitSite(text);
  if (flag('--restore')) {
    const u = restoreText(s.body);
    writeFileSync(SITE, joinSite(s, u.body));
    console.log(`index.html: the original values are back in ${u.changed.length} entities`);
    return;
  }
  const r = calibrateText(s.body);
  if (flag('--json')) { console.log(JSON.stringify(r.log, null, 1)); return; }
  const same = r.body === s.body;
  if (flag('--report')) {
    console.log(`growth of the median occupation in the last year: ${(r.log.growth * 100).toFixed(1)}%`);
    console.log(`\noccupations that lacked their figure although the tile and the series say it (${r.log.fill.length}):`, r.log.fill.map((x) => x.n + ' ' + x.sal).join(' | '));
    console.log(`\noccupations whose last year jumped by more than ${RULES.jumpOver * 100}% (${r.log.occ.length}):`);
    for (const x of r.log.occ) console.log(`  ${x.id} ${x.n.slice(0, 40).padEnd(42)} ${String(x.prev).padStart(6)} -> was ${String(x.was).padStart(6)} -> now ${String(x.now).padStart(6)}`);
    console.log(`\nfields (${r.log.fld.length}):`);
    for (const x of r.log.fld) console.log(`  ${x.id} ${x.n.slice(0, 40).padEnd(42)} [${x.r.join('+')}] was ${x.was} now ${x.now}${x.k ? ' (x' + x.k + ')' : ''}`);
    console.log(`\nfields whose pay is of a single institution (${r.log.one.length}):`, r.log.one.map((x) => x.n + ' (' + x.inst + ')').join(' | '));
    console.log(`\nfields with the pay of a few graduates (${r.log.few.length}):`, r.log.few.map((x) => x.n + ' (' + x.points + ')').join(', '));
    console.log(`\ntechnician pay lines with the range turned around: ${r.log.mahat}`);
    console.log(same ? '\nindex.html already holds exactly this.' : `\nindex.html would change in ${r.changed.length} places.`);
    return;
  }
  if (flag('--check')) {
    if (same) { console.log('index.html is calibrated: ' + r.log.occ.length + ' occupations, ' + r.log.fld.length + ' fields, ' + r.log.mahat + ' technician lines'); return; }
    console.error('index.html is not as the calibration rules give: run `node tools/calibrate-pay.mjs`'); process.exit(1);
  }
  if (same) { console.log('nothing to change: index.html is already calibrated'); return; }
  writeFileSync(SITE, joinSite(s, r.body));
  console.log(`index.html: ${r.log.fill.length} occupations given the figure they lacked, ${r.log.occ.length} occupations, ${r.log.fld.length} fields, ${r.log.few.length} marked as few graduates, ${r.log.one.length} as one institution, ${r.log.mahat} technician lines (${r.changed.length} entities rewritten)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
