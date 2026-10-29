// node --test tools/test/path.test.mjs
// The road and the calendar, in a real browser: what the mentor says about the gap and which moves it prices, what the calendar holds (the official dates and my own),
// and that the map is still the map. It needs Playwright with Chromium; without them every test here is skipped and the rest of the suite runs with no dependencies.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SITE = pathToFileURL(here('../../index.html')).href;
const FIRST_PAGE = pathToFileURL(here('../README.md')).href; // any file: page is of the same origin as the site, and is where a student is written to storage

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* Playwright is not installed */ }
let browser = null, TODAY = null;

before(async () => {
  if (!chromium) return;
  try { browser = await chromium.launch(); } catch { return; } // no browser to launch
  // "today" is pinned to three weeks before the first psychometric registration of the table, so the official dates are ahead of it whatever year the table is for
  const page = await browser.newPage();
  try {
    await page.goto(SITE);
    const first = await page.evaluate(() => PSYD.map((z) => z.reg).filter(Boolean).sort()[0]);
    const d = new Date(first + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 21);
    TODAY = d.toISOString().slice(0, 10);
  } finally { await page.close(); }
});
after(async () => { if (browser) await browser.close(); });

// ---- three students ----
const rows = (o) => Object.entries(o).map(([k, [u, g]]) => ({ k, u, g }));
const student = ({ d, i, scores, calc, stage = 'g12', psy }) => [
  ['kivun3.prof', JSON.stringify({ bag: 'full', psy: psy || (scores && scores.p ? 'has' : 'plan'), heb: 'he', stage, stageAt: Date.now() - 5e8 })],
  ...(scores ? [['kivun3.scores', JSON.stringify(scores)]] : []),
  ...(calc ? [['kivun3.calcRows', JSON.stringify(rows(calc))]] : []),
  ['kivun3.path', JSON.stringify({ v: 4, created: Date.now() - 20 * 864e5, targets: [{ id: 't1', d, i, auto: 0, marks: {}, goalP: 0, added: Date.now() - 20 * 864e5 }], active: 't1', d, i, auto: 0, marks: {}, goalP: 0, start: 0, dates: [], lab: null, sess: '', log: [], end: '', seen: '', story: '', qs: {}, qa: {}, sn: 1 })],
];
// medicine at Tel Aviv with a good psychometric and a high bagrut, and still a few dozen points below the threshold: a gap that can be closed
const GAP = student({ d: 'd172', i: 'tau', stage: 'g11', scores: { p: 690, b: 96, est: true }, calc: { math: [5, 93], eng: [5, 96], heb: [2, 95], hist: [2, 90], civ: [2, 98], lit: [2, 94], bible: [2, 92], phys: [5, 91], chem: [5, 94] } });
// computer science at Tel Aviv with a lower bagrut: even 800 in the psychometric does not reach the threshold, so the road goes through the bagrut first
const FAR = student({ d: 'd20', i: 'tau', scores: { p: 600, b: 90 }, calc: { math: [5, 88], eng: [4, 90], heb: [2, 86], hist: [2, 84], civ: [2, 90], lit: [2, 83], bible: [2, 85], phys: [3, 80] } });
// the same degree, strong numbers: above the threshold
const OK = student({ d: 'd20', i: 'tau', scores: { p: 760, b: 96 }, calc: { math: [5, 95], eng: [5, 96], heb: [2, 94], hist: [2, 92], civ: [2, 95], lit: [2, 93], bible: [2, 90], cs: [5, 97], phys: [5, 92] } });
// a goal and no numbers at all
const FRESH = student({ d: 'd20', i: 'huji', stage: 'svc', psy: 'plan' });

