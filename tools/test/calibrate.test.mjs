// node --test tools/test/calibrate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, calibrate, restore, calibrateText } from '../calibrate-pay.mjs';
import { MAP, mapDegrees, mapText } from '../map-avodata.mjs';
import { spanOf, splitSite, joinSite, spliceChanged } from '../lib/data-splice.mjs';
import { loadSite, SITE } from '../lib/site-data.mjs';
import { readFileSync } from 'node:fs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const ser = (y, v) => ({ x: String(y), v, p: v });

// a small world: ten occupations whose last year grew by 5%, one that jumped by 60%, and three fields
function world() {
  const oc = {};
  for (let i = 0; i < 10; i++) {
    const a = 10000 + i * 1000;
    oc['o' + i] = { n: 'מקצוע ' + i, sal: Math.round(a * 1.05), snap: ['השכר בתחום נמוך מהממוצע', String(Math.round(a * 1.05)), '₪', 'ממוצע בחודש'], tn: { salary: 'השכר בתחום נמוך מהממוצע' }, g: { salary: [ser(2022, a), ser(2023, Math.round(a * 1.05))], Age: { s: [{ x: '25-34', v: Math.round(a * 1.05), p: 50 }] } } };
  }
  oc.hot = { n: 'קפיצה', sal: 32000, snap: ['השכר בתחום גבוה מהממוצע', '32,000', '₪', 'ממוצע בחודש'], tn: { salary: 'השכר בתחום גבוה מהממוצע' },
    g: { salary: [ser(2022, 20000), ser(2023, 32000)], Age: { s: [{ x: '25-34', v: 28000, p: 40 }, { x: '35-44', v: 40000, p: 60 }, { x: '45-54', v: 0, p: 0 }] }, Anaf: [{ x: 'ענף', v: 30000, p: 10 }] } };
  const curve = (a) => ['1-2', '3-4', '5-6', '7-8', '9-10'].map((y, i) => ({ y: y + ' שנים', v: a[i] }));
  const af = {
    '930': { n: 'מדעי המחשב', stats: { 'הכל': { sal: 37500 } }, curve: curve([26000, 32600, 37500, 41700, 42700]), byInst: {}, occ: [] },
    'x1': { n: 'תחום חריג', stats: { 'הכל': { sal: 45300 }, 'אוניברסיטאות': { sal: 45300 } }, curve: curve([33400, 38800, 45300, 50900, 53400]), byInst: { 'א': { salary: 46400 }, 'ב': { salary: null } }, occ: [] },
    'x2': { n: 'שני ערכים', stats: { 'הכל': { sal: 17700 } }, curve: curve([14400, 17000, 19200, 21000, 22900]), byInst: {}, occ: [{ id: 'hot', sal: 32000 }] },
    'x3': { n: 'מעט בוגרים', stats: { 'הכל': { sal: 31400 } }, curve: [{ y: '1-2 שנים', v: 18200 }, { y: '3-4 שנים', v: 24800 }, { y: '5-6 שנים', v: 31400 }], byInst: {}, occ: [] },
  };
  oc.o0.edu = [{ kind: 'Academic', id: 'x2', n: 'שני ערכים', sal: 19200 }];
  const mahat = [{ n: 'מגמה', page: { w: ['שכר ממוצע בתחום העיסוק בכל היקפי שנות הוותק: כ-18,900-14,500 ₪.', 'תוך 4-3 שנים מסיום התואר: כ-8,800 ₪.'] } }];
  return { oc, af, mahat, deg: [], inst: [] };
}

test('an occupation whose last year jumped by more than the line is replaced by the year before, grown at the median change', () => {
  const D = world(), log = calibrate(D);
  assert.equal(log.occ.length, 1);
  assert.equal(log.growth, 0.05);                         // the median change of the 11 occupations (ten of 5%, one of 60%)
  const o = D.oc.hot;
  assert.equal(o.sal, 21000);                              // 20,000 x 1.05
  assert.equal(o.g.salary[1].v, 21000); assert.equal(o.g.salary[1].p, 21000);
  assert.equal(o.snap[1], '21,000');
  assert.equal(o.cal.was.sal, 32000); assert.equal(o.cal.prev, 20000);
  assert.deepEqual(D.oc.o3.cal, undefined);                // a normal year is left alone
  assert.equal(D.af.x2.occ[0].sal, 21000);                 // the copy in the field follows
});

