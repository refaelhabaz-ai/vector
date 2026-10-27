// node --test tools/test/avodata.test.mjs
// The collector that runs in a person's browser (tools/avodata-collect.console.js), the reading of the file it saves (tools/lib/avodata-dump.mjs), and the comparison of that file
// with the data of the site (tools/verify-avodata.mjs). The collector itself is run against a stand-in for Avodata in tools/test/collector.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { loadSite } from '../lib/site-data.mjs';
import { targets, stamped, stamp, pagePath } from '../lib/avodata-targets.mjs';
import { readZip, readDump, corpus, norm, numbersIn, crc32 } from '../lib/avodata-dump.mjs';
import { verify, original, fieldClaims, occupationClaims, trackClaims, evaluate } from '../verify-avodata.mjs';

const { html, DATA } = loadSite();
const HERE = dirname(fileURLToPath(import.meta.url));
const COLLECTOR = join(HERE, '..', 'avodata-collect.console.js');
const VERIFY = join(HERE, '..', 'verify-avodata.mjs');
const ORIGIN = 'https://avodata.labor.gov.il';

// ---------- a zip file, written the way the collector writes it ----------
function zipOf(files, deflate = true) {
  const parts = [], central = []; let off = 0;
  for (const [name, text] of files) {
    const nm = Buffer.from(name), raw = Buffer.from(text), data = deflate ? deflateRawSync(raw) : raw, method = deflate ? 8 : 0, crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nm); off += 30 + nm.length + data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, ...central, end]);
}

// ---------- a page as Avodata would show it, made from the data itself: every string and number of the entity, in order ----------
const lines = (v, out = []) => {
  if (v == null) return out;
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'number') out.push(v >= 1000 ? v.toLocaleString('en-US') : String(v));
  else if (Array.isArray(v)) v.forEach((x) => lines(x, out));
  else for (const [k, x] of Object.entries(v)) { if (k === 'cal') continue; out.push(k); lines(x, out); }       // the note of the calibration is not on Avodata's page
  return out;
};
function pageOf(kind, id, entity, extra = {}) {
  const links = [];
  if (kind === 'Academic') for (const o of entity.occ || []) links.push([`/isco_group/${o.id}`, o.n]);
  if (kind === 'isco_group') for (const e of entity.edu || []) links.push([`/${e.kind}/${e.id}`, e.n]);
  return { key: `${kind}/${id}`, kind, id, url: ORIGIN + pagePath(kind, id), final: pagePath(kind, id), status: 'ok', title: entity.n + ' | עבודאטה', text: lines(entity).join('\n'), links, tables: [], net: [], ...extra };
}
/** a whole run: from the data as Avodata said it (`orig`) or as the site shows it after the calibration (`DATA`) */
function synth(source) {
  const pages = new Map(), want = targets(DATA);
  for (const id of want.Academic) pages.set(`Academic/${id}`, pageOf('Academic', id, source.af[id]));
  for (const id of want.isco_group) pages.set(`isco_group/${id}`, pageOf('isco_group', id, source.oc[id]));
  for (const id of want.MahatEducation) pages.set(`MahatEducation/${id}`, pageOf('MahatEducation', id, source.mahatAv.find((a) => String(a.id) === id)));
  pages.set('Index/home', { key: 'Index/home', kind: 'Index', id: 'home', url: ORIGIN + '/', final: '/', status: 'ok', title: 'עבודאטה', text: 'עבודאטה דף הבית '.repeat(10), links: [] });
  return { meta: { started: '2026-10-28T08:00:00Z', finished: '2026-10-28T08:20:00Z', planned: pages.size, stopped: false, why: null, agent: 'test' }, pages, problems: [] };
}
const ORIG = original(DATA);
const run = (dump) => verify(DATA, html, dump);
const finding = (r, code) => r.findings.find((f) => f.code === code);

test('the collector holds exactly the pages that index.html points at, and says so in the check the maintainers run', () => {
  const src = readFileSync(COLLECTOR, 'utf8');
  assert.deepEqual(stamped(src), targets(DATA));
  assert.ok(Object.values(targets(DATA)).every((a) => a.length > 0));
  assert.equal(stamped(stamp(src, { Academic: ['1'], isco_group: [], MahatEducation: [] })).Academic[0], '1');
  assert.match(execFileSync(process.execPath, [VERIFY, '--check-stamp'], { encoding: 'utf8' }), /holds the \d+ pages/);
});

