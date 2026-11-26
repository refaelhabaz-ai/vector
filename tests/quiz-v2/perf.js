#!/usr/bin/env node
/* Scrolling stays on the browser's own fast path:
   - the site does not cancel wheel events (the old script-driven smooth scroll made the page stick whenever the main thread was busy),
   - a burst of wheel ticks costs almost no style or layout reads in the page's own scroll handlers,
   - the old smooth wheel can still be switched on on purpose (?smoothwheel=1).   Run: node tests/quiz-v2/perf.js */
require('./jrn-patch.js');
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', '..', 'index.html');
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + m); return c; };
(async () => {
  const b = await chromium.launch();
  for (const w of [1440, 390]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('kivun3.seenProf', 'true'); localStorage.setItem('kivun3.jnTip', '1'); } catch (e) {}
      window.__n = { gcs: 0, sh: 0, on: false };
      const gcs = window.getComputedStyle;
      window.getComputedStyle = function (...a) { if (window.__n.on) window.__n.gcs++; return gcs.apply(this, a); };
      const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
      Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get() { if (window.__n.on && this === document.documentElement) window.__n.sh++; return d.get.call(this); } });
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(URL + '#degrees');
    await p.waitForTimeout(1500);
    const prevented = await p.evaluate(() => {
      const e = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    });
    ok(prevented === false, `@${w}: wheel events are left to the browser (not cancelled)`);
    await p.evaluate(() => { window.__n.on = true; });
    for (let i = 0; i < 30; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(16); }
    await p.waitForTimeout(500);
    const n = await p.evaluate(() => { window.__n.on = false; return window.__n; });
    const y = await p.evaluate(() => window.scrollY);
    ok(y > 500 || w < 600, `@${w}: the page scrolls (${Math.round(y)}px)`);
    ok(n.gcs <= 4, `@${w}: a burst of 30 wheel ticks asks for ${n.gcs} computed styles (was about 60)`);
    ok(n.sh <= 8, `@${w}: and measures the page length ${n.sh} times (was about 180)`);
    ok(errs.length === 0, `@${w}: no page errors ${errs[0] || ''}`);
    await ctx.close();
  }
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const q = await ctx2.newPage();
  await q.goto(URL + '?smoothwheel=1#degrees');
  await q.waitForTimeout(1500);
  const on = await q.evaluate(() => {
    const e = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  });
  ok(on === true, 'the old smooth wheel can still be turned on (?smoothwheel=1)');
  await ctx2.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
