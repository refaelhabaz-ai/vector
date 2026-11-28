#!/usr/bin/env node
/* Contact sheets of the questionnaire: every screen type x three points of the colour journey (start, middle, end) x default / one answer selected,
   at 390 and 1280, written as PNG files (one per screen type and width) so that before and after can be compared by eye.
     node tests/quiz-v2/contrast-sheets.js OUT_DIR [--shots-only]      */
require('./jrn-patch.js');
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const URL = 'file://' + path.join(__dirname, '..', '..', 'index.html'), OUT = process.argv[2];
if (!OUT) { console.log('usage: contrast-sheets.js OUT_DIR'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const PTS = [[0, 'a'], [.45, 'c'], [1, 'b']];
(async () => {
  const b = await chromium.launch();
  for (const w of [390, 1280]) {
    const cx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 }), p = await cx.newPage();
    await p.addInitScript(() => { try { localStorage.setItem('kivun3.jrn', JSON.stringify({ p: 1 })); localStorage.setItem('kivun3.seenProf', 'true'); localStorage.setItem('kivun3.jnTip', '1'); localStorage.setItem('kivun3.prof', JSON.stringify({ bag: 'full', psy: 'has', heb: 'he', reg: 'c', stage: 'g12' })); localStorage.setItem('kivun3.scores', JSON.stringify({ b: 92, p: 640 })); } catch (e) {} });
    await p.goto(URL + '#dir'); await p.waitForTimeout(800);
    const seen = new Set(), files = {};
    for (let i = 0; i < 70; i++) {
      const info = await p.evaluate(() => { const de = document.documentElement, o = document.querySelector('.vq-opts'); return { qs: de.dataset.qs, fmt: o ? (o.className.split(/\s+/)[1] || '') : '' }; });
      const scr = info.qs === 'intro' ? 'intro' : info.qs === 'trans' ? 'trans' : info.qs === 'day' ? 'day' : info.qs === 'guess' ? 'guess' : info.fmt;
      if (scr && info.qs && !seen.has(scr)) {
        seen.add(scr); files[scr] = [];
        await p.evaluate(() => { const s = document.createElement('style'); s.textContent = '.vb-tip{display:none!important}*{transition:none!important;animation:none!important}'; document.head.appendChild(s); });
        for (const sel of scr === 'intro' || scr === 'trans' ? [false] : [false, true]) for (const [pt, g] of PTS) {
          if (scr !== 'intro') await p.evaluate(([pt, g]) => { const de = document.documentElement; de.dataset.qg = g; de.style.setProperty('--qb1', qsCol(pt)); de.style.setProperty('--qb2', qsCol(Math.min(1, pt + .2))); }, [pt, g]);
          await p.evaluate(sel => { document.querySelectorAll('.vq-sel').forEach(e => e.classList.remove('vq-sel')); if (sel) document.querySelectorAll('.vq-o,.vq-day').forEach((e, k) => { if (k < 2) e.classList.add('vq-sel'); }); }, sel);
          await p.mouse.move(2, 2); await p.waitForTimeout(120);
          const f = `${w}-${scr}-p${Math.round(pt * 100)}${sel ? '-selected' : ''}.png`; await p.screenshot({ path: path.join(OUT, f) }); files[scr].push([f, `${scr} · ${pt === 0 ? 'start' : pt === 1 ? 'end' : 'middle'} · ${sel ? 'selected' : 'default'}`]);
        }
      }
      if (!info.qs) break;
      const adv = await p.evaluate(() => { const c = document.querySelector('[data-vqstart],[data-vqcont],[data-vqresume]'); if (c) { c.click(); return 'c'; } const x = document.querySelector('.vq-o:not(.vq-sel),.vq-day'); if (x) x.click(); const nx = document.querySelector('[data-vqnext]:not([disabled]),[data-vqres]'); if (nx) { nx.click(); return 'n'; } return x ? 'o' : '-'; });
      await p.waitForTimeout(adv === '-' ? 100 : 420);
    }
    await cx.close();
    /* one sheet per screen type: the images side by side (three points, then the same three with answers selected) */
    const sp = await b.newPage({ viewport: { width: 1600, height: 100 } });
    for (const [scr, L] of Object.entries(files)) {
      const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#222;font:14px sans-serif;color:#fff}.g{display:flex;flex-wrap:wrap;gap:8px;padding:8px}figure{margin:0}img{width:${w < 500 ? 390 : 620}px;display:block}figcaption{padding:3px}</style><div class=g>${L.map(([f, c]) => `<figure><img src="${f}"><figcaption>${w}px · ${c}</figcaption></figure>`).join('')}</div>`;
      fs.writeFileSync(path.join(OUT, `sheet-${w}-${scr}.html`), html);
      await sp.goto('file://' + path.join(OUT, `sheet-${w}-${scr}.html`)); await sp.waitForTimeout(200); await sp.screenshot({ path: path.join(OUT, `sheet-${w}-${scr}.png`), fullPage: true });
    }
    await sp.close();
  }
  await b.close(); console.log('sheets written to ' + OUT);
})().catch(e => { console.error(e); process.exit(2); });
