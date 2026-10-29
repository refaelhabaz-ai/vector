// The site in a real browser, for the tests that need one (path.test.mjs, bagrut.test.mjs): Playwright with Chromium, a student written to storage, "today" pinned, and a wrapper for one scenario.
// It needs Playwright with Chromium; without them every scenario is skipped and the rest of the suite runs with no dependencies. This file holds no tests of its own.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export const SITE = pathToFileURL(here('../../index.html')).href;
const FIRST_PAGE = pathToFileURL(here('../README.md')).href; // any file: page is of the same origin as the site, and is where a student is written to storage

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* Playwright is not installed */ }
let browser = null, TODAY = null;
export const today = () => TODAY;

before(async () => {
  if (!chromium) return;
  try { browser = await chromium.launch(); } catch { return; } // no browser to launch
  // "today" is pinned to three weeks before the first psychometric registration of the table, so the official dates are ahead of it whatever year the table is for
  const page = await browser.newPage();
  try {
    await page.goto(SITE);
    const first = await page.evaluate(() => PSYD.map((z) => z.reg).filter(Boolean).sort()[0]);
    TODAY = addDays(first, -21);
  } finally { await page.close(); }
});
after(async () => { if (browser) await browser.close(); });

export const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// a CSS id selector for an id with characters in it
export const cssId = (id) => id.replace(/([^\w-])/g, '\\$1');

// ---- a student, as the site keeps one in the browser ----
export const rows = (o) => Object.entries(o).map(([k, [u, g]]) => ({ k, u, g }));
export const student = ({ d, i, scores, calc, stage = 'g12', psy }) => [
  ['kivun3.prof', JSON.stringify({ bag: 'full', psy: psy || (scores && scores.p ? 'has' : 'plan'), heb: 'he', stage, stageAt: Date.now() - 5e8 })],
  ...(scores ? [['kivun3.scores', JSON.stringify(scores)]] : []),
  ...(calc ? [['kivun3.calcRows', JSON.stringify(rows(calc))]] : []),
  ['kivun3.path', JSON.stringify({ v: 4, created: Date.now() - 20 * 864e5, targets: [{ id: 't1', d, i, auto: 0, marks: {}, goalP: 0, added: Date.now() - 20 * 864e5 }], active: 't1', d, i, auto: 0, marks: {}, goalP: 0, start: 0, dates: [], lab: null, sess: '', log: [], end: '', seen: '', story: '', qs: {}, qa: {}, sn: 1 })],
];

export async function visit(store, { w = 1280, h = 900, mobile = false } = {}) {
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

// one scenario: a student opens the road, fn(page) looks and acts, and the page must have reported no errors
export const scenario = (name, store, opts, fn) => test(name, async (t) => {
  if (!browser) return t.skip('Playwright with Chromium is not available');
  const v = await visit(store, opts);
  try { await fn(v.page, v); assert.deepEqual(v.errors, [], 'the page reported errors'); } finally { await v.ctx.close(); }
});