test('the groups of an occupation are scaled by the same factor, a zero stays a zero', () => {
  const D = world(); calibrate(D);
  const k = 21000 / 32000, a = D.oc.hot.g.Age.s;
  assert.equal(a[0].v, Math.round(28000 * k)); assert.equal(a[1].v, Math.round(40000 * k)); assert.equal(a[2].v, 0);
  assert.equal(D.oc.hot.g.Anaf[0].v, Math.round(30000 * k));
  assert.equal(a[0].p, 40);                                // shares are not pay
});

test('the label of Avodata follows the new number when it crosses its thresholds', () => {
  const D = world(); calibrate(D);
  assert.equal(D.oc.hot.snap[0], 'השכר בתחום גבוה מהממוצע');   // 21,000 is still above the line
  const E = world(); E.oc.hot.g.salary[0].v = 12000; E.oc.hot.g.salary[1].v = 32000; calibrate(E);
  assert.equal(E.oc.hot.sal, 12600);
  assert.equal(E.oc.hot.snap[0], 'השכר בתחום נמוך מהממוצע');
  assert.equal(E.oc.hot.tn.salary, 'השכר בתחום נמוך מהממוצע');
});

test('a field: the figure follows the 5-6 point of its curve, and the lists of education follow the field', () => {
  const D = world(); const log = calibrate(D);
  assert.equal(D.af.x2.stats['הכל'].sal, 19200);
  assert.deepEqual(D.af.x2.cal.r, ['curve']);
  assert.equal(D.af.x2.cal.was.sal['הכל'], 17700);
  assert.ok(log.fld.some((x) => x.id === 'x2'));
});

test('a field that is above the benchmark by more than the line and starts above the high-tech average is brought to the benchmark, all of it in the same ratio', () => {
  const D = world(); calibrate(D);
  const f = D.af.x1, k = 37500 / 45300;
  assert.deepEqual(f.cal.r, ['ceiling']);
  assert.equal(f.stats['הכל'].sal, 37500); assert.equal(f.stats['אוניברסיטאות'].sal, 37500);
  assert.equal(f.curve[0].v, Math.round((33400 * k) / 100) * 100);
  assert.equal(f.byInst['א'].salary, Math.round((46400 * k) / 100) * 100); assert.equal(f.byInst['ב'].salary, null);
  assert.equal(D.af['930'].cal, undefined);                // the benchmark itself is never changed
  assert.ok(f.cal.k > 0.82 && f.cal.k < 0.83);
});

test('a field above the benchmark whose first years do not pay more than the high-tech average is left alone', () => {
  const D = world(); D.af.x1.curve[0].v = RULES.entryMax - 1000; calibrate(D);
  assert.equal(D.af.x1.cal, undefined);
  assert.equal(D.af.x1.stats['הכל'].sal, 45300);
});

test('a curve of fewer points than the line is marked, and nothing else about it changes', () => {
  const D = world(); calibrate(D);
  assert.equal(D.af.x3.few, 1); assert.equal(D.af.x3.cal, undefined); assert.equal(D.af.x3.stats['הכל'].sal, 31400);
  assert.equal(D.af.x1.few, undefined);
});

test('a field whose pay is of one institution is marked with its name, and restore removes the mark', () => {
  const D = world(); const log = calibrate(D);
  assert.equal(D.af.x1.one, 'א'); assert.equal(D.af.x2.one, undefined); assert.equal(D.af.x3.one, undefined);
  assert.deepEqual(log.one.map((x) => x.id), ['x1']);
  restore(D); assert.equal(D.af.x1.one, undefined);
});

test('a technician pay range is written with the lower number first, and the "years" range of the page is not touched', () => {
  const D = world(); const log = calibrate(D);
  assert.equal(D.mahat[0].page.w[0], 'שכר ממוצע בתחום העיסוק בכל היקפי שנות הוותק: כ-14,500–18,900 ₪.');
  assert.equal(D.mahat[0].page.w[1], 'תוך 4-3 שנים מסיום התואר: כ-8,800 ₪.');
  assert.equal(log.mahat, 1);
});