test('the collector is a script that reads one site: it parses, asks for no other address, evaluates nothing, and writes the page only with the DOM', () => {
  const src = readFileSync(COLLECTOR, 'utf8');
  new vm.Script(src);
  assert.deepEqual([...new Set(src.match(/https?:\/\/[\w.-]+/g))], [ORIGIN]);
  assert.ok(!/\beval\(|new Function\(|document\.write|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/.test(src), 'nothing is evaluated or written as HTML');
  assert.match(src, /location\.origin !== CFG\.origin/, 'it runs only on the site it reads');
  assert.ok(!/defineProperty\([^)]*userAgent|spoof|navigator\.webdriver/i.test(src), 'it does not pretend to be anything');
  assert.ok(!/credentials:\s*'omit'|mode:\s*'no-cors'/.test(src));
  assert.match(src, /maxBlocks/, 'it stops by itself when the site blocks it');
});

test('a zip written by the collector (stored or deflated) is read, and a damaged or cut one is refused', () => {
  const files = [['meta.json', '{"a":1}'], ['pages/x-1.json', JSON.stringify({ key: 'x/1', text: 'שלום '.repeat(500) })]];
  for (const deflate of [true, false]) {
    const m = readZip(zipOf(files, deflate));
    assert.deepEqual([...m.keys()], ['meta.json', 'pages/x-1.json']);
    assert.equal(JSON.parse(m.get('pages/x-1.json')).text.length, 2500);
  }
  const z = zipOf(files, false);
  const bad = Buffer.from(z); bad[40] ^= 0xff;                                  // a byte of the first entry changes
  assert.throws(() => readZip(bad), /damaged/);
  assert.throws(() => readZip(z.subarray(0, z.length - 30)), /not a zip/);       // a download that was cut has no end record
});

test('a run is read from the zip and from the folder it was unpacked to, and an answer that several pages share is given back to each', () => {
  const shared = [{ id: 1, u: ORIGIN + '/api/lists', m: 'GET', s: 200, r: '{"names":["אונ\' תל אביב"]}' }];
  const page = { key: 'Academic/1', kind: 'Academic', id: '1', status: 'ok', text: 'x', net: [{ u: ORIGIN + '/api/lists', m: 'GET', s: 200, ref: 1 }] };
  const files = [['meta.json', JSON.stringify({ planned: 1 })], ['pages/Academic-1.json', JSON.stringify(page)], ['shared.json', JSON.stringify(shared)]];
  const dir = mkdtempSync(join(tmpdir(), 'avodump-')), zip = join(dir, 'd.zip'), un = join(dir, 'un');
  writeFileSync(zip, zipOf(files)); mkdirSync(join(un, 'pages'), { recursive: true });
  for (const [n, t] of files) writeFileSync(join(un, n), t);
  for (const p of [zip, un]) {
    const d = readDump(p);
    assert.deepEqual(d.problems, []); assert.equal(d.meta.planned, 1);
    assert.equal(d.pages.get('Academic/1').net[0].r, shared[0].r);
    assert.ok(corpus(d.pages.get('Academic/1')).has('אונ\' תל אביב'), 'the names inside an answer of the servers are on the page');
  }
});

test('a page is searched by phrase and by number, wherever the figure sat', () => {
  assert.equal(norm('  ‏האונ’ העברית – בירושלים‎ '), "האונ' העברית - בירושלים");
  assert.deepEqual(numbersIn('שכר 11,600 ₪ ו-46.9 שעות, 92% ו-1-2 שנים'), [11600, 46.9, 92, 1, 2]);
  const c = corpus({
    title: 'הנדסת תוכנה | עבודאטה', text: 'שכר ממוצע\n34,300\n₪\nשיעור תעסוקה\n87%', tables: [[['מוסד', 'שכר'], ['הטכניון', '46400']]], links: [['/isco_group/2512', 'פיתוח תוכנה']],
    aria: [['rect', 'label', '1-2 שנים: 20900']], d3: [{ y: '3-4 שנים', v: 27800 }], net: [{ u: 'x', r: JSON.stringify({ emp: 0.83, rows: [{ n: 'מכללות', s: 31600 }] }) }],
  });
  assert.ok(c.has('שיעור תעסוקה') && c.has('הטכניון') && c.has('מכללות') && c.has('פיתוח$תוכנה'), '`$` is where a page breaks a phrase');
  for (const n of [34300, 46400, 20900, 27800, 31600, 87]) assert.ok(c.hasNum(n), String(n));
  assert.ok(c.hasNum(0.83), 'a fraction is also a percent');
  assert.ok(!c.hasNum(34310) && !c.has('תל אביב'));
  assert.equal(c.nearest(34900), 34300); assert.equal(c.nearest(34900, 0.001), null);
  assert.ok(c.links.isco_group.has('2512'));
  assert.deepEqual(c.lines.slice(0, 3), ['הנדסת תוכנה | עבודאטה', 'שכר ממוצע', '34,300']);
});

test('the claims: what the data says about a page, and when a page holds it', () => {
  const f = ORIG.af['1322'], cf = fieldClaims(f), labels = cf.map((c) => c.label);
  for (const l of ['name', 'stats.הכל.sal', 'curve.5-6 שנים', 'industry', 'occupation']) assert.ok(labels.some((x) => x.startsWith(l)), l);
  assert.ok(labels.some((l) => l.startsWith('inst ')) && labels.some((l) => l === 'link isco_group/2512'));
  const o = ORIG.oc['2512'], co = occupationClaims(o);
  assert.ok(co.some((c) => c.type === 'seq' && c.value.includes('40,237')), 'the snapshot is a sequence');
  assert.ok(co.some((c) => c.label === 'g.salary.2023') && co.some((c) => c.label.startsWith('edu ')));
  assert.ok(trackClaims(ORIG.mahatAv[0]).some((c) => c.type === 'num' || c.type === 'seq'));
  // a sequence is found in order, not as a set
  const corp = corpus({ text: 'השכר בתחום גבוה מהממוצע\n40,237\n₪\nממוצע בחודש' });
  assert.ok(evaluate({ type: 'seq', value: ['השכר בתחום גבוה מהממוצע', '40,237', '₪'] }, corp).ok);
  assert.ok(!evaluate({ type: 'seq', value: ['₪', '40,237', 'השכר בתחום גבוה מהממוצע'] }, corp).ok);
});

test('a run made of the data itself verifies every page; the calibration of the pay is undone before the comparison', () => {
  const r = run(synth(ORIG));
  const n = Object.values(targets(DATA)).reduce((s, a) => s + a.length, 0);
  assert.equal(r.summary.pages, n); assert.equal(r.summary.verified, n, r.pages.filter((p) => p.verdict !== 'verified').slice(0, 5).map((p) => `${p.key} ${p.verdict} ${p.missing}`).join('; '));
  assert.equal(r.summary.claimsOk, r.summary.claims);
  assert.ok(!finding(r, 'data.changed') && !finding(r, 'pages.unread') && !finding(r, 'data.off'));
  assert.ok(r.summary.calibrated.entities > 10 && r.summary.calibrated.verified === r.summary.calibrated.entities, 'the originals of the calibrated entities are on the pages');
  assert.ok(r.summary.mapping.checked > 100 && r.summary.mapping.listed / r.summary.mapping.checked > 0.6, JSON.stringify(r.summary.mapping));
  assert.ok(r.summary.claims > 5000);
});

test('the figures the site shows after the calibration are not what Avodata said: a run made of them shows where the site and the source part', () => {
  const [id] = Object.entries(DATA.af).find(([, f]) => f.cal && f.cal.r.includes('ceiling')), was = Math.max(...Object.values(DATA.af[id].cal.was.sal)), shown = Math.max(...Object.values(DATA.af[id].stats).map((s) => s.sal));
  assert.ok(shown < was, 'the calibration lowered the pay of field ' + id);
  const r = run(synth(DATA)), ch = finding(r, 'data.changed'), p = r.pages.find((x) => x.key === `Academic/${id}`);
  assert.ok(p.missing.includes('stats.הכל.sal'), 'the original pay is not on the page');
  assert.ok(ch && ch.ids.some((s) => s.startsWith(`Academic/${id} `) && s.includes(`data ${was} page `)), `field ${id}: the original ${was} is not on the page`);
});

test('a figure that changed on the page is named with the figure the page holds now, and the page still counts as read', () => {
  const dump = synth(ORIG), id = '1322', p = dump.pages.get(`Academic/${id}`), sal = ORIG.af[id].stats['הכל'].sal;
  p.text = p.text.split(sal.toLocaleString('en-US')).join((sal - 1100).toLocaleString('en-US'));
  const r = run(dump), ch = finding(r, 'data.changed');
  assert.ok(ch.ids.some((s) => s.startsWith(`Academic/${id} `) && s.includes(`data ${sal} page ${sal - 1100}`)), ch && ch.ids.join('\n'));
  assert.equal(r.pages.find((x) => x.key === `Academic/${id}`).verdict, 'verified');
});

test('a page that was not read, led elsewhere, or is gone is said so and is not compared', () => {
  const dump = synth(ORIG);
  dump.pages.delete('Academic/1');
  Object.assign(dump.pages.get('Academic/2'), { status: 'blocked' });
  Object.assign(dump.pages.get('Academic/3'), { final: '/' });
  Object.assign(dump.pages.get('Academic/10'), { title: 'עבודאטה', text: 'הדף שביקשתם לא נמצא', links: [] });
  const r = run(dump), by = (k) => r.pages.find((p) => p.key === k);
  assert.equal(by('Academic/1').verdict, 'unread'); assert.equal(by('Academic/2').verdict, 'unread'); assert.match(by('Academic/2').note, /blocked/);
  assert.equal(by('Academic/3').verdict, 'redirected'); assert.equal(by('Academic/10').verdict, 'notfound');
  assert.equal(r.summary.unread, 2); assert.ok(finding(r, 'pages.redirected') && finding(r, 'pages.notfound'));
});

test('a page whose figures are somewhere else than the data says is "off", and a page that links to something the data lacks is reported', () => {
  const dump = synth(ORIG);
  Object.assign(dump.pages.get('Academic/20'), { text: 'עמוד אחר לגמרי\n1\n2\n3', links: [] });
  dump.pages.get('Index/home').links = [['/Academic/99999', 'תחום חדש בעבודאטה'], ['/isco_group/9999', 'מקצוע חדש'], ['/Academic/1', 'ידוע']];
  const r = run(dump);
  assert.equal(r.pages.find((p) => p.key === 'Academic/20').verdict, 'off');
  assert.ok(finding(r, 'data.off').ids.some((s) => s.startsWith('Academic/20 ')));
  assert.ok(finding(r, 'new.Academic').ids.includes('Academic/99999 תחום חדש בעבודאטה'));
  assert.ok(finding(r, 'new.isco_group').ids.includes('isco_group/9999 מקצוע חדש'));
});

test('a degree is confirmed when the page of its field lists its institution; one connected by the map and not listed is named', () => {
  const dump = synth(ORIG), base = run(dump).summary.mapping.checked;
  // software engineering (d38) rests on field 1322: take the institutions out of that page and the connection is no longer confirmed
  const p = dump.pages.get('Academic/1322'), names = Object.keys(ORIG.af['1322'].byInst);
  p.text = p.text.split('\n').filter((l) => !names.includes(l)).join('\n'); p.links = [];
  const r = run(dump);
  assert.equal(r.summary.mapping.checked, base);
  assert.ok(r.summary.mapping.listed < run(synth(ORIG)).summary.mapping.listed);
  assert.ok(finding(r, 'map.unlisted').ids.some((s) => s.startsWith('d38 ')), 'd38 is named');
});

test('the command line: a run in a zip is verified, --json prints it, a missing file is refused', () => {
  const dump = synth(ORIG), dir = mkdtempSync(join(tmpdir(), 'avover-'));
  const files = [['meta.json', JSON.stringify(dump.meta)], ['shared.json', '[]'], ...[...dump.pages.values()].map((r) => [`pages/${r.kind}-${r.id}.json`, JSON.stringify(r)])];
  writeFileSync(join(dir, 'avodata-dump-2026-10-28-08-00.zip'), zipOf(files));
  const out = execFileSync(process.execPath, [VERIFY, join(dir, 'avodata-dump-2026-10-28-08-00.zip')], { encoding: 'utf8' });
  assert.match(out, /^pages: \d+ {2}verified \d+/);
  const json = JSON.parse(execFileSync(process.execPath, [VERIFY, join(dir, 'avodata-dump-2026-10-28-08-00.zip'), '--json', '--only', 'Academic/1322'], { encoding: 'utf8' }));
  assert.equal(json.summary.pages, 1); assert.equal(json.pages[0].key, 'Academic/1322');
  assert.throws(() => execFileSync(process.execPath, [VERIFY, join(dir, 'nothing.zip')], { stdio: 'pipe' }));
});
