// node --test tools/test/collector.test.mjs
// Runs the collector (tools/avodata-collect.console.js) in a real browser against a stand-in for avodata.labor.gov.il that is served under the real address, so that its check of the
// address is the real one. Needs Playwright; without it the tests are skipped (nothing else in tools/ needs a browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDump, corpus } from '../lib/avodata-dump.mjs';

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch (e) { /* no browser: skipped below */ }
const skip = chromium ? false : 'Playwright is not installed';
const SCRIPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'avodata-collect.console.js'), 'utf8');
const ORIGIN = 'https://avodata.labor.gov.il';
const FAST = { settleMs: 300, pollMs: 100, pauseMs: 20, maxWaitMs: 8000, backoffMs: 800 };

// ---------- the stand-in: a page that asks its servers for its data (fetch, XHR and a POST), draws a table, a list of links and a chart late, and keeps part of its text folded ----------
const SHELL = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>עבודאטה</title></head><body><header><nav><a href="/">בית</a></nav></header><div id="app">טוען…</div><script>
(async () => {
  const app = document.getElementById('app'), p = location.pathname, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const m = p.match(/^\\/(Academic|isco_group|MahatEducation)\\/(\\w+)$/);
  if (p === '/') { app.innerHTML = '<h1>עבודאטה</h1><p>מאגר נתונים על תעסוקה והשכלה של משרד העבודה. אפשר לחפש מקצוע, תחום לימוד או מסלול הנדסאים.</p><a href="/Academic/99999">תחום שהנתונים לא מכירים</a>'; return; }
  if (!m) { app.textContent = 'הדף שביקשתם לא נמצא'; return; }
  await sleep(100);
  const d = await (await fetch('/api/page/' + m[1] + '/' + m[2])).json();
  const lists = await new Promise((res) => { const q = new XMLHttpRequest(); q.open('GET', '/api/lists'); q.onload = () => res(JSON.parse(q.responseText)); q.send(); });
  await (await fetch('/api/query', { method: 'POST', body: JSON.stringify({ id: m[2] }) })).json();
  fetch('/api/slow').then((r) => r.json()).then((j) => { const x = document.createElement('div'); x.textContent = 'נטען באיחור: ' + j.v; app.appendChild(x); });
  document.title = d.name + ' | עבודאטה';
  app.innerHTML = '<h1>' + d.name + '</h1><p>עמוד לדוגמה: כאן מוצגים שכר, תעסוקה, מוסדות לימוד ומקצועות קרובים, כפי שהם מופיעים בעמוד אמיתי של תחום לימוד או של מקצוע.</p><div>שכר ממוצע</div><div>' + d.sal.toLocaleString('en-US') + '</div><table><tr><th>מוסד</th><th>שכר</th></tr><tr><td>הטכניון</td><td>' + (d.sal + 100) + '</td></tr></table>' +
    '<ul><li><a href="/isco_group/2512">פיתוח תוכנה</a></li></ul><button aria-expanded="false" aria-controls="more" id="acc">על התחום</button><div id="more" hidden>תיאור מורחב של ' + d.name + '</div><div id="rows"></div><button id="sm">הצג עוד</button><svg id="chart" width="300" height="100"></svg>';
  document.getElementById('acc').addEventListener('click', (e) => { const o = e.currentTarget.getAttribute('aria-expanded') === 'true'; e.currentTarget.setAttribute('aria-expanded', String(!o)); document.getElementById('more').hidden = o; });
  document.getElementById('sm').addEventListener('click', () => { const x = document.createElement('div'); x.textContent = 'שורה נוספת של ' + d.name; document.getElementById('rows').appendChild(x); });
  await sleep(300);
  const svg = document.getElementById('chart'), NS = 'http://www.w3.org/2000/svg';
  d.curve.forEach((c, i) => { const r = document.createElementNS(NS, 'rect'); r.setAttribute('x', i * 60); r.setAttribute('width', 50); r.setAttribute('height', 50); r.__data__ = c; svg.appendChild(r); });
})();
</script></body></html>`;

async function standIn(ctx, opts = {}) {
  const hits = {}, blocked = { ...(opts.blocked || {}) };
  await ctx.route(ORIGIN + '/**', async (route) => {
    const req = route.request(), p = new URL(req.url()).pathname;
    hits[p] = (hits[p] || 0) + 1;
    if (p === '/api/slow') { await new Promise((r) => setTimeout(r, 1500)); return route.fulfill({ json: { v: 'אחרי השהיה' } }); }       // longer than the quiet time the tests wait for
    if (p.startsWith('/api/page/')) { const id = p.split('/').pop(), n = parseInt(id, 10) || 7; return route.fulfill({ json: { name: 'תחום ' + id, sal: 10000 + n, curve: [{ y: '1-2 שנים', v: 9500 + n }, { y: '3-4 שנים', v: 13200 + n }] } }); }
    if (p === '/api/lists') return route.fulfill({ json: { institutions: Array.from({ length: 300 }, (_, i) => 'מוסד מספר ' + i + ' abcdefghij') } });
    if (p === '/api/query') return route.fulfill({ json: { ok: true, echo: req.postData() } });
    if (blocked[p] > 0) { blocked[p]--; return route.fulfill({ status: 403, contentType: 'text/html', body: '<html><head><title>ERROR: The request could not be satisfied</title></head><body><h1>403 ERROR</h1><p>Request blocked.</p></body></html>' }); }
    const headers = opts.deny && p !== '/' ? { 'x-frame-options': 'DENY' } : {};
    if (opts.blank && p !== '/') return route.fulfill({ contentType: 'text/html', headers, body: '<!doctype html><html><body><div id="app"></div></body></html>' });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', headers, body: SHELL });
  });
  return hits;
}

/** runs the collector on `only` pages in a fresh page of `ctx`; returns the dump it saved, the run, and what the box said */
async function collect(ctx, only, extra = {}, onPage = null) {
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/');
  await page.evaluate((c) => { window.__AVODATA_CONFIG__ = c; }, { ...FAST, only, ...extra });
  const dl = page.waitForEvent('download', { timeout: 90000 });
  const done = page.evaluate(SCRIPT);
  if (onPage) onPage(page);
  const file = join(mkdtempSync(join(tmpdir(), 'avocol-')), 'dump.zip');
  await (await dl).saveAs(file); await done;
  const box = await page.evaluate(() => [...document.documentElement.children].find((x) => x.style && x.style.zIndex === '2147483647').innerText);
  const run = await page.evaluate(() => ({ mode: window.__avodata.mode, why: window.__avodata.why || null, keys: [...window.__avodata.results.keys()] }));
  await page.close();
  return { dump: readDump(file), run, box };
}

const report = (d) => [...d.pages.values()].map((p) => `${p.key} ${p.status} ${(p.text || '').length} ${p.err || ''}`).join('; ');
const PAGES = ['Index/home', 'Academic/1322', 'Academic/1', 'isco_group/2512', 'MahatEducation/21'];
let browser = null, ctx = null;
test.before(async () => { if (chromium) browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); });
test.beforeEach(async () => { if (browser) ctx = await browser.newContext({ acceptDownloads: true }); });
test.afterEach(async () => { if (ctx) await ctx.close(); });

test('the collector reads every page, and the file holds what a person sees and what the page asked its servers for', { skip }, async () => {
  const hits = await standIn(ctx);
  const { dump, run, box } = await collect(ctx, PAGES);
  assert.deepEqual(dump.problems, []); assert.equal(dump.meta.status.ok, PAGES.length, report(dump)); assert.equal(run.mode, 'frame');
  const r = dump.pages.get('Academic/1322'), c = corpus(r);
  assert.equal(r.status, 'ok'); assert.equal(r.final, '/Academic/1322'); assert.match(r.title, /תחום 1322/);
  assert.ok(c.has('שכר ממוצע') && c.hasNum(11322), 'the text and the figure');
  assert.deepEqual(r.tables[0], [['מוסד', 'שכר'], ['הטכניון', '11422']], 'the table');
  assert.ok(r.links.some(([h, t]) => h === '/isco_group/2512' && t === 'פיתוח תוכנה'), 'the links');
  assert.ok(c.has('תיאור מורחב של תחום 1322'), 'what was folded under a button is open');
  assert.ok(c.has('שורה נוספת של תחום 1322'), '"show more" was pressed');
  assert.ok(c.has('נטען באיחור: אחרי השהיה'), 'the collector waits for a call of the page that is still on its way');
  assert.deepEqual(r.d3.map((x) => x.v), [10822, 14522], 'the data a chart keeps on its marks');
  assert.ok(c.hasNum(10822) && c.hasNum(14522));
  const calls = r.net.map((n) => `${n.m} ${n.u.replace(ORIGIN, '')}`);
  assert.ok(calls.includes('GET /api/page/Academic/1322') && calls.includes('GET /api/lists') && calls.includes('POST /api/query'), calls.join(', '));
  assert.equal(r.net.find((n) => n.m === 'POST').b, '{"id":"1322"}', 'the body of a request');
  assert.ok(r.net.every((n) => n.s === 200));
  const shared = [...dump.pages.values()].flatMap((p) => p.net || []).filter((n) => n.u.endsWith('/api/lists'));
  assert.ok(shared.length >= 4 && shared.every((n) => n.r && n.r.length > 3000), 'an answer that every page asks for is kept once and given back to each');
  assert.ok(box.includes('הסתיים') && box.includes('הורדה חוזרת'));
  assert.equal(hits['/Academic/1322'], 1, 'a page is asked for once');
});

test('where the site does not allow frames the person opens a work window, and the run goes on in it', { skip }, async () => {
  await standIn(ctx, { deny: true });
  const { dump, run } = await collect(ctx, PAGES, {}, (page) => {
    const t = setInterval(async () => { try { const b = page.getByRole('button', { name: 'פתיחת חלון עבודה' }); if (await b.count()) { clearInterval(t); await b.click(); } } catch (e) { /* the page is gone */ } }, 300);
    page.once('close', () => clearInterval(t));
  });
  assert.equal(run.mode, 'popup'); assert.equal(dump.meta.status.ok, PAGES.length);
  assert.ok(corpus(dump.pages.get('Academic/1322')).hasNum(11322));
});

test('a page that the site answers with "blocked" makes the run wait and ask again; repeated blocks stop it and save what it has', { skip }, async () => {
  const hits = await standIn(ctx, { blocked: { '/Academic/1': 2 } });
  const { dump, run } = await collect(ctx, PAGES);
  assert.equal(dump.meta.status.ok, PAGES.length); assert.equal(hits['/Academic/1'], 3, 'blocked twice, read the third time');
  assert.equal(run.why, null);
  const ctx2 = await browser.newContext({ acceptDownloads: true });
  await standIn(ctx2, { blocked: { '/Academic/1': 99, '/Academic/1322': 99, '/isco_group/2512': 99, '/MahatEducation/21': 99 } });
  const stopped = await collect(ctx2, PAGES, { maxBlocks: 2 });
  await ctx2.close();
  assert.equal(stopped.run.why, 'blocked'); assert.equal(stopped.dump.meta.stopped, true);
  assert.ok(stopped.dump.meta.pages < PAGES.length);
});

test('pages that come back empty stop the run before the long wait, and the file still holds them for a look', { skip }, async () => {
  await standIn(ctx, { blank: true });
  const { dump, run, box } = await collect(ctx, PAGES);
  assert.equal(run.why, 'empty'); assert.ok(box.includes('ריקים'));
  assert.ok(dump.pages.size >= 1 && [...dump.pages.values()].some((p) => p.status === 'empty'));
});

test('a run that was cut resumes from the pages it saved, in the same browser', { skip }, async () => {
  const hits = await standIn(ctx);
  const first = await ctx.newPage();
  await first.goto(ORIGIN + '/');
  await first.evaluate((c) => { window.__AVODATA_CONFIG__ = c; }, { ...FAST, pauseMs: 400, only: [...PAGES, 'Academic/2', 'Academic/3', 'Academic/10'] });
  const dl1 = first.waitForEvent('download', { timeout: 60000 }), p1 = first.evaluate(SCRIPT);
  await first.waitForFunction(() => window.__avodata && window.__avodata.results.size >= 5);
  await first.evaluate(() => window.__avodata.stop());
  await dl1; await p1;
  const saved = await first.evaluate(() => window.__avodata.results.size);
  const before = Object.keys(hits).filter((k) => k.startsWith('/Academic/')).length;
  const { dump, run } = await collect(ctx, [...PAGES, 'Academic/2', 'Academic/3', 'Academic/10'], { pauseMs: 20 });
  assert.equal(dump.meta.status.ok, PAGES.length + 3); assert.ok(saved >= 5 && saved < PAGES.length + 3);
  for (const k of ['/Academic/1322', '/Academic/1']) assert.equal(hits[k], 1, k + ' was read once');
  assert.ok(run.keys.length === PAGES.length + 3 && before >= 2);
});

test('on another site it does nothing but say so', { skip }, async () => {
  const page = await ctx.newPage();
  await ctx.route('https://example.org/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body>x</body></html>' }));
  await page.goto('https://example.org/');
  let msg = ''; page.on('dialog', async (d) => { msg = d.message(); await d.dismiss(); });
  await page.evaluate(SCRIPT);
  assert.match(msg, /עבודאטה/);
  assert.equal(await page.evaluate(() => typeof window.__avodata), 'undefined');
});