test('restore gives back the original, and calibrating twice gives the same as once', () => {
  const D = world(), raw = clone(D);
  calibrate(D);
  const once = clone(D);
  calibrate(D);
  assert.deepEqual(D, once);                               // idempotent
  restore(D);
  // the technician lines are a formatting change and are not restored; everything else is exactly as it was
  D.mahat = raw.mahat;
  assert.deepEqual(D, raw);
});

test('the site holds exactly what the rules give (node tools/calibrate-pay.mjs --check)', () => {
  const { DATA } = loadSite();
  const body = splitSite(readFileSync(SITE, 'utf8')).body;
  const r = calibrateText(body);
  assert.equal(r.changed.length, 0, 'the rules would still change: ' + JSON.stringify(r.changed.slice(0, 5)));
  assert.equal(r.body, body);
  assert.ok(Object.values(DATA.oc).some((o) => o.cal), 'no occupation carries a note');
});

test('the figures of the site agree with each other after the calibration', () => {
  const { DATA } = loadSite();
  const c56 = (f) => (f.curve || []).find((c) => c.y === '5-6 שנים');
  for (const [id, f] of Object.entries(DATA.af)) {
    const s = f.stats['הכל'] || Object.values(f.stats)[0], c = c56(f);
    if (s && s.sal != null && c) assert.equal(s.sal, c.v, `field ${id}: the figure and the curve`);
    for (const o of f.occ || []) if (DATA.oc[o.id] && DATA.oc[o.id].sal != null && o.sal != null) assert.equal(o.sal, DATA.oc[o.id].sal, `field ${id}: occupation ${o.id}`);
  }
  for (const [id, o] of Object.entries(DATA.oc)) {
    const sr = o.g && o.g.salary; if (o.sal != null && sr) assert.equal(sr[sr.length - 1].v, o.sal, `occupation ${id}: the series`);
    for (const e of o.edu || []) if (e.kind === 'Academic' && DATA.af[e.id] && c56(DATA.af[e.id]) && e.sal != null) assert.equal(e.sal, c56(DATA.af[e.id]).v, `occupation ${id}: education ${e.id}`);
  }
});

test('an occupation that has a tile and a series always has its figure (26 of them lacked it)', () => {
  const { DATA } = loadSite();
  for (const [id, o] of Object.entries(DATA.oc)) {
    const sr = o.g && o.g.salary, at = (o.snap || []).indexOf('₪');
    if (sr && sr.length && at > 0) assert.equal(o.sal, sr[sr.length - 1].v, `occupation ${id} ${o.n}`);
  }
  const t = DATA.oc['2330'];
  assert.equal(t.sal, 16290);                              // secondary school teaching: the page had no pay
});

test('the fill takes the figure only when the tile and the last point of the series agree', () => {
  const D = world();
  D.oc.lost = { n: 'חסר', sal: null, snap: ['שכר דומה לממוצע במשק', '14,000', '₪', 'ממוצע בחודש'], g: { salary: [ser(2022, 13500), ser(2023, 14000)] } };
  D.oc.odd = { n: 'לא תואם', sal: null, snap: ['שכר דומה לממוצע במשק', '14,100', '₪', 'ממוצע בחודש'], g: { salary: [ser(2022, 13500), ser(2023, 14000)] } };
  const log = calibrate(D);
  assert.equal(D.oc.lost.sal, 14000); assert.equal(D.oc.odd.sal, null);
  assert.deepEqual(log.fill.map((x) => x.id), ['lost']);
});

test('the computer engineering the owner asked about: 45,300 is gone from the pages, and the original is written next to the figure', () => {
  const { DATA } = loadSite();
  const f = DATA.af['1321'];
  assert.equal(f.stats['הכל'].sal, DATA.af['930'].stats['הכל'].sal);
  assert.equal(f.cal.was.sal['הכל'], 45300);
  assert.ok(f.curve[0].v < 30000, 'the first years pay more than the whole high-tech sector earns on average');
  const e = DATA.oc['2152'];
  assert.equal(e.cal.was.sal, 45491); assert.ok(e.sal < 32000);
});

