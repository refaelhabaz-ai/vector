#!/usr/bin/env node
// Compares the Avodata pages that tools/avodata-collect.console.js saved with the data embedded in index.html.
//
// The collector runs in a person's browser (the cloud machine that maintains the site cannot reach Avodata). This tool needs no network: it reads the file the collector saved.
// What it checks, for every page that the data points at:
//   - the page was read (not blocked, not empty, not a "page not found", not redirected to another page)
//   - the claims of the data about the page are on the page: the name, the description, the pay and the employment, the curve of pay by years, the institutions and their figures,
//     the industries, the occupations (their names, their pay, the links to them), the facts of an occupation (its snapshot, its series by year, its groups), the technician tracks.
//     A claim is a phrase or a number. It is "confirmed" when the page holds it anywhere (text, table, label of a chart, data of a chart, an answer of the site's servers).
//     The values compared are the original ones: the pay calibration of tools/calibrate-pay.mjs is undone first, so that what is compared is what Avodata said, not what the site shows.
//   - the degrees that point at a field (`av`) are listed by the field's page: the institution of the degree is one of the institutions that the page lists
//   - the pages that Avodata links to and the data does not know (new fields, new occupations)
// A number that is not on the page but has a close neighbour on it is listed with that neighbour: it is the likely place of a change.
//
//   node tools/verify-avodata.mjs data/avodata/avodata-dump-2026-10-28-10-00.zip        human readable report
//   node tools/verify-avodata.mjs <zip | folder> --json | --report out.md | --all | --only Academic/1322,isco_group/2512
//   node tools/verify-avodata.mjs --stamp          rewrite the list of pages inside tools/avodata-collect.console.js from index.html
//   node tools/verify-avodata.mjs --check-stamp    exit 1 if that list is not what index.html needs
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadSite, avodataInstitutions } from './lib/site-data.mjs';
import { readDump, corpus, norm, numbersIn } from './lib/avodata-dump.mjs';
import { targets, stamp, stamped, pagePath } from './lib/avodata-targets.mjs';
import { restore } from './calibrate-pay.mjs';
import { MAP } from './map-avodata.mjs';

const COLLECTOR = fileURLToPath(new URL('./avodata-collect.console.js', import.meta.url));
const KIND_OF = { Academic: 'field', isco_group: 'occupation', MahatEducation: 'track' };

// ---------- the claims of the data about a page ----------
// { label, type: 'text' | 'num' | 'link' | 'seq', value, strong }  strong: a phrase of some length, a number that is not a small count
const text = (label, value, strong = true) => value && String(value).trim() ? [{ label, type: 'text', value: String(value), strong }] : [];
const num = (label, value, strong) => Number.isFinite(value) && value !== 0 ? [{ label, type: 'num', value, strong: strong ?? value >= 1000 }] : [];
const head = (s, n) => norm(String(s).replace(/\$/g, ' ')).slice(0, n);
const GROUPS = ['Gender', 'OccupationManner', 'Education', 'Sector', 'Hitech', 'Area', 'Age'];

export function fieldClaims(f) {
  const c = [...text('name', f.n), ...text('level', f.level, false), ...text('description', head(f.desc || '', 70))];
  for (const [pop, s] of Object.entries(f.stats || {})) {
    c.push(...num(`stats.${pop}.sal`, s.sal), ...num(`stats.${pop}.psy`, s.psy, s.psy >= 200), ...num(`stats.${pop}.emp`, s.emp, false), ...num(`stats.${pop}.bagrut`, s.bagrut, false), ...num(`stats.${pop}.ontime`, s.ontime, false));
    c.push(...text(`stats.${pop}.salLbl`, s.salLbl), ...text(`stats.${pop}.empLbl`, s.empLbl));
  }
  for (const p of f.curve || []) c.push(...num(`curve.${p.y}`, p.v), ...text(`curve.label`, p.y, false));
  for (const [n, i] of Object.entries(f.byInst || {})) {
    c.push(...text(`inst ${n}`, n));
    c.push(...num(`inst ${n}.salary`, i.salary), ...num(`inst ${n}.psychometry`, i.psychometry, i.psychometry >= 200), ...num(`inst ${n}.employment`, i.employment, false), ...num(`inst ${n}.bagrut`, i.bagrut, false));
  }
  for (const a of f.anaf || []) c.push(...text('industry', a.n), ...num(`industry ${a.n}`, a.p, false));
  for (const o of f.occ || []) c.push(...text('occupation', o.n), ...num(`occupation ${o.id}.sal`, o.sal), { label: `link isco_group/${o.id}`, type: 'link', kind: 'isco_group', value: String(o.id), strong: true });
  return c;
}

