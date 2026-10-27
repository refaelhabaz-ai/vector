// node --test tools/test/map.test.mjs
// The connections of degrees to the Avodata fields (tools/map-avodata.mjs) and what a page can answer because of them (the section "10" of tools/audit-data.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAP, mapDegrees } from '../map-avodata.mjs';
import { loadSite, avodataInstitutions } from '../lib/site-data.mjs';

const { html, DATA } = loadSite();
const AVN = avodataInstitutions(html);
const AUDIT = fileURLToPath(new URL('../audit-data.mjs', import.meta.url));
const all = (f) => f.stats?.['הכל'] || Object.values(f.stats || {})[0] || null;
const area = (o) => !!o?.g?.Area?.s?.some((x) => x.v > 0);

// a small world: three degrees and two fields
const world = () => ({
  deg: [{ id: 'a', n: 'א', of: [] }, { id: 'b', n: 'ב', of: [], av: '2', avHow: 'syn' }, { id: 'c', n: 'ג', of: [], av: '2', avHow: 'syn' }],
  af: { 1: { n: 'ראשון' }, 2: { n: 'שני' } },
});

test('a degree without a field gets it; a degree that has another field keeps it unless the row names that field in `from`', () => {
  const D = world();
  const log = mapDegrees(D, [['a', '1', 'syn', 'x'], ['b', '1', 'syn', 'x'], ['c', '1', 'syn', 'x', '2']]);
  assert.equal(D.deg[0].av, '1'); assert.equal(D.deg[0].avHow, 'syn');
  assert.equal(D.deg[1].av, '2');                                   // kept: it has a field, and the row does not say it replaces it
  assert.equal(D.deg[2].av, '1');                                   // replaced: the row names the field it replaces
  assert.equal(log.set.length, 2); assert.equal(log.kept.length, 1);
  assert.match(log.set[1], /was 2/);
});

test('a row that is already as the data says changes nothing, and a missing degree or field is reported, not written', () => {
  const D = world();
  const log = mapDegrees(D, [['b', '2', 'syn', 'x'], ['zzz', '1', 'syn', 'x'], ['a', '9', 'syn', 'x']]);
  assert.deepEqual(log.set, []); assert.deepEqual(log.kept, []); assert.equal(log.missing.length, 2);
  assert.equal(D.deg[0].av, undefined);
});

test('the table: every degree and field exists, a degree appears once, `from` is another field, and the reason is written', () => {
  const D = new Map(DATA.deg.map((d) => [d.id, d])), seen = new Set();
  for (const [id, av, how, why, from] of MAP) {
    assert.ok(D.has(id), id + ' is not a degree'); assert.ok(DATA.af[av], av + ' is not a field');
    assert.ok(!seen.has(id), id + ' appears twice'); seen.add(id);
    assert.ok(['exact', 'syn'].includes(how), id + ' has an unknown kind: ' + how);
    assert.ok(why && why.length > 12, id + ' has no reason');
    if (from !== undefined) { assert.ok(DATA.af[from], id + ': `from` is not a field'); assert.notEqual(from, av); }
    assert.ok(!D.get(id).pro, id + ' is a medical degree: it has its own pages');
  }
  assert.ok(MAP.length >= 90, 'the table holds ' + MAP.length + ' rows');
});

test('the degrees hold the fields of the table', () => {
  const D = new Map(DATA.deg.map((d) => [d.id, d]));
  for (const [id, av, how] of MAP) { assert.equal(D.get(id).av, av, id); assert.equal(D.get(id).avHow, how, id); }
});

test('a connection that says "exact" is a name that is the field\'s name within two letters (a hyphen, a spelling, an article)', () => {
  const norm = (s) => s.replace(/[–\-,"'״׳()\s]/g, '');
  const dist = (x, y) => { const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]); for (let j = 1; j <= y.length; j++) d[0][j] = j;
    for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); return d[x.length][y.length]; };
  for (const [id, av, how] of MAP) {
    if (how !== 'exact') continue;
    const d = DATA.deg.find((x) => x.id === id);
    assert.ok(dist(norm(d.n), norm(DATA.af[av].n)) <= 2, `${id} ${d.n} is not the name of ${DATA.af[av].n}`);
  }
});

test('a connection by subject names an institution of the field where the data has one to compare, and says so in its reason when it has not', () => {
  // the evidence of the table: of the rows by subject, most are degrees of an institution that Avodata lists in the field (the field lists the very institutions that offer the degree).
  const D = new Map(DATA.deg.map((d) => [d.id, d]));
  let listed = 0, rows = 0;
  for (const [id, av, how] of MAP) {
    if (how === 'exact') continue;
    rows++;
    const ins = new Set(Object.keys(DATA.af[av].byInst || {}).map((n) => AVN[n]).filter(Boolean));
    if (D.get(id).of.some((o) => ins.has(o.i))) listed++;
  }
  assert.ok(listed / rows > 0.7, `${listed} of ${rows} rows by subject are of an institution that the field lists`);
});

