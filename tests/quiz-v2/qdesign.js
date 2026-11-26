#!/usr/bin/env node
/* The questionnaire as a colour journey (start screen, the mood of each part, the three work days, the arrival before the results), in a browser at 1440 and 390,
   with long texts and with reduced motion.   Run: node tests/quiz-v2/qdesign.js */
require('./jrn-patch.js');
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const URL = 'file://' + path.join(__dirname, '..', '..', 'index.html');
const personas = JSON.parse(fs.readFileSync(path.join(__dirname, 'personas.json'), 'utf8'));
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + m); return c; };
const lum = rgb => { const [r, g, b] = rgb.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const contrastWhite = rgb => 1.05 / (lum(rgb) + .05);
const parse = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
async function setup(b, w, opt) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, ...(opt || {}) });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e)));
  await p.addInitScript(() => {
    try {
      localStorage.setItem('kivun3.jrn', JSON.stringify({ p: 1 }));
      localStorage.setItem('kivun3.seenProf', 'true');
      localStorage.setItem('kivun3.jnTip', '1');
      if (!localStorage.getItem('kivun3.prof')) localStorage.setItem('kivun3.prof', JSON.stringify({ bag: 'full', psy: 'plan', heb: 'he', reg: 'c', stage: 'g12' }));
    } catch (e) {}
  });
  await p.goto(URL + '#dir');
  await p.waitForTimeout(900);
  p.ctx = ctx;
  return p;
}
const noScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
(async () => {
  const b = await chromium.launch();
  const steps = Object.fromEntries(personas.noa.steps.map(s => [s.q, s]));
  for (const w of [1440, 390]) {
    console.log('== @' + w);
    const p = await setup(b, w);
    /* the start screen */
    const S0 = await p.evaluate(() => {
      const t = document.body.innerText;
      const app = getComputedStyle(document.getElementById('app'));
      const cs = getComputedStyle(document.documentElement);
      const card = document.querySelector('.qd-card');
      return {
        akin: /אקינייטור/.test(t), kick: /שאלון קצר/.test(t) || /בערך 4 דקות/.test(t),
        h1: (document.querySelector('.qi-h') || {}).textContent, line: [...document.querySelectorAll('.qi-l')].length,
        steps: [...document.querySelectorAll('.qi-steps li b')].map(x => x.textContent), svgs: document.querySelectorAll('.qi-steps svg').length,
        demo: card ? card.querySelector('.qd-q').textContent : '', bank: VQE.Q.X7 ? vqT(VQE.Q.X7.q) : '', opts: card ? card.querySelectorAll('.qd-o').length : 0,
        bg: app.backgroundImage, q1: cs.getPropertyValue('--q1').trim(), q2: cs.getPropertyValue('--q2').trim(), qs: document.documentElement.dataset.qs,
        go: (document.querySelector('.qi-go') || {}).textContent, quiet: (document.querySelector('.qi-q') || {}).textContent,
        shapes: document.querySelectorAll('.qd-intro i').length, goBg: getComputedStyle(document.querySelector('.qi-go')).backgroundColor, goCol: getComputedStyle(document.querySelector('.qi-go')).color,
        hdr: !!document.getElementById('hdr'), rail: document.querySelectorAll('.jr-o li').length,
        goRect: document.querySelector('.qi-go').getBoundingClientRect().bottom, vh: innerHeight
      };
    });
    ok(!S0.akin && !S0.kick, 'the "like Akinator" sentence and the "short questionnaire · about 4 minutes" label are gone');
    ok(S0.line === 1 && /4 דקות/.test(document_text_of(S0, 'line')) || S0.line === 1, 'exactly one short supporting line');
    ok(S0.steps.length === 3 && S0.svgs === 3 && S0.steps.join('|') === 'שאלות קצרות|שלושה ימי עבודה אמיתיים|הכיוון שלך + מסלול', 'three steps with drawings and the real captions: ' + S0.steps.join(' > '));
    ok(S0.demo && S0.demo === S0.bank && S0.opts === 3, 'the sample card shows a real question from the bank with three of its answers');
    ok(/gradient/.test(S0.bg) && S0.qs === 'intro', 'the start screen has a smooth gradient, not a flat colour');
    const c1 = parse(S0.q1), c2 = parse(S0.q2);
    ok(c1.length === 3 && c1[0] > 180 && c1[1] < 100 && c1[2] < 40, 'a deep macaw orange (' + S0.q1 + ')');
    ok(contrastWhite(c1) >= 4.5 && contrastWhite(c2) >= 4.5, `white text on the orange reaches 4.5:1 (${contrastWhite(c1).toFixed(2)} and ${contrastWhite(c2).toFixed(2)})`);
    ok(parse(S0.goBg).join() === '255,255,255' && contrastWhite(parse(S0.goCol)) >= 4.5, 'the start button is white with orange text, readable');
    ok(S0.shapes >= 3 && !!S0.quiet && S0.hdr && S0.rail === 5, 'organic shapes, the quiet line, the site header and the journey rail are all there');
    ok(w > 700 || S0.goRect < S0.vh, '@' + w + ': the start button is visible without scrolling (' + Math.round(S0.goRect) + ' of ' + S0.vh + ')');
    ok(await noScroll(p), 'no sideways scroll on the start screen');
    /* the rail is readable on colour */
    const rail = await p.evaluate(() => { const l = document.querySelector('.jr-o li:not(.cur):not(.done) .jr-l'); return l ? getComputedStyle(l).color : ''; });
    ok(!rail || parse(rail).join() === '255,255,255', 'the rail labels are white on the orange');
    /* answer through the questionnaire, watching the colour journey */
    await p.click('[data-vqstart]');
    await p.waitForTimeout(500);
    const seen = { q1: [], groups: new Set(), minC: 99, selOk: null, sw: true };
    let qn = 0, dayChecked = false, celeSeen = false;
    for (let g = 0; g < 40; g++) {
      const mode = await p.evaluate(() => VQU.mode);
      if (mode === 'res') break;
      await p.waitForTimeout(300);
      const th = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { q1: cs.getPropertyValue('--q1').trim(), q2: cs.getPropertyValue('--q2').trim(), g: document.documentElement.dataset.qg, qs: document.documentElement.dataset.qs }; });
      if (th.qs) { seen.q1.push(th.q1); seen.groups.add(th.g); seen.minC = Math.min(seen.minC, contrastWhite(parse(th.q1)), contrastWhite(parse(th.q2))); }
      if (!(await noScroll(p))) seen.sw = false;
      if (mode === 'trans') { await p.click('[data-vqcont]'); await p.waitForTimeout(150); continue; }
      const id = await p.evaluate(() => VQU.cur.id);
      if (id === 'DAY') {
        await p.mouse.move(2, 2);
        await p.waitForTimeout(1300);
        const D = await p.evaluate(() => { const cs = [...document.querySelectorAll('.vq-day')]; return { n: cs.length, da: cs.map(c => getComputedStyle(c).getPropertyValue('--da').trim()), q1: getComputedStyle(document.documentElement).getPropertyValue('--q1').trim() }; });
        ok(D.n === 3 && new Set(D.da).size === 3, 'the three day cards each have their own accent colour: ' + D.da.join(' '));
        await p.hover('.vq-day:nth-child(2)');
        await p.waitForTimeout(1300);
        const q1h = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--q1').trim());
        const dist = (x, y) => Math.hypot(...parse(x).map((v, i) => v - parse(y)[i]));
        ok(dist(q1h, D.q1) > 40, 'the background reacts when the pointer is on a day card (' + D.q1 + ' to ' + q1h + ')');
        const c = await p.$$('[data-vqday]');
        await c[1].click();
        await p.waitForTimeout(1300);
        const q1c = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--q1').trim());
        await p.mouse.move(5, 5);
        await p.waitForTimeout(1300);
        const q1k = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--q1').trim());
        ok(dist(q1k, D.q1) > 40, 'and it stays in the colour of the day I chose (' + q1k + ')');
        ok(await noScroll(p), 'no sideways scroll on the three work days');
        await p.click('[data-vqnext]');
        for (let k = 0; k < 8 && !celeSeen; k++) { celeSeen = await p.evaluate(() => !!document.getElementById('vqCele')); if (!celeSeen) await p.waitForTimeout(80); }
        dayChecked = true;
        continue;
      }
      /* the answer cards */
      if (qn === 3) {
        await p.hover('[data-vqo]');
        const first = await p.$('[data-vqo]');
        const s = steps[id];
        if (s && s.picks.length === 1) {
          await p.click(`[data-vqo="${s.picks[0]}"]`);
          await p.waitForTimeout(30);
          const sel = await p.evaluate(() => { const a = document.querySelector('.vq-o.vq-sel'); if (!a) return null; const af = getComputedStyle(a, '::after'); const cs = getComputedStyle(a); return { check: af.content, bg: cs.backgroundColor, bw: cs.borderTopWidth, anim: cs.animationName }; });
          seen.selOk = sel && /✓/.test(sel.check) && parse(sel.bg).join() !== '255,255,255' && parseFloat(sel.bw) >= 2;
          await p.waitForTimeout(600);
          qn++;
          continue;
        }
      }
      const s = steps[id];
      if (!s) { await p.click('[data-vqskip]'); await p.waitForTimeout(150); qn++; continue; }
      for (const pid of s.picks) { await p.click(`[data-vqo="${pid}"]`); await p.waitForTimeout(40); }
      const nb = await p.$('[data-vqnext]');
      if (nb && !(await nb.isDisabled())) await nb.click();
      await p.waitForTimeout(450);
      qn++;
    }
    ok(seen.q1.length > 8 && new Set(seen.q1).size >= 8, 'the colour shifts a little with every question (' + new Set(seen.q1).size + ' different colours over ' + seen.q1.length + ' screens)');
    const first = parse(seen.q1[0]), last = parse(seen.q1[seen.q1.length - 1]);
    ok(first[0] > first[2] + 80, 'it starts warm (orange-red)');
    ok(last[2] > last[0] + 30, 'and ends toward deep blue-violet (' + seen.q1[seen.q1.length - 1] + ')');
    ok(seen.groups.size >= 4, 'each part of the questionnaire has its own mood: ' + [...seen.groups].join(','));
    ok(seen.minC >= 4.5, 'white text keeps at least 4.5:1 on every colour of the journey (lowest ' + seen.minC.toFixed(2) + ')');
    ok(seen.selOk === true, 'a chosen answer shows a check, a tinted surface and a thicker border (not colour alone)');
    ok(seen.sw, 'no sideways scroll on any screen of the questionnaire');
    ok(dayChecked && celeSeen, 'a short celebration appears between the last answer and the results');
    await p.waitForTimeout(2200);
    const R = await p.evaluate(() => ({ mode: VQU.mode, cele: !!document.getElementById('vqCele'), qs: document.documentElement.dataset.qs, hero: !!document.querySelector('.rs-hero'), bg: getComputedStyle(document.documentElement).backgroundColor }));
    ok(R.mode === 'res' && !R.cele && !R.qs && R.hero, 'the celebration is gone and the results keep their own calm design');
    ok(p.errs.length === 0, 'no page errors ' + (p.errs[0] || ''));
    await p.ctx.close();
  }
  /* the questionnaire as the first step of the path (#path) has the same colours, and the line from Vekti above it is gone */
  for (const w of [1440, 390]) {
    const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', e => p.errs.push(String(e)));
    await p.addInitScript(() => { try { localStorage.setItem('kivun3.seenProf', 'true'); localStorage.setItem('kivun3.jnTip', '1'); } catch (e) {} });
    await p.goto(URL + '#path');
    await p.waitForTimeout(1200);
    const P2 = await p.evaluate(() => { const h = document.querySelector('.qi-h'); const app = getComputedStyle(document.getElementById('app')); return { qs: document.documentElement.dataset.qs, h: h ? getComputedStyle(h).color : '', bg: app.backgroundImage, say: document.querySelector('.jr-say') ? getComputedStyle(document.querySelector('.jr-say')).display : 'none', q1: getComputedStyle(document.documentElement).getPropertyValue('--q1').trim() }; });
    ok(P2.qs === 'intro' && /gradient/.test(P2.bg) && parse(P2.h).join() === '255,255,255', `@${w} #path: the start screen is orange with a white headline (not white on white)`);
    ok(contrastWhite(parse(P2.q1)) >= 4.5, `@${w} #path: the headline contrast is ${contrastWhite(parse(P2.q1)).toFixed(2)}:1`);
    ok(P2.say === 'none', `@${w}: the line from Vekti above the questionnaire is gone`);
    ok(await noScroll(p) && p.errs.length === 0, `@${w} #path: no sideways scroll, no page errors`);
    await ctx.close();
  }
  /* a started questionnaire: continue is primary, start again is secondary, in the same design */
  {
    const p = await setup(b, 1440);
    await p.evaluate(() => { vqLoad(); VQU.answers = [{ q: 'A1', picks: ['A1_1'] }]; VQU.done = 0; vqSave(); VQU.mode = 'intro'; vqPaint(); });
    await p.waitForTimeout(500);
    const T = await p.evaluate(() => ({ go: (document.querySelector('.qi-go') || {}).textContent, alt: (document.querySelector('.qi-alt') || {}).textContent, goAttr: !!document.querySelector('.qi-go[data-vqresume]'), altAttr: !!document.querySelector('.qi-alt[data-vqstart]') }));
    ok(T.goAttr && T.altAttr && /להמשיך מאיפה שעצרתי/.test(T.go) && /להתחיל מחדש/.test(T.alt), 'a started questionnaire: "continue where I stopped" is primary, "start again" secondary');
    await p.ctx.close();
  }
  /* long question and long answers at 390, and a phone with a wide font */
  {
    const p = await setup(b, 390);
    await p.click('[data-vqstart]');
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      const t = document.querySelector('.vq-qband .vq-t');
      t.textContent = 'כמה מהיום היית רוצה לבלות בשיחות ובעבודה ישירה עם אנשים שונים, כולל אנשים שאתה לא מכיר בכלל, ובאילו תנאים בדיוק היית מרגיש הכי נוח?';
      document.querySelectorAll('.vq-ot').forEach(o => { o.textContent = 'תשובה ארוכה מאוד שממשיכה ממשיכה ומתארת בפירוט רב מה שהאדם מרגיש ועושה בפועל ביום עבודה רגיל בלי שום קיצור'; });
    });
    ok(await noScroll(p), '@390: a long question and long answers do not scroll sideways');
    const fit = await p.evaluate(() => [...document.querySelectorAll('.vq-o')].every(o => { const r = o.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
    ok(fit, '@390: every answer card stays inside the screen');
    await p.ctx.close();
  }
  /* reduced motion: the colours stay, nothing loops or flies */
  for (const how of ['os', 'site']) {
    const p = await setup(b, 1440, how === 'os' ? { reducedMotion: 'reduce' } : {});
    if (how === 'site') { await p.evaluate(() => { document.documentElement.classList.add('rm'); }); }
    await p.waitForTimeout(300);
    const M = await p.evaluate(() => ({
      shape: getComputedStyle(document.querySelector('.qd i')).animationName, card: getComputedStyle(document.querySelector('.qd-card')).animationName,
      opt: getComputedStyle(document.querySelector('.qd-o1')).animationName, bg: /gradient/.test(getComputedStyle(document.getElementById('app')).backgroundImage), first: getComputedStyle(document.querySelector('.qd-o0')).borderTopColor }));
    ok(M.shape === 'none' && M.card === 'none' && M.opt === 'none', `reduced motion (${how}): the shapes, the card and the sample answers do not animate`);
    ok(M.bg, `reduced motion (${how}): the colour is still there`);
    await p.click('[data-vqstart]');
    await p.waitForTimeout(400);
    await p.click('[data-vqo]');
    await p.waitForTimeout(300);
    const nb2 = await p.$('[data-vqnext]');
    if (nb2 && !(await nb2.isDisabled())) await nb2.click();
    await p.waitForTimeout(600);
    ok(await p.evaluate(() => VQU.answers.length) >= 1 && (await p.evaluate(() => !document.getElementById('vqCele'))), `reduced motion (${how}): the questions still work`);
    await p.ctx.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
function document_text_of(o, k) { return String(o[k]); }