export function occupationClaims(o) {
  const c = [...text('name', o.n), ...text('description', head(o.d || '', 70))];
  (o.titles || []).slice(0, 5).forEach((t) => c.push(...text('title', t)));
  (o.tasks || []).slice(0, 5).forEach((t) => c.push(...text('task', head(t, 50))));
  if ((o.snap || []).length) c.push({ label: 'snapshot', type: 'seq', value: o.snap, strong: true });
  c.push(...num('sal', o.sal));
  for (const k of ['employed', 'salary']) for (const p of o.g?.[k] || []) c.push(...num(`g.${k}.${p.x}`, p.v), ...text('g.year', p.x, false));
  for (const gk of GROUPS) {
    const g = o.g?.[gk]; if (!g) continue;
    for (const s of g.s || []) c.push(...text(`g.${gk}`, s.x, false), ...num(`g.${gk}.${s.x}`, s.v));
    for (const [k, v] of Object.entries(g.notes || {})) c.push(...text(`g.${gk}.note.${k}`, head(v, 60)));
  }
  for (const a of o.g?.Anaf || []) c.push(...text('g.Anaf', a.x), ...num(`g.Anaf.${a.x}`, a.v));
  for (const v of Object.values(o.tn || {})) c.push(...text('trend', v));
  for (const e of o.edu || []) c.push(...text(`edu ${e.kind}/${e.id}`, e.n), ...num(`edu ${e.kind}/${e.id}.sal`, e.sal), { label: `link ${e.kind}/${e.id}`, type: 'link', kind: e.kind, value: String(e.id), strong: true });
  return c;
}

export function trackClaims(a) {
  const c = [...text('name', a.n)];
  if ((a.adm || []).length) c.push({ label: 'admission and snapshot', type: 'seq', value: a.adm, strong: true });
  for (const p of a.curve || []) c.push(...num(`curve.${p.y}`, p.v), ...text('curve.label', p.y, false));
  return c;
}

/** Is the claim on the page? { ok, near } (near: the number of the page that is closest to a number that is not there) */
export function evaluate(claim, corp) {
  if (claim.type === 'text') return { ok: corp.has(claim.value) };
  if (claim.type === 'num') { const ok = corp.hasNum(claim.value); return ok ? { ok } : { ok, near: corp.nearest(claim.value, 0.2) }; }
  if (claim.type === 'link') return { ok: corp.links[claim.kind]?.has(claim.value) || false };
  if (claim.type === 'seq') {                                                  // the tokens of a snapshot, in order, as lines of the page
    const toks = claim.value.map(norm).filter(Boolean); let at = 0, hit = 0;
    for (const t of toks) { const k = corp.lines.findIndex((l, i) => i >= at && (l === t || l.includes(t))); if (k >= 0) { hit++; at = k + 1; } }
    return { ok: toks.length > 0 && hit / toks.length >= 0.8, ratio: toks.length ? hit / toks.length : 1 };
  }
  throw new Error('unknown claim type ' + claim.type);
}

// ---------- one page ----------
const BAD = { blocked: 'the site answered "blocked"', empty: 'the page came back empty', error: 'the page could not be read', unreadable: 'the page could not be read', undefined: 'the page was not read' };
const NOTFOUND = /(הדף|העמוד)[^\n]{0,30}לא נמצא|page not found|error 404|\b404\b\s*[-–:]?\s*(not found|לא נמצא)/i;