async function visit(store, { w = 1280, h = 900, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', acceptDownloads: true, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((t) => { window.__TODAY = t; }, TODAY);
  // the student is written to storage from a page of their own: an init script that touches storage can land on another storage area when the page is reloaded
  await page.goto(FIRST_PAGE);
  await page.evaluate((entries) => { for (const [k, v] of entries) localStorage.setItem(k, v); }, store);
  await page.goto(SITE + '#path');
  await page.waitForSelector('#mtPlanHost', { state: 'attached' });
  return { ctx, page, errors };
}
const scenario = (name, store, opts, fn) => test(name, async (t) => {
  if (!browser) return t.skip('Playwright with Chromium is not available');
  const v = await visit(store, opts);
  try { await fn(v.page, v); assert.deepEqual(v.errors, [], 'the page reported errors'); } finally { await v.ctx.close(); }
});
const openCalendar = async (page) => { await page.click('[data-ktab="cal"]'); await page.waitForSelector('#cuMain'); };

// ---- the mentor ----
scenario('below the threshold the mentor names the gap, and prices every bagrut move with the lab\'s own functions', GAP, {}, async (page) => {
  const m = await page.evaluate(() => {
    const pl = plan(), M = mtOf(pl), X = pl.X, t = { d: X.P.d, i: X.P.i }, base = psyNeed(t, X.rows, 0);
    return { st: M.st, gap: X.gap, moves: M.moves.map((x) => x.id),
      bag: mtBag(X).list.map((x) => ({ gain: x.gain, again: base - psyNeed(t, applyDiffs(X.rows, [x.df]), 0), finite: isFinite(base) && isFinite(psyNeed(t, applyDiffs(X.rows, [x.df]), 0)) })) };
  });
  assert.ok(['gap', 'far'].includes(m.st), 'the state is ' + m.st);
  assert.ok(m.gap > 0, 'the student really is below the threshold');
  assert.ok(m.moves.length > 0);
  const priced = m.bag.filter((b) => b.finite);
  assert.ok(priced.length > 0 && priced.every((b) => b.gain === b.again), 'a move is worth what the lab says it is worth');
  assert.deepEqual(await page.$$eval('#mtPlanHost .mv', (els) => els.map((e) => e.id)), m.moves.map((id) => 'mv-' + id), 'the page shows the moves of the model, in its order');
  assert.ok(await page.$('.mt-b .mt-g'), 'a gauge with the score and the threshold');
});

scenario('a move with a date puts exactly that date in the calendar, once, and the card then says it is there', GAP, {}, async (page) => {
  const id = await page.$eval('#mtPlanHost .mv-add', (b) => b.dataset.kmt.split(':')[1]);
  await page.click(`[data-kmt="add:${id}"]`);
  await page.waitForSelector(`#mv-${CSS_ID(id)} .mv-have`);
  const added = await page.evaluate(() => pth().dates.filter((x) => x.id.startsWith('my-bst-')).map((x) => ({ id: x.id, d: x.d, src: x.src })));
  assert.ok(added.length >= 1);
  const known = new Set(await page.evaluate(() => [...PSYD.flatMap((z) => [z.reg, z.d, z.d2]), ...BAGD.flatMap((b) => [b[2], b[4]])].filter(Boolean)));
  for (const a of added) { assert.equal(a.src, 'lab'); assert.ok(known.has(a.d), `${a.d} is not a date of the official tables`); }
  if (await page.$('[data-kmt="all"]')) await page.click('[data-kmt="all"]'); // every other date as well: the ones already there are not added twice
  const ids = await page.evaluate(() => pth().dates.map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length, 'adding again never makes a second copy');
  assert.ok(ids.filter((x) => x.startsWith('my-bst-')).length >= added.length);
});

scenario('the mentor never promises, and says that the numbers are a direction', GAP, {}, async (page) => {
  const text = await page.$$eval('.mt-b, #mtPlanHost', (els) => els.map((e) => e.textContent).join(' '));
  for (const w of ['סיכוי', 'מובטח', 'בטוח שתתקבל', 'תתקבל', 'undefined', 'NaN', 'null']) assert.ok(!text.includes(w), `"${w}" is in the mentor's words`);
  assert.match(text, /לא הבטחה/);
});

scenario('when even 800 does not reach the threshold the road goes through the bagrut first, and the psychometric comes last', FAR, {}, async (page) => {
  const m = await page.evaluate(() => { const M = mtOf(plan()); return { st: M.st, kinds: M.moves.map((x) => x.k) }; });
  assert.equal(m.st, 'far');
  assert.ok(m.kinds.length > 0 && m.kinds[0] !== 'psy', 'the first move is not the psychometric');
  if (m.kinds.includes('psy')) assert.equal(m.kinds[m.kinds.length - 1], 'psy');
});

scenario('above the threshold the mentor says so, and turns to what is left to close', OK, {}, async (page) => {
  const m = await page.evaluate(() => { const M = mtOf(plan()); return { st: M.st, moves: M.moves.map((x) => x.k) }; });
  assert.equal(m.st, 'ok');
  assert.ok(m.moves.every((k) => k === 'task'), 'what is left are steps of the road');
});

scenario('with no numbers yet the mentor asks for an estimate, and offers no plan', FRESH, {}, async (page) => {
  const m = await page.evaluate(() => { const M = mtOf(plan()); return { st: M.st, plan: M.plan, cta: M.cta && M.cta.attr }; });
  assert.equal(m.st, 'start'); assert.equal(m.plan, false); assert.equal(m.cta, 'data-kgo="lab"');
  assert.equal(await page.$('#mtPlan'), null);
});

// ---- the calendar ----
scenario('the calendar holds the official psychometric and bagrut dates, with the day the registration closes', GAP, {}, async (page) => {
  await openCalendar(page);
  await page.click('[data-cu="ly:psy"]');
  const psy = await page.$$eval('#cuMain .cu-c', (els) => els.map((e) => [e.classList.contains('psy'), e.classList.contains('reg'), e.textContent]));
  assert.ok(psy.some(([p]) => p), 'an exam of the psychometric');
  assert.ok(psy.some(([, r, t]) => r && /ההרשמה/.test(t)), 'the closing of its registration');
  await page.click('[data-cu="ly:bag"]');
  const bag = await page.$$eval('#cuMain .cu-c', (els) => els.map((e) => e.classList.contains('bag')));
  assert.ok(bag.length > 0 && bag.every(Boolean), 'the bagrut layer holds only bagrut');
  await page.click('[data-cu="more"]');
  assert.ok((await page.$$('#cuMain .cu-c.bag')).length > 8, 'every sitting of the schedule is there');
  assert.ok(await page.$('#cuMain .cu-c.bag .ft-chip'), 'the draft schedule says what it is');
});

scenario('a weekly study session is saved with its time and length, and a student who comes back finds it', GAP, {}, async (page, { ctx }) => {
  await openCalendar(page);
  await page.click('.cu-top [data-cu="add:|"]');
  await page.waitForSelector('#cuForm');
  await page.click('.cu-kk.study');
  await page.fill('#cuT', 'תרגול כמותי');
  await page.fill('#cuD', '2026-11-15');
  await page.fill('#cuTm', '16:30');
  await page.click('.cu-lc:has(input[value="90"])');
  await page.check('#cuRp');
  await page.click('#cuForm button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('#ov'));
  const mine = await page.evaluate(() => pth().dates.filter((x) => x.t === 'תרגול כמותי'));
  assert.equal(mine.length, 4, 'four weeks');
  assert.deepEqual(mine.map((x) => x.d), ['2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06']);
  assert.ok(mine.every((x) => x.kind === 'study' && x.tm === '16:30' && x.len === 90 && x.grp && x.grp === mine[0].grp), 'one series');
  // the file for the calendar app: a floating local time, the end from the length, a reminder half an hour before
  const ics = await page.evaluate(() => icsFile(null, calMineAll()));
  assert.match(ics, /DTSTART:20261115T163000/); assert.match(ics, /DTEND:20261115T180000/); assert.match(ics, /TRIGGER:-PT30M/);
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'lines are folded at 75 octets');
  // coming back later: the same storage, a new tab
  const store = await page.evaluate(() => Object.entries(localStorage));
  const back = await visit(store);
  try {
    await openCalendar(back.page);
    await back.page.click('[data-cu="ly:mine"]');
    const titles = await back.page.$$eval('#cuMain .cu-c', (els) => els.map((e) => e.textContent));
    assert.ok(titles.some((t) => t.includes('תרגול כמותי')), 'the session is in the calendar of the returning student');
    assert.deepEqual(back.errors, []);
  } finally { await back.ctx.close(); }
  void ctx;
});

scenario('my own task can be ticked, taken back, deleted and brought back with "undo"', GAP, {}, async (page) => {
  await page.evaluate(() => { const P = pth(); P.dates.push({ id: 'my-t1', t: 'לברר על מלגה', d: isoD(new Date(today0().getTime() + 5 * 864e5)), kind: 'task' }); pthSave(); PLC = null; });
  await openCalendar(page);
  await page.click('[data-cu="ly:mine"]');
  await page.click('[data-cu="done:my-t1"]');
  await page.waitForFunction(() => !!pth().dates.find((x) => x.id === 'my-t1').done);
  await page.waitForSelector('.cu-dn'); // the ticked card glides into the drawer of what is done
  await page.evaluate(() => { document.querySelector('.cu-dn').open = true; });
  await page.click('.cu-dn [data-cu="done:my-t1"]');
  await page.waitForFunction(() => !pth().dates.find((x) => x.id === 'my-t1').done);
  await page.evaluate(() => { KC.open.add('my-t1'); cuRepaint(); });
  await page.click('[data-cu="del:my-t1"]');
  await page.waitForFunction(() => !pth().dates.some((x) => x.id === 'my-t1'));
  await page.click('#toast .toast-a');
  await page.waitForFunction(() => pth().dates.some((x) => x.id === 'my-t1'));
});

// ---- phones, and the map ----
for (const tab of ['now', 'cal']) {
  scenario(`on a phone the ${tab === 'cal' ? 'calendar' : 'road'} never scrolls sideways`, GAP, { w: 360, h: 740, mobile: true }, async (page) => {
    await page.click(`[data-ktab="${tab}"]`);
    await page.waitForSelector(tab === 'cal' ? '#cuMain' : '#mtPlanHost');
    if (tab === 'cal') await page.evaluate(() => { KC.f = 'all'; KC.more = true; cuRepaint(); });
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert.ok(w.sw <= w.iw, `the page is ${w.sw}px wide in a ${w.iw}px window`);
  });
}

scenario('the map is where it was: a gate for every stage, the next stop marked, and a stop still opens its step', GAP, {}, async (page) => {
  await page.waitForSelector('#kpJ .tr');
  const m = await page.evaluate(() => ({ gates: document.querySelectorAll('#kpJ [data-kgate]').length, zones: plan().zones.length, next: document.querySelectorAll('#kpJ [aria-current="step"]').length }));
  assert.equal(m.gates, m.zones); assert.equal(m.next, 1);
  const stop = await page.$('#kpJ [data-kstop]');
  assert.ok(stop, 'a stop on the map');
  await stop.click();
  assert.equal(await stop.getAttribute('aria-pressed'), 'true');
  assert.ok(await page.$('#jnFsBtn'), 'the full-screen map');
});

// a CSS id selector for an id with characters in it
function CSS_ID(id) { return id.replace(/([^\w-])/g, '\\$1'); }
