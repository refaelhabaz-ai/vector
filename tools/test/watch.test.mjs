// node --test tools/test
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { normalizeText, fingerprint, observe, cadence, watch, fetchPage, buildReport } from '../watch-sources.mjs';

test('normalizeText drops scripts, styles, tokens and clocks but keeps the words', () => {
  const a = '<html><head><style>.x{}</style><script>var t="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7"</script></head><body><h1>תנאי קבלה</h1><p>ציון פסיכומטרי 650</p><span>עודכן 12:30:15</span><input value="Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9v"></body></html>';
  const b = '<html><head><style>.y{}</style><script>var t="ffffffffffffffffffffffffffffffffff"</script></head><body><h1>תנאי קבלה</h1><p>ציון פסיכומטרי 650</p><span>עודכן 09:01:44</span><input value="UVVWV1hZWjAxMjM0NTY3ODlBQkNERUZHSElK"></body></html>';
  assert.equal(normalizeText(a), normalizeText(b));
  assert.match(normalizeText(a), /תנאי קבלה ציון פסיכומטרי 650/);
  assert.notEqual(normalizeText(a), normalizeText(a.replace('650', '660')));
});

test('observe: the first look is not a change, the same page is not a change, a new text is', () => {
  const h = (s) => fingerprint(s);
  let { rec, changed } = observe(null, { ok: true, hash: h('a'), len: 1 }, '2026-10-01');
  assert.equal(changed, false); assert.equal(rec.history.length, 1); assert.equal(rec.lastChanged, null);
  ({ rec, changed } = observe(rec, { ok: true, hash: h('a'), len: 1 }, '2026-10-08'));
  assert.equal(changed, false); assert.equal(rec.observed, 2);
  ({ rec, changed } = observe(rec, { ok: true, hash: h('b'), len: 2 }, '2026-10-15'));
  assert.equal(changed, true); assert.equal(rec.lastChanged, '2026-10-15'); assert.equal(rec.history.at(-1).from, 1);
});

test('observe: a failure is counted, never a change, and a 403 is "blocked"', () => {
  let { rec } = observe(null, { ok: true, hash: fingerprint('a'), len: 1 }, '2026-10-01');
  let r = observe(rec, { ok: false, status: 403 }, '2026-10-08'); rec = r.rec;
  assert.equal(r.changed, false); assert.equal(rec.status, 'blocked'); assert.equal(rec.failStreak, 1); assert.equal(rec.hash, fingerprint('a'));
  r = observe(rec, { ok: true, hash: fingerprint('a'), len: 1 }, '2026-10-15'); rec = r.rec;
  assert.equal(rec.status, 'ok'); assert.equal(rec.failStreak, 0); assert.equal(r.changed, false);
});

test('observe: a 304 keeps everything and is not a change', () => {
  let { rec } = observe(null, { ok: true, hash: fingerprint('a'), len: 1, etag: '"1"' }, '2026-10-01');
  const r = observe(rec, { ok: true, notModified: true, status: 304 }, '2026-10-08');
  assert.equal(r.changed, false); assert.equal(r.rec.etag, '"1"'); assert.equal(r.rec.observed, 2);
});

test('cadence: classes and the rate per year', () => {
  const mk = (days, changes, observed) => ({ first: '2025-01-01', observed, lastChanged: changes.length ? changes.at(-1) : null, history: [{ t: '2025-01-01', init: 1 }, ...changes.map((t) => ({ t }))] });
  assert.equal(cadence(mk(0, [], 2), '2025-02-01').cls, 'unknown');
  assert.equal(cadence(mk(0, [], 30), '2025-09-01').cls, 'stable');
  const a = cadence(mk(0, ['2025-08-20', '2025-09-10'], 30), '2025-09-20');
  assert.equal(a.cls, 'active'); assert.equal(a.medianGap, 21); assert.equal(a.changes, 2);
  const v = cadence(mk(0, ['2025-08-01', '2025-08-08', '2025-08-15', '2025-08-22', '2025-08-29', '2025-09-05'], 30), '2025-09-06');
  assert.equal(v.cls, 'volatile');
  const q = cadence(mk(0, ['2025-03-01'], 30), '2025-09-20');
  assert.equal(q.cls, 'quiet');
});