export function verifyPage(kind, id, entity, rec) {
  const out = { key: `${kind}/${id}`, kind, id, name: entity.n, verdict: null, strong: 0, strongOk: 0, weak: 0, weakOk: 0, phrases: 0, phrasesOk: 0, missing: [], changed: [], note: null };
  if (!rec || !['ok', 'late'].includes(rec.status)) { out.verdict = 'unread'; out.note = BAD[rec ? rec.status : undefined] || 'the page was not read'; return out; }
  if (rec.final && rec.final.replace(/[?#].*$/, '').replace(/\/$/, '') !== pagePath(kind, id)) { out.verdict = 'redirected'; out.note = `the page led to ${rec.final}`; return out; }
  const corp = corpus(rec);
  if ((NOTFOUND.test(rec.title || '') || (NOTFOUND.test(rec.text || '') && (rec.text || '').length < 400)) && !corp.has(entity.n)) { out.verdict = 'notfound'; out.note = 'Avodata has no such page'; return out; }
  const claims = kind === 'Academic' ? fieldClaims(entity) : kind === 'isco_group' ? occupationClaims(entity) : trackClaims(entity);
  for (const c of claims) {
    const r = evaluate(c, corp), bucket = c.strong ? 'strong' : 'weak';
    out[bucket]++; if (r.ok) out[bucket + 'Ok']++;
    if (c.strong && c.type !== 'num') { out.phrases++; if (r.ok) out.phrasesOk++; }
    if (!r.ok && c.strong) {
      out.missing.push(c.label);
      if (c.type === 'num' && r.near != null) out.changed.push({ label: c.label, data: c.value, page: r.near });
    }
  }
  out.sameText = out.phrases ? out.phrasesOk / out.phrases : 1;                  // the page says what the data says it says: it is the right page
  const share = out.strong ? out.strongOk / out.strong : 1;
  out.verdict = !out.strong ? 'nothing-to-check' : share >= 0.9 ? 'verified' : share >= 0.5 ? 'partial' : 'off';
  out.share = Math.round(share * 1000) / 10;
  return out;
}

// ---------- the whole run ----------
/** The data as Avodata said it: the calibration of the pay (which the site shows instead) is undone on a copy. */
export const original = (DATA) => restore(structuredClone(DATA));

export function verify(DATA, html, dump, opts = {}) {
  const orig = original(DATA), AVN = avodataInstitutions(html), want = targets(DATA);
  const only = opts.only ? new Set(opts.only) : null;
  const entity = { Academic: (id) => orig.af[id], isco_group: (id) => orig.oc[id], MahatEducation: (id) => orig.mahatAv.find((a) => String(a.id) === String(id)) };
  const pages = [];
  for (const kind of Object.keys(want)) for (const id of want[kind]) {
    if (only && !only.has(`${kind}/${id}`)) continue;
    pages.push(verifyPage(kind, id, entity[kind](id), dump.pages.get(`${kind}/${id}`)));
  }
  const findings = [], add = (level, code, msg, ids = []) => findings.push({ level, code, msg, ids });
  for (const p of dump.problems || []) add('warn', 'dump.problem', p);
  const by = (v) => pages.filter((p) => p.verdict === v);
  const tally = Object.fromEntries(['verified', 'partial', 'off', 'unread', 'redirected', 'notfound', 'nothing-to-check'].map((v) => [v, by(v).length]));
  if (by('unread').length) add('warn', 'pages.unread', 'pages that were not read (blocked, empty, or the run stopped before them)', by('unread').map((p) => `${p.key} ${p.name}: ${p.note}`));
  if (by('redirected').length) add('warn', 'pages.redirected', 'pages that led somewhere else', by('redirected').map((p) => `${p.key} ${p.name}: ${p.note}`));
  if (by('notfound').length) add('warn', 'pages.notfound', 'pages that Avodata does not have any more: the data holds a page that is gone', by('notfound').map((p) => `${p.key} ${p.name}`));
  if (by('off').length) add('warn', 'data.off', 'pages where fewer than half of the claims of the data are on the page (the data may be of another page, or the page holds its figures where the collector could not read them)', by('off').map((p) => `${p.key} ${p.name}: ${p.share}% of ${p.strong}`));
  if (by('partial').length) add('info', 'data.partial', 'pages where 50-90% of the claims are on the page', by('partial').map((p) => `${p.key} ${p.name}: ${p.share}% of ${p.strong}; missing ${p.missing.slice(0, 4).join(', ')}`));
  // a number that is missing from a page that says what the data says (its names, its industries, its institutions) is a likely change; on another page it is noise
  const changed = pages.filter((p) => ['verified', 'partial', 'off'].includes(p.verdict) && p.sameText >= 0.5).flatMap((p) => p.changed.map((c) => ({ ...c, key: p.key, name: p.name })));
  if (changed.length) add('warn', 'data.changed', 'numbers of the data that are not on the page, with the closest number that is (the likely place of a change)', changed.map((c) => `${c.key} ${c.name}: ${c.label} data ${c.data} page ${c.page}`));

  // the degrees that point at a field: is the institution of the degree listed by the field's page?
  const mapped = new Set(MAP.map((r) => r[0])), mapping = { checked: 0, listed: 0, unlisted: [], byHow: {} };
  const live = new Map();                                                       // field id -> the site ids of the institutions that its page lists
  for (const id of want.Academic) {
    const rec = dump.pages.get(`Academic/${id}`);
    if (!rec || !['ok', 'late'].includes(rec.status)) continue;
    const corp = corpus(rec);
    live.set(id, new Set(Object.entries(AVN).filter(([name]) => corp.has(name)).map(([, i]) => i)));
  }
  for (const d of DATA.deg) {
    if (!d.av || !live.has(String(d.av))) continue;
    const ins = live.get(String(d.av)), listed = d.of.some((o) => ins.has(o.i));
    mapping.checked++; mapping.byHow[d.avHow] ||= { checked: 0, listed: 0 }; mapping.byHow[d.avHow].checked++;
    if (listed) { mapping.listed++; mapping.byHow[d.avHow].listed++; } else mapping.unlisted.push({ id: d.id, name: d.n, field: d.av, fieldName: DATA.af[d.av].n, how: d.avHow, mine: mapped.has(d.id), live: [...ins] });
  }
  const mine = mapping.unlisted.filter((u) => u.mine);
  if (mine.length) add('warn', 'map.unlisted', 'degrees connected by tools/map-avodata.mjs whose institution the field page does not list (the connection rests on the subject alone)', mine.map((u) => `${u.id} ${u.name} -> ${u.field} ${u.fieldName} (${u.how})`));
  const other = mapping.unlisted.filter((u) => !u.mine && u.how !== 'teach');
  if (other.length) add('info', 'map.unlisted.other', 'degrees connected before this tool, whose institution the field page does not list', other.map((u) => `${u.id} ${u.name} -> ${u.field} ${u.fieldName} (${u.how})`));

  // what Avodata links to and the data does not know
  const known = { Academic: new Set(want.Academic), isco_group: new Set(want.isco_group), MahatEducation: new Set(want.MahatEducation) }, names = new Map(), fresh = { Academic: new Set(), isco_group: new Set(), MahatEducation: new Set() };
  for (const rec of dump.pages.values()) {
    const base = rec.url ? new URL(rec.url).origin : '';
    for (const [href, label] of rec.links || []) {
      const m = String(href).replace(base, '').match(/^\/(Academic|isco_group|MahatEducation)\/(\d+)/);
      if (m && !known[m[1]].has(m[2])) { fresh[m[1]].add(m[2]); if (label && !names.has(`${m[1]}/${m[2]}`)) names.set(`${m[1]}/${m[2]}`, label); }
    }
  }
  for (const [k, set] of Object.entries(fresh)) if (set.size) add('info', 'new.' + k, `${KIND_OF[k]} pages that Avodata links to and the data does not have`, [...set].sort((a, b) => a - b).map((i) => `${k}/${i} ${names.get(`${k}/${i}`) || ''}`.trim()));

  // the claim that the calibration rests on: the figures the site corrected were Avodata's own
  const cal = [];
  for (const [id, f] of Object.entries(DATA.af)) if (f.cal) cal.push(`Academic/${id}`);
  for (const [id, o] of Object.entries(DATA.oc)) if (o.cal) cal.push(`isco_group/${id}`);
  const calPages = pages.filter((p) => cal.includes(p.key));
  const calSummary = { entities: cal.length, read: calPages.filter((p) => ['verified', 'partial', 'off'].includes(p.verdict)).length, verified: calPages.filter((p) => p.verdict === 'verified').length };

  const summary = { pages: pages.length, ...tally, claims: pages.reduce((n, p) => n + p.strong, 0), claimsOk: pages.reduce((n, p) => n + p.strongOk, 0), mapping: { checked: mapping.checked, listed: mapping.listed, byHow: mapping.byHow }, calibrated: calSummary, collected: dump.meta ? { started: dump.meta.started, finished: dump.meta.finished, planned: dump.meta.planned, stopped: dump.meta.stopped, why: dump.meta.why, agent: dump.meta.agent } : null };
  return { summary, pages, findings, mapping };
}

// ---------- output ----------
const LEVEL = { error: 'ERROR', warn: 'WARN ', info: 'info ' };
function print(result, all) {
  const s = result.summary;
  console.log(`pages: ${s.pages}  verified ${s.verified}  partial ${s.partial}  off ${s.off}  unread ${s.unread}  redirected ${s.redirected}  notfound ${s.notfound}`);
  console.log(`claims on the page: ${s.claimsOk} of ${s.claims} (${s.claims ? Math.round((1000 * s.claimsOk) / s.claims) / 10 : 0}%)`);
  console.log(`degrees whose field lists their institution: ${s.mapping.listed} of ${s.mapping.checked}  ` + Object.entries(s.mapping.byHow).map(([k, v]) => `${k} ${v.listed}/${v.checked}`).join('  '));
  console.log(`calibrated entities that were read: ${s.calibrated.read} of ${s.calibrated.entities}; the original figure was on the page for ${s.calibrated.verified}`);
  for (const f of result.findings) {
    console.log(`${LEVEL[f.level]} ${f.code}: ${f.msg}`);
    for (const id of all ? f.ids : f.ids.slice(0, 12)) console.log('        ' + id);
    if (!all && f.ids.length > 12) console.log(`        ... and ${f.ids.length - 12} more (--all shows everything)`);
  }
}

function markdown(result) {
  const s = result.summary, L = [];
  L.push('# Avodata verification', '', `pages ${s.pages}: verified ${s.verified}, partial ${s.partial}, off ${s.off}, unread ${s.unread}, redirected ${s.redirected}, notfound ${s.notfound}`, '', `claims on the page: ${s.claimsOk} of ${s.claims}`, '');
  for (const f of result.findings) { L.push(`## ${f.code} (${f.level})`, '', f.msg, ''); for (const id of f.ids) L.push('- ' + id); L.push(''); }
  return L.join('\n');
}

function findDump(arg) {
  if (arg) return arg;
  const dir = fileURLToPath(new URL('../data/avodata/', import.meta.url));
  if (!existsSync(dir)) return null;
  const zips = readdirSync(dir).filter((f) => /^avodata-dump-.*\.zip$/.test(f)).sort();
  if (zips.length) return join(dir, zips[zips.length - 1]);
  return existsSync(join(dir, 'pages')) ? dir : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), flag = (n) => args.includes(n), val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const { html, DATA } = loadSite();
  if (flag('--stamp')) { writeFileSync(COLLECTOR, stamp(readFileSync(COLLECTOR, 'utf8'), targets(DATA))); console.log('the list of pages in tools/avodata-collect.console.js was rewritten'); process.exit(0); }
  if (flag('--check-stamp')) {
    const have = JSON.stringify(stamped(readFileSync(COLLECTOR, 'utf8'))), need = JSON.stringify(targets(DATA));
    if (have !== need) { console.error('the list of pages in tools/avodata-collect.console.js is not what index.html needs: run node tools/verify-avodata.mjs --stamp'); process.exit(1); }
    const t = targets(DATA); console.log('the collector holds the ' + Object.values(t).reduce((n, a) => n + a.length, 0) + ' pages that index.html points at'); process.exit(0);
  }
  const skip = new Set(['--json', '--all', '--report', '--only']), path = findDump(args.find((a, i) => !a.startsWith('--') && !skip.has(args[i - 1])));
  if (!path) { console.error('no file to verify: give the zip that the collector saved (or the folder it was unpacked to), or put it in data/avodata/\nthe collector: tools/avodata-collect.console.js'); process.exit(2); }
  const dump = readDump(path), result = verify(DATA, html, dump, { only: val('--only') ? val('--only').split(',') : null });
  if (flag('--json')) console.log(JSON.stringify(result));
  else print(result, flag('--all'));
  if (val('--report')) writeFileSync(val('--report'), markdown(result));
  process.exit(0);
}