test('the owner\'s example: software engineering has the pay, the employment, the industries and the occupations with an area breakdown', () => {
  for (const id of ['d38', 'd8', 'd155']) {
    const d = DATA.deg.find((x) => x.id === id), f = DATA.af[d.av], s = all(f);
    assert.ok(s.sal > 20000 && s.sal < 45000, id + ' pay ' + s.sal);                       // the calibrated figure, not 45,300
    assert.ok(s.emp > 50, id + ' employment');
    assert.ok((f.anaf || []).length > 0, id + ' industries');
    assert.ok((f.occ || []).some((o) => area(DATA.oc[o.id])), id + ' occupations with an area breakdown');
    assert.ok(DATA.deg.find((x) => x.id === id).of.length > 0);
  }
});

test('the occupations that a degree without a field points at (DEG_REL in index.html) exist, and the degree has no field', () => {
  const m = html.match(/const DEG_REL=(\{[^}]*\})/);
  assert.ok(m, 'DEG_REL was not found in index.html');
  const REL = Function('return ' + m[1])(), D = new Map(DATA.deg.map((d) => [d.id, d]));
  for (const [id, L] of Object.entries(REL)) {
    assert.ok(D.has(id), id + ' is not a degree'); assert.ok(!D.get(id).av, id + ' has a field: it needs no pointer');
    assert.ok(L.length > 0 && L.length <= 3, id + ' points at ' + L.length + ' occupations');
    for (const o of L) { assert.ok(DATA.oc[o], id + ' -> ' + o + ' is not an occupation'); assert.ok(DATA.oc[o].sal, id + ' -> ' + o + ' has no pay to show'); }
  }
  assert.ok(Object.keys(REL).length >= 10);
});

test('the new programs (DEG_NEW in index.html) are degrees that take the nearest field, and the page says so', () => {
  const m = html.match(/const DEG_NEW=new Set\((\[[^\]]*\])\)/);
  assert.ok(m, 'DEG_NEW was not found in index.html');
  const NEW = Function('return ' + m[1])(), D = new Map(DATA.deg.map((d) => [d.id, d]));
  for (const id of NEW) { assert.ok(D.has(id), id + ' is not a degree'); assert.ok(D.get(id).av && D.get(id).avHow !== 'exact', id + ' does not take a nearest field'); assert.ok(/בינה מלאכותית|נבונות/.test(D.get(id).n), id + ' is not an artificial intelligence program'); }
  assert.ok(NEW.length >= 6);
  // a second major to study next to another field is not a degree in the field of its subject: it keeps no field
  assert.ok(!D.get('d298').av, 'מדעים דיגיטליים להיי טק is a second major');
});

test('a technician track has an entry of Avodata of its discipline: the pay of the entry stands in for the survey where the survey has none', () => {
  const MAV = DATA.mahatAv, by = (id) => MAV.find((a) => a.id === id);
  // the five tracks that the survey of the college authority has no pay line for, and Avodata has (the page says whose figure it is)
  for (const [name, id] of [['אדריכלות נוף', '82'], ['ביוטכנולוגיה', '61'], ['הנדסת מים', '64'], ['ביוטכנולוגיה - התמחות מזון', '61'], ['ביוטכנולוגיה-התמחות בכימיה ותרופות', '61']]) {
    const m = DATA.mahat.find((x) => x.n === name);
    assert.ok(m, name + ' is not a track'); assert.ok(!((m.page && m.page.w) || []).length, name + ' has a survey line');
    assert.ok(by(id).curve.some((c) => c.v), name + ': the entry has no pay');
  }
});

test('the audit has no error about what the pages can answer, and counts what is left', () => {
  const out = JSON.parse(execFileSync(process.execPath, [AUDIT, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const F = Object.fromEntries(out.findings.map((f) => [f.code, f]));
  assert.ok(!out.findings.some((f) => f.level === 'error'), out.findings.filter((f) => f.level === 'error').map((f) => f.code).join(', '));
  assert.ok(F['answers.deg.nofield'], 'the audit lists the degrees that have no field');
  // no connected degree is listed as one without a field
  const left = new Set(F['answers.deg.nofield'].ids.map((s) => s.split(' ')[0]));
  for (const [id] of MAP) assert.ok(!left.has(id), id + ' is in the table and listed as having no field');
  assert.ok(left.size < 100, left.size + ' degrees have no field');
});

test('the file has the connections as the table says (node tools/map-avodata.mjs --check)', () => {
  const out = execFileSync(process.execPath, [fileURLToPath(new URL('../map-avodata.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.match(out, /holds the \d+ connections/);
  assert.ok(readFileSync(fileURLToPath(new URL('../map-avodata.mjs', import.meta.url)), 'utf8').includes('export const MAP'));
});