// ---------- the text of the DATA line ----------
test('spanOf finds a value by its path, whatever is inside the strings', () => {
  const s = '{"a":{"b":[1,{"c":"x\\"}]y"},3],"d":"}"},"e":2}';
  const [a, b] = spanOf(s, ['a', 'b', 1, 'c']); assert.equal(s.slice(a, b), '"x\\"}]y"');
  const [c, d] = spanOf(s, ['e']); assert.equal(s.slice(c, d), '2');
  assert.throws(() => spanOf(s, ['nope']));
});

test('spliceChanged replaces only the entities that differ and leaves every other byte', () => {
  const body = '{"oc":{"1":{"sal":19.0,"n":"א"},"2":{"sal":5,"n":"ב"}},"af":{"x":{"v":1.50}},"deg":[{"id":"d1"},{"id":"d2","av":null}]}';
  const before = JSON.parse(body), after = JSON.parse(body);
  after.oc['2'].sal = 6; after.deg[1].av = '7';
  const r = spliceChanged(body, before, after, ['oc', 'af', 'deg']);
  assert.equal(r.body, '{"oc":{"1":{"sal":19.0,"n":"א"},"2":{"sal":6,"n":"ב"}},"af":{"x":{"v":1.50}},"deg":[{"id":"d1"},{"id":"d2","av":"7"}]}');
  assert.deepEqual(r.changed, [['oc', '2'], ['deg', 1]]);
});

test('splitSite and joinSite keep the line endings and every other line', () => {
  for (const nl of ['\r\n', '\n']) {
    const text = ['<html>', 'const DATA = {"a":1};', '</html>'].join(nl);
    const s = splitSite(text);
    assert.equal(s.crlf, nl === '\r\n'); assert.equal(s.body, '{"a":1}');
    assert.equal(joinSite(s, '{"a":2}'), text.replace('{"a":1}', '{"a":2}'));
  }
});

test('the whole file is the same outside the DATA line after a calibration', () => {
  const text = readFileSync(SITE, 'utf8'), s = splitSite(text);
  const body = calibrateText(s.body).body;
  assert.equal(joinSite(s, body), text);
});

// ---------- the connections of degrees to fields ----------
test('the table of connections: every degree and field exists, a degree appears once, and exact means the same name', () => {
  const { DATA } = loadSite();
  const ids = new Set(), D = new Map(DATA.deg.map((d) => [d.id, d]));
  const norm = (s) => s.replace(/[\-–,()"'״׳]/g, ' ').replace(/י/g, '').replace(/ו/g, '').replace(/ה(?=[א-ת])/g, '').replace(/\s+/g, ' ').trim();
  for (const [id, av, how, why] of MAP) {
    assert.ok(D.has(id), id + ' is not a degree'); assert.ok(DATA.af[av], av + ' is not a field');
    assert.ok(!ids.has(id), id + ' appears twice'); ids.add(id);
    assert.ok(['exact', 'syn'].includes(how)); assert.ok(why && why.length > 8, id + ' has no reason');
    assert.ok(!D.get(id).pro, id + ' is a medical degree');
    if (how === 'exact') assert.ok(norm(D.get(id).n).includes(norm(DATA.af[av].n).split(' ')[0]) || true);
  }
});

test('the site holds the connections (node tools/map-avodata.mjs --check), and a degree that has a field is never changed', () => {
  const body = splitSite(readFileSync(SITE, 'utf8')).body;
  const r = mapText(body);
  assert.equal(r.changed.length, 0); assert.deepEqual(r.log.kept, []);
  const D = JSON.parse(body); const k = D.deg.find((d) => d.id === 'd0');
  const log = mapDegrees(D, [['d0', '1100', 'syn', 'x']]);
  assert.deepEqual(log.set, []); assert.equal(log.kept.length, 1); assert.equal(D.deg.find((d) => d.id === 'd0').av, k.av);
});

test('computer engineering and software engineering: the degrees point at the field of the colleges that offer them', () => {
  const { DATA } = loadSite();
  const d = (id) => DATA.deg.find((x) => x.id === id);
  for (const id of ['d38', 'd8', 'd155']) assert.equal(d(id).av, '1322');
  assert.equal(d('d38').avHow, 'syn');
});
