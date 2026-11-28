#!/usr/bin/env node
/* The full contrast audit of the questionnaire (see contrast-lib.js for what is measured and how).
     node tests/quiz-v2/contrast-audit.js                  all screens, the 6 gradient stops + 5 midpoints, 3 accents, all states, at 390 and 1280
     node tests/quiz-v2/contrast-audit.js --json out.json  also writes every violation to a file
     node tests/quiz-v2/contrast-audit.js --only guess,day  only some screen types
   Prints the violations grouped by screen type, state, kind, gradient point and accent. Exit code 1 if there is any.  */
require('./jrn-patch.js');
const { chromium } = require('playwright'), path = require('path'), fs = require('fs'), lib = require('./contrast-lib.js');
const URL = 'file://' + path.join(__dirname, '..', '..', 'index.html');
const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const by = (L, f) => { const m = {}; L.forEach(v => { const k = f(v); (m[k] = m[k] || []).push(v); }); return m; };
(async () => {
  const t0 = Date.now(), b = await chromium.launch();
  const rep = await lib.run(b, { url: URL, full: true, only: arg('--only') ? arg('--only').split(',') : null });
  await b.close();
  const V = rep.violations;
  /* one violation = one element in one configuration; the report counts distinct problems (element + kind + state) and keeps the worst ratio */
  const uniq = {}; V.forEach(v => { const k = [v.screen, v.w, v.type, v.where, v.el, v.text || '', v.state].join('|'); const u = uniq[k]; if (!u || v.ratio < u.ratio) uniq[k] = { ...v, configs: (u ? u.configs : 0) + 1 }; else u.configs++; });
  const U = Object.values(uniq);
  console.log(`screens swept: ${rep.screens.join(', ')}\nphotographs: ${rep.shots}, time ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`violations: ${V.length} (in ${U.length} distinct element/state/kind combinations)\n`);
  /* the tables count DISTINCT problems (an element failing in a state), so one bad rule is not counted a thousand times */
  const key = v => [v.screen, v.w, v.type, v.where, v.el, v.text || ''].join('|');
  const section = (title, f) => { console.log('== ' + title + '  (distinct failing elements)'); const m = {}; V.forEach(v => { const k = f(v); (m[k] = m[k] || new Set()).add(key(v) + '|' + v.state); }); Object.keys(m).sort((a, c) => m[c].size - m[a].size).forEach(k => console.log('  ' + String(m[k].size).padStart(5) + '  ' + k)); console.log(); };
  section('by kind', v => v.type);
  section('by screen type', v => v.screen);
  section('by state', v => v.state);
  section('by gradient point', v => String(v.point));
  section('by accent', v => v.group);
  section('by width', v => String(v.w));
  console.log('== the worst problems (distinct, worst ratio first)');
  U.sort((a, c) => (a.ratio / (a.need || 1)) - (c.ratio / (c.need || 1))).slice(0, 80).forEach(v =>
    console.log(`  ${v.screen.padEnd(7)} ${String(v.w).padEnd(4)} ${v.state.padEnd(15)} ${v.type.padEnd(22)} ${(v.where || '').padEnd(10)} ${(v.el || '').slice(0, 34).padEnd(34)} "${(v.text || '').slice(0, 16)}" ${v.ratio}:1 (need ${v.need}) ${v.fg ? v.fg + ' on ' + v.bg : ''} ${v.how ? '[' + v.how + ']' : ''} p=${v.point} g=${v.group} x${v.configs}`));
  const out = arg('--json'); if (out) fs.writeFileSync(out, JSON.stringify({ screens: rep.screens, shots: rep.shots, violations: V }, null, 1));
  process.exit(V.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