// a real server whose pages the test changes between runs
function serve(pages) {
  const srv = http.createServer((req, res) => {
    const p = pages[req.url];
    if (p === undefined) { res.writeHead(404); return res.end('no'); }
    if (typeof p === 'number') { res.writeHead(p); return res.end('blocked'); }
    const etag = '"' + fingerprint(p).slice(0, 8) + '"';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', etag });
    res.end(p);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}

test('watch against a live server: first run, same run, a real change, noise, a 404 and a 403', async () => {
  const pages = {
    '/a': '<p>סף קבלה 650</p><script>var n="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"</script>',
    '/b': '<p>מועד הרשמה 1.2</p>',
    '/gone': undefined,
    '/wall': 403,
  };
  const { srv, base } = await serve(pages);
  try {
    const list = ['/a', '/b', '/gone', '/wall'].map((p) => ({ url: base + p, kinds: ['admission'], who: ['tau'] }));
    const state = { v: 1, sources: {} };
    const run = (today) => watch({ list, state, today, delay: 0, concurrency: 2, timeout: 3000 });
    let r = await run('2026-10-01');
    assert.deepEqual(r.changed, []); assert.equal(r.failed.length, 2);
    assert.equal(state.sources[base + '/gone'].status, 'fail'); assert.equal(state.sources[base + '/wall'].status, 'blocked');
    r = await run('2026-10-08');                                         // nothing changed (the 304 path)
    assert.deepEqual(r.changed, []); assert.equal(state.sources[base + '/a'].observed, 2);
    pages['/a'] = '<p>סף קבלה 660</p><script>var n="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"</script>';   // the threshold moved
    pages['/b'] = '<p>מועד הרשמה 1.2</p><script>var n="cccccccccccccccccccccccccccccccccc"</script>'; // noise only
    r = await run('2026-10-15');
    assert.deepEqual(r.changed, [base + '/a']);
    assert.equal(state.sources[base + '/a'].lastChanged, '2026-10-15');
    assert.equal(state.sources[base + '/b'].lastChanged, null);
    const rep = buildReport({ state, DATA: { inst: [{ id: 'tau', n: 'אוניברסיטת תל אביב' }], built: '2026-10-10' }, today: '2026-10-15', changedNow: r.changed, failedNow: r.failed });
    assert.match(rep, /דפים שהשתנו אחרי איסוף הנתונים \(2026-10-10\)/);
    assert.match(rep, /אוניברסיטת תל אביב/);
    assert.match(rep, /403/);
  } finally { srv.close(); }
});

test('fetchPage: a dead host is a failure with status 0, not an exception', async () => {
  const r = await fetchPage('http://127.0.0.1:9/never', { timeout: 1500 });
  assert.equal(r.ok, false); assert.equal(r.status, 0);
});

// apply-watch writes into a COPY of index.html (VECTOR_SITE) and must keep the line endings and every other byte
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));

test('apply-watch: adds a watch object at the end of DATA, replaces it on the next run, changes nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vec-'));
  const copy = join(dir, 'index.html'); copyFileSync(join(root, 'index.html'), copy);
  const before = readFileSync(copy, 'utf8');
  const stateDir = join(dir, 'st'); mkdirSync(stateDir);
  const rec = (kinds, who, lastChanged, hist) => ({ kinds, who, first: '2026-09-01', last: '2026-10-25', lastOk: '2026-10-25', lastChanged, hash: 'x', len: 1, observed: 6, fails: 0, failStreak: 0, status: 'ok', history: hist });
  const state = { v: 1, checked: '2026-10-25', sources: {
    'https://example.org/technion-adm': rec(['admission'], ['technion'], '2026-10-20', [{ t: '2026-09-01', init: 1 }, { t: '2026-10-20' }]),
    'https://example.org/old': rec(['thresholds'], ['tau'], '2026-09-10', [{ t: '2026-09-01', init: 1 }, { t: '2026-09-10' }]),          // changed before the data was built: left out
    'https://example.org/fact': rec(['fact'], ['psy.date'], '2026-10-21', [{ t: '2026-09-01', init: 1 }, { t: '2026-10-21' }]),              // not an institution: left out
  } };
  writeFileSync(join(stateDir, 'state.json'), JSON.stringify(state));
  const run = () => execFileSync('node', [join(root, 'tools/apply-watch.mjs'), '--state', stateDir, '--today', '2026-10-25'], { env: { ...process.env, VECTOR_SITE: copy }, encoding: 'utf8' });
  run(); const once = readFileSync(copy, 'utf8');
  assert.match(once, /"watch":\{"checked":"2026-10-25","total":3,"failed":0,"changed":\[\{"i":"technion","k":"admission","t":"2026-10-20","u":"https:\/\/example.org\/technion-adm"\}\]\}\};/);
  assert.equal((once.match(/\r\n/g) || []).length, (before.match(/\r\n/g) || []).length, 'line endings kept');
  run(); const twice = readFileSync(copy, 'utf8');
  assert.equal(twice, once, 'a second run replaces the object instead of adding one');
  // everything outside the DATA line is byte for byte the same
  const rest = (t) => t.split('\n').filter((l) => !l.startsWith('const DATA = ')).join('\n');
  assert.equal(rest(once), rest(before));
  // and the data is still valid JSON that audit-data can read
  const out = execFileSync('node', [join(root, 'tools/audit-data.mjs'), '--json', '--today', '2026-10-25'], { env: { ...process.env, VECTOR_SITE: copy }, encoding: 'utf8' });
  assert.ok(JSON.parse(out).counts);
});
