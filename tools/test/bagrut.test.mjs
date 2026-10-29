// node --test tools/test/bagrut.test.mjs
// What the road says about the bagrut, in a real browser. The rule behind all of it: a subject that is not entered is not a subject that is missing. Only a number the student entered that
// contradicts what a program asks is a gap, and only a gap is offered a way to close it (with the official rules, the sittings and the registration). A plain average is not turned into a
// verdict where the institution's bonuses decide, and the official tables of dates are well formed.
// It needs Playwright with Chromium; without them every test here is skipped and the rest of the suite runs with no dependencies.
import assert from 'node:assert/strict';
import { scenario, student } from './site.mjs';

// ---- students ----
// Applied Mathematics at HIT: a program that publishes a level for maths (5 units at 70 or more, or 4 units at 80 or more) and has no formula
const HIT = { d: 'd168', i: 'i41' };
const REST = { eng: [5, 95], heb: [2, 90], hist: [2, 85], civ: [2, 90], lit: [2, 88], bible: [2, 92], phys: [5, 90] };
// the report that started this: a full certificate, 5 units of maths at 100, and the road wrote that maths was missing, and a lot more
const ALL = student({ ...HIT, scores: { p: 690 }, calc: { math: [5, 100], ...REST } });                    // every subject entered
const ONE = student({ ...HIT, scores: { p: 690 }, calc: { math: [5, 100] } });                             // only maths entered
const PROFILE = student({ ...HIT, scores: { p: 690, b: 98, reali: true } });                               // only the profile: a full certificate, 5 units of maths
const NOTHING = student({ ...HIT });                                                                       // a goal and no numbers
// maths contradicts the program: 4 units at 75
const LOW = student({ ...HIT, scores: { p: 690 }, calc: { math: [4, 75], eng: [4, 88], heb: [2, 90], hist: [2, 85], civ: [2, 90], lit: [2, 88], bible: [2, 92] } });
// computer science at Tel Aviv: a formula that adds bonuses for extended subjects, so an average without the subjects is only "at least"
const TAU = { d: 'd20', i: 'tau' };
const AVG = student({ ...TAU, scores: { p: 700, b: 96 } });                                                // a plain average, no subjects
const PART = student({ ...TAU, scores: { p: 700 }, calc: { math: [5, 100] } });                            // 5 units entered, 20 are needed
const FULL = student({ ...TAU, scores: { p: 700 }, calc: { math: [5, 100], ...REST } });                   // 25 units entered
// computer science at the Tel Aviv-Yafo college: it publishes levels of maths, but by route, and none of them was curated
const TAYC = student({ d: 'd20', i: 'i34', scores: { p: 700 }, calc: { math: [5, 100], ...REST } });
const NO_PSY = student({ ...TAU, psy: 'no', scores: { b: 92 }, calc: { math: [5, 95], eng: [4, 90], heb: [2, 90], hist: [2, 85], civ: [2, 90], lit: [2, 88], bible: [2, 92], other: [5, 88] } });

// the words of a claim that something is missing (the lab's own name, "how much am I missing?", is not one)
const SAYS_MISSING = /עוד לא מספיק|צריך להשלים|דרישות? בתוכנית עוד לא מתקיימ|חסרה בגרות|חסרות בגרויות|חסר מקצוע|חסרים מקצועות/;
const pageText = (page) => page.evaluate(() => document.body.innerText);

// ---- not entered is not missing ----
for (const [what, store, unknown] of [['every subject entered', ALL, 0], ['only maths entered', ONE, 0], ['only the profile (a full certificate, 5 units of maths)', PROFILE, 1], ['no numbers at all', NOTHING, 1]]) {
  scenario(`${what}: nothing is said to be missing, and the road does not offer to complete a certificate`, store, {}, async (page) => {
    const m = await page.evaluate(() => { const pl = plan(), bs = bagStatus(pl.X); return { gaps: bs.gaps.length, unk: bs.unk.length, cert: bs.F.cert, need: bagOf(pl).filter((c) => c.kind === 'need').length }; });
    assert.equal(m.gaps, 0); assert.equal(m.need, 0, 'no subject of the planner is marked as not enough'); assert.equal(m.cert, 'yes'); assert.equal(m.unk, unknown);
    await page.evaluate(() => focusOn('bagCore'));
    assert.doesNotMatch(await pageText(page), SAYS_MISSING, 'the road says that something is missing');
    assert.equal(await page.$('#bgHow'), null, 'no guide to completing a certificate: nothing is missing');
    await page.click('[data-ktab="cal"]');
    await page.waitForSelector('#cuMain');
    assert.equal(await page.$('#cuBag'), null, 'and no drawer of bagrut moves in the calendar');
    assert.doesNotMatch(await pageText(page), SAYS_MISSING);
  });
}

scenario('a student who entered everything gets the step done, and a student who entered only maths is asked for the rest and not blamed', ALL, {}, async (page) => {
  const m = await page.evaluate(() => { const bs = bagStatus(plan().X); return { done: bs.done, s: bs.s }; });
  assert.equal(m.done, true); assert.match(m.s, /הדרישות מתקיימות/);
});
scenario('one subject entered: the requirement is met, and the status says what is left to enter', ONE, {}, async (page) => {
  const m = await page.evaluate(() => { const bs = bagStatus(plan().X); return { done: bs.done, enter: bs.enter, s: bs.s }; });
  assert.equal(m.done, true); assert.equal(m.enter.length, 1); assert.match(m.enter[0], /5 יחידות/); assert.match(m.enter[0], /20/);
});
scenario('only the profile: the grade of the maths is the one thing that is asked for, and nothing is claimed about it', PROFILE, {}, async (page) => {
  const m = await page.evaluate(() => { const bs = bagStatus(plan().X); return { done: bs.done, s: bs.s, unk: bs.unk.map((c) => c.k) }; });
  assert.equal(m.done, false); assert.deepEqual(m.unk, ['math']); assert.match(m.s, /לבדוק: מתמטיקה/);
});

// ---- a gap: a number that contradicts the program ----
scenario('maths at 4 units and 75, where the program asks 4 at 80 or 5 at 70: one gap, named, with ways to close it, the dates, and the guide', LOW, {}, async (page) => {
  const g = await page.evaluate(() => bagStatus(plan().X).gaps.map((c) => ({ k: c.k, u: c.h.u, g: c.h.g, ways: bagWays(c).map((w) => w.txt) })));
  assert.equal(g.length, 1); assert.deepEqual([g[0].k, g[0].u, g[0].g], ['math', 4, 75]);
  assert.ok(g[0].ways.some((w) => /מ-75 ל-80/.test(w)), 'a better grade at the level the student has');
  assert.ok(g[0].ways.some((w) => /5 יח"ל, בציון 70/.test(w)), 'or the level above');
  await page.evaluate(() => focusOn('bagCore'));
  const text = await pageText(page);
  assert.match(text, /עוד לא מספיק/); assert.match(text, /מ-75 ל-80/);
  assert.match(text, /מכינה במתמטיקה בציון 80 ומעלה/, 'and what the program itself writes for whoever does not meet it');
  // the planner card: sittings that are rows of the official schedule, never one made up
  const sits = await page.$$eval('#kpBag .bg-c.need .bg-t', (bs) => bs.map((b) => b.dataset.kbag));
  const known = await page.evaluate(() => BAGD.map((b) => bagEv(b).id));
  assert.ok(sits.length > 0 && sits.every((id) => known.includes(id)), 'the sittings come from the official table');
  // the guide: closed, sourced, with the rules, the registration and what is held in each sitting
  assert.equal(await page.$eval('#bgHow', (e) => e.open), false, 'it starts closed');
  const guide = await page.$eval('#bgHow', (e) => e.textContent);
  for (const w of ['תעודת בגרות', 'איך נרשמים', 'מועד ב', 'שיפור ציון', 'אקסטרני']) assert.ok(guide.includes(w), `the guide says "${w}"`);
  const links = await page.$$eval('#bgHow a', (as) => as.map((a) => a.href));
  assert.ok(links.length >= 2 && links.every((h) => /^https:\/\/[a-z.]*\.gov\.il\//.test(h)), 'its links are official: ' + links.join(' '));
  assert.ok((await page.$$('#bgHow .ft-chip')).length >= 5, 'each rule carries the status of its source');
});

scenario('the plan shows the sittings, and the calendar stays empty until the student marks one: marked once it is there, marked again it is gone', LOW, {}, async (page) => {
  await page.evaluate(() => focusOn('bagCore'));
  assert.deepEqual(await page.evaluate(() => (pth().pick || []).length + pth().dates.length), 0);
  const id = await page.$eval('#kpBag .bg-c.need .bg-t', (b) => b.dataset.kbag);
  await page.click('[data-ktab="cal"]');
  await page.waitForSelector('#cuMain');
  assert.equal(await page.evaluate(() => cuItems(plan()).length), 0, 'a gap with a plan is still an empty calendar');
  assert.ok(await page.$('#cuBag'), 'the plan waits in its drawer');
  await page.evaluate(() => { document.querySelector('#cuBag').open = true; });
  await page.click(`#cuBag [data-kbag="${id}"]`);
  await page.waitForFunction((x) => pth().pick.includes(x), id);
  assert.deepEqual(await page.evaluate(() => cuItems(plan()).map((x) => x.id)), [id], 'exactly that sitting');
  assert.equal(await page.$eval('#cuBag', (e) => e.open), true, 'the drawer stays open: the student may want to mark another sitting');
  await page.click(`#cuBag [data-kbag="${id}"]`);
  await page.waitForFunction((x) => !pth().pick.includes(x), id);
  assert.equal(await page.evaluate(() => cuItems(plan()).length), 0);
});

scenario('the guide stays open when a sitting is marked in the step, and the mark is a pick of the calendar', LOW, {}, async (page) => {
  await page.evaluate(() => focusOn('bagCore'));
  await page.evaluate(() => { document.querySelector('#bgHow').open = true; });
  const id = await page.$eval('#kpBag .bg-c.need .bg-t', (b) => b.dataset.kbag);
  await page.click(`#kpBag [data-kbag="${id}"]`);
  await page.waitForFunction((x) => pth().pick.includes(x), id);
  assert.equal(await page.$eval('#bgHow', (e) => e.open), true, 'the guide the student was reading is still open');
  assert.equal(await page.$eval(`#kpBag [data-kbag="${id}"]`, (e) => e.getAttribute('aria-pressed')), 'true', 'and the sitting says that it is in the calendar');
});

// ---- a program for which no level requirement was collected: nothing was checked, and nothing is said to be met ----
scenario('with no level requirement collected the step does not say that the requirements are met, says what is true, and is closed only by the student', FULL, {}, async (page) => {
  const m = await page.evaluate(() => { const bs = bagStatus(plan().X); return { cur: bs.cur, done: bs.done, s: bs.s, lines: bs.ul.length }; });
  assert.deepEqual([m.cur, m.done, m.lines], [0, false, 0]); assert.doesNotMatch(m.s, /הדרישות מתקיימות/);
  await page.evaluate(() => focusOn('bagCore'));
  const text = await pageText(page);
  assert.match(text, /לא מופיעה דרישת רמה/); assert.doesNotMatch(text, SAYS_MISSING);
  assert.ok(await page.$('#kpTab a[href^="https://"][rel~="noopener"]'), 'a link to the conditions on the institution\'s site');
  await page.click('[data-kmark="bagCore"]');
  await page.waitForFunction(() => plan().tasks.find((t) => t.id === 'bagCore').done === true);
});
scenario('levels that depend on the route are listed as published, not checked, and not called met', TAYC, {}, async (page) => {
  const m = await page.evaluate(() => { const bs = bagStatus(plan().X); return { cur: bs.cur, done: bs.done, s: bs.s, lines: bs.ul }; });
  assert.deepEqual([m.cur, m.done], [0, false]); assert.match(m.s, /תלויות במסלול/); assert.ok(m.lines.length >= 2 && m.lines.every((l) => /יח|יחידות/.test(l)));
  await page.evaluate(() => focusOn('bagCore'));
  const text = await pageText(page);
  assert.match(text, /תלויות במסלול הקבלה/); assert.ok(m.lines.every((l) => text.includes(l.slice(0, 40))), 'the lines are shown as the institution published them');
  assert.doesNotMatch(text, SAYS_MISSING);
});

// ---- the check itself ----
scenario('a requirement is met at its boundary and not one point or one level below, and a subject that is not entered is unknown, never missing', NOTHING, {}, async (page) => {
  const r = await page.evaluate(() => {
    const req = { k: 'math', alts: [[4, 80], [5, 70]], l: [] }, any = { k: 'math', alts: [[4, 0], [5, 0]], l: [] }, sci = { ks: ['phys', 'chem', 'bio', 'cs'], alts: [[4, 0]], l: [] };
    const have = (u, g, o) => ({ have: () => (u ? { u, g, from: 'rows', ...o } : null) });
    const prof = { have: () => ({ u: 5, g: 55, low: true, from: 'profile' }) }; // the profile knows 5 units at 55 or more, and no more
    return { at: [[4, 80], [4, 79], [5, 70], [5, 69], [3, 100], [5, 100]].map(([u, g]) => bagCheck(req, have(u, g)).st), none: bagCheck(req, have(0)).st,
      profileHigh: bagCheck(req, prof).st, profileAny: bagCheck(any, prof).st, anyPass: [bagCheck(any, have(4, 55)).st, bagCheck(any, have(4, 54)).st, bagCheck(any, have(3, 100)).st],
      sci: [bagCheck(sci, { have: (k) => (k === 'chem' ? { u: 5, g: 80, from: 'rows' } : null) }).st, bagCheck(sci, { have: (k) => (k === 'bio' ? { u: 3, g: 90, from: 'rows' } : null) }).st] };
  });
  assert.deepEqual(r.at, ['yes', 'no', 'yes', 'no', 'no', 'yes']);
  assert.equal(r.none, 'unk', 'not entered is unknown');
  assert.equal(r.profileHigh, 'unk', 'the profile cannot tell if 5 units were passed with 70');
  assert.equal(r.profileAny, 'yes', 'but it can tell that 5 units were passed at all');
  assert.deepEqual(r.anyPass, ['yes', 'no', 'no'], 'a pass is 55, and the units count');
  assert.deepEqual(r.sci, ['yes', 'no'], 'any one of several subjects will do');
});

scenario('the curated requirements are lines of the programs\' own published text, and top marks never contradict one', NOTHING, {}, async (page) => {
  const r = await page.evaluate(() => {
    const bad = [], keys = Object.keys(REQ_BAG), top = { have: () => ({ u: 5, g: 100, from: 'rows' }) }, none = { have: () => null };
    for (const key of keys) {
      const [did, iid] = key.split('@'), d = BY[did], lines = d ? progLines(iid, d) : null;
      if (!d || !lines) { bad.push(`${key}: the program or its text is not in the data`); continue; }
      for (const r of REQ_BAG[key]) {
        for (const l of r.l) if (!lines.some((x) => x.includes(l))) bad.push(`${key}: a line that is not in the program: ${l.slice(0, 60)}`);
        for (const [u, g] of r.alts) if (![3, 4, 5].includes(u) || !(g >= 0 && g <= 100)) bad.push(`${key}: an odd alternative ${u}/${g}`);
        if (bagCheck(r, top).st !== 'yes') bad.push(`${key}: top marks do not meet ${r.n || r.k}`);
        if (bagCheck(r, none).st !== 'unk') bad.push(`${key}: nothing entered is not unknown`);
      }
    }
    return { n: keys.length, bad };
  });
  assert.ok(r.n >= 20, 'the curated entries are there');
  assert.deepEqual(r.bad, []);
});

// ---- the average: a plain one is only "at least", and units are counted ----
for (const [what, store, st, key, wants] of [
  ['a plain average and no subjects', AVG, 'plain', 'plain', /ממוצע רגיל/],
  ['5 units entered, 20 needed', PART, 'units', 'part', /20/],
  ['no psychometric, by choice', NO_PSY, 'nopsy', 'nopsy', /בלי פסיכומטרי/],
  ['every subject entered', FULL, 'ok', 'ok', /מעל הסף/],
]) {
  scenario(`the mentor, with ${what}, is in the state "${st}", and a number that was not computed is not shown as a gap`, store, {}, async (page) => {
    const m = await page.evaluate(() => { const pl = plan(), M = mtOf(pl), V = pl.X.V; return { st: M.st, plan: M.plan, basis: V.basis, ok: V.ok, stand: pl.stand.k, say: `${M.h} ${pl.stand.s}` }; });
    assert.equal(m.st, st); assert.equal(m.stand, key);
    assert.match(m.say, wants);
    if (st !== 'ok') assert.equal(m.plan, false, 'no plan is priced on a number that is not computed');
    if (st === 'plain') assert.deepEqual([m.basis, m.ok], ['plain', null], 'a plain average below the threshold is not a "no": a bonus could close it');
    if (st === 'units') assert.equal(m.basis, 'part');
    if (st === 'ok') assert.deepEqual([m.basis, m.ok], ['full', true]);
    const side = await page.$eval('.kp-side', (e) => e.innerText);
    if (st !== 'ok') assert.doesNotMatch(side, /חסר(ות)? \d+ נקודות|מתחת לסף/, 'the mentor names no gap in points');
  });
}
scenario('with no psychometric by choice, no step asks for one, and the lists do not price a gap in points', NO_PSY, {}, async (page) => {
  const m = await page.evaluate(() => { const pl = plan(), ids = pl.tasks.map((t) => t.id); return { noPsy: pl.X.noPsy, ask: ids.filter((id) => /^psy/i.test(id) && id !== 'psyNo'), has: ids.includes('psyNo'), n: ids.length }; });
  assert.ok(m.n > 5, 'the road has its steps'); assert.equal(m.noPsy, true); assert.deepEqual(m.ask, [], 'no step to register for or practise the psychometric'); assert.equal(m.has, true, 'one step says what the decision means');
  for (const tab of ['now', 'prog', 'opt']) {
    await page.click(`[data-ktab="${tab}"]`);
    assert.doesNotMatch(await pageText(page), /\b736\b|חסרות \d+ נקודות בפסיכומטרי/, `the ${tab} tab names a gap in the psychometric`);
  }
});

// ---- the bonus rules of the universities, as their own pages publish them (checked on 29.10.2026) ----
// The tables below are read from the pages named in UNI_RULES[...].src. When a university changes its table, the rule in index.html and the line here change together, on purpose.
scenario('every university gives the bonus its page publishes: points for 4 and for 5 units, per subject', NOTHING, {}, async (page) => {
  const got = await page.evaluate(() => {
    const ks = ['math', 'eng', 'phys', 'chem', 'bio', 'cs', 'lit', 'bible', 'hist', 'civ', 'jt', 'arlang', 'hebar', 'arab', 'heb', 'other'];
    return Object.fromEntries(Object.keys(UNI_RULES).map((u) => [u, Object.fromEntries(ks.map((k) => [k, [UNI_RULES[u].bonus(k, 5, []), UNI_RULES[u].bonus(k, 4, []), UNI_RULES[u].bonus(k, 3, [])]]))]));
  });
  const row = (o) => (k) => o[k] || o._ ;
  const want = {
    // go.tau.ac.il/he/ba/how-to-calculate
    tau: { math: [35, 12.5], eng: [25, 12.5], phys: [25, 10], chem: [25, 10], bio: [25, 10], lit: [25, 10], bible: [25, 10], hist: [25, 10], arlang: [25, 0], arab: [20, 0], _: [20, 10] },
    // info.huji.ac.il/reception-components/Bagrut
    huji: { math: [35, 15], eng: [25, 15], phys: [25, 15], chem: [25, 15], bio: [25, 15], cs: [25, 15], lit: [25, 15], bible: [25, 15], hist: [25, 15], civ: [25, 15], jt: [25, 15], arlang: [25, 15], arab: [25, 15], _: [20, 10] },
    // the candidates' booklet of BGU for 2026-27, updated 1.1.2026
    bgu: { math: [35, 20], eng: [25, 15], phys: [25, 10], chem: [25, 10], bio: [25, 10], cs: [25, 10], lit: [25, 10], bible: [25, 10], hist: [25, 10], arlang: [25, 10], hebar: [25, 10], _: [20, 10] },
    // admissions.haifa.ac.il/score-calculation
    haifa: { math: [35, 20], eng: [25, 20], phys: [25, 20], chem: [25, 20], bio: [25, 20], bible: [25, 20], hist: [25, 20], lit: [25, 20], arlang: [25, 20], hebar: [25, 20], _: [20, 10] },
    // admissions.technion.ac.il/calculation-of-the-median-grade: no row for 4 units in the tables of the named subjects, 10 for the other subjects of its lists
    technion: { math: [30, 0], eng: [25, 0], phys: [25, 0], chem: [25, 0], bio: [25, 0], cs: [25, 0], lit: [25, 0], bible: [25, 0], hist: [25, 0], arlang: [25, 0], hebar: [25, 0], arab: [25, 0], _: [20, 10] },
  };
  const bad = [];
  for (const [u, o] of Object.entries(want)) for (const k of Object.keys(got[u])) { const w = row(o)(k); const [five, four, three] = got[u][k]; if (five !== w[0] || four !== w[1]) bad.push(`${u} ${k}: ${five}/${four} instead of ${w[0]}/${w[1]}`); if (three !== 0) bad.push(`${u} ${k}: a bonus for 3 units`); }
  assert.deepEqual(bad, []);
});

scenario('the Technion\'s combined bonus: maths and two sciences, or one science and one technological subject (computer science is one), all at 5 units and 60 or more', NOTHING, {}, async (page) => {
  const r = await page.evaluate(() => {
    const T = UNI_RULES.technion, at = (k, rows) => T.bonus(k, 5, rows), m = { k: 'math', u: 5, g: 90 }, ph = { k: 'phys', u: 5, g: 90 }, ch = { k: 'chem', u: 5, g: 90 }, cs = { k: 'cs', u: 5, g: 90 }, tk = { k: 'tech', u: 5, g: 90 };
    return { two: [at('math', [m, ph, ch]), at('phys', [m, ph, ch]), at('chem', [m, ph, ch])], sciTech: [at('phys', [m, ph, cs]), at('cs', [m, ph, cs]), at('tech', [m, ph, tk])], noMaths: at('phys', [ph, ch]), lowGrade: at('phys', [m, ph, { ...ch, g: 59 }]), fourUnits: at('phys', [m, ph, { ...cs, u: 4 }]),
      cap: UNI_RULES.technion.cap, weight: UNI_RULES.technion.mathW };
  });
  assert.deepEqual(r.two, [30, 30, 30]); assert.deepEqual(r.sciTech, [30, 30, 30], 'computer science counts as the technological subject');
  assert.equal(r.noMaths, 25, 'without 5 units of maths there is no combined bonus'); assert.equal(r.lowGrade, 25, 'a grade under 60 does not take part'); assert.equal(r.fourUnits, 25, '4 units do not take part');
  assert.equal(r.cap, 119); assert.equal(r.weight, 2, 'maths counts double in the Technion\'s optimal average');
});

scenario('the formulas of the admission score give the published examples, and Haifa does not call a "no" a student whose psychometric lets the bagrut stay out', NOTHING, {}, async (page) => {
  const r = await page.evaluate(() => {
    const v = (f, ...a) => F[f](...a);
    // the Technion's own example: D = 107.6, P = 670 gives 85; BGU/TAU/HUJI/Haifa from their pages' steps
    const haifaRow = DEG.map((d) => (d.th || {}).haifa || []).flat().find((x) => x.w === 2 && /\/humanities\//.test(x.url || '') && x.v >= 600);
    const saved = S.sc; let low, high;
    try { S.sc = { p: 560, b: 62 }; low = evalRow('haifa', haifaRow).state; S.sc = { p: 620, b: 62 }; high = evalRow('haifa', haifaRow).state; } finally { S.sc = saved; }
    return { technion: Math.round(v('technion', 107.6, 670)), huji: Math.round(v('huji', 103.2, 646, { w: [1, 0] }) * 1000) / 1000, huji37: Math.round(v('huji', 103.2, 646, { w: [0, 1] }) * 1000) / 1000, haifa: Math.round(v('haifa', 76.2, 554, { w: 2 })), law: Math.round(v('haifa', 76.2, 554, { w: 7 / 3 })), tau: Math.round(v('tau', 108.39, 607, {}, {})), low, high, row: haifaRow && haifaRow.n };
  });
  assert.equal(r.technion, 85, 'the example of the Technion page');
  assert.equal(r.huji, 21.277, 'the HUJI example: bagrut 10.32 and psychometric 646, equal weights'); assert.equal(r.huji37, 21.247, 'and with 30% and 70%');
  assert.equal(r.haifa, 513, 'the Haifa example of the 1:2 ratio'); assert.equal(r.law, 517, 'and of the 3:7 ratio');
  assert.equal(r.tau, 633, 'the TAU example: average 108.39 and psychometric 607');
  assert.ok(r.row, 'a humanities program at Haifa with a threshold of 600 or more'); assert.equal(r.low, 'no', 'below 600 the weighted score decides'); assert.equal(r.high, 'na', 'from 600 the bagrut is not weighted, so the weighted "no" is not claimed');
});

// ---- the official tables of dates ----
scenario('the official tables are well formed: dates, seasons, a fact behind every season and every psychometric sitting, and the links of the Ministry', NOTHING, {}, async (page) => {
  const bad = await page.evaluate(() => {
    const bad = [], ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)), ids = new Set();
    for (const b of BAGD) {
      const [m, k, d, n, d2] = b;
      if (!['w', 's', 'b'].includes(m)) bad.push('season ' + m);
      if (!n || !k) bad.push('no name: ' + b.join());
      if (!ok(d) || (d2 && (!ok(d2) || d2 <= d))) bad.push('dates ' + b.join());
      const id = bagEv(b).id; if (ids.has(id)) bad.push('twice ' + id); ids.add(id);
    }
    for (const m of ['w', 's', 'b']) { const f = factGet(bagFS(m)); if (!f || !f.src) bad.push('no fact with a source for the season ' + m); }
    for (const z of PSYD) {
      if (!ok(z.d) || !ok(z.reg) || z.reg >= z.d || (z.d2 && z.d2 < z.d)) bad.push('psychometric dates ' + z.id);
      if (!factGet('psy.date.' + z.id)) bad.push('no fact for the psychometric sitting ' + z.id);
    }
    for (const [k, u] of Object.entries(EDU)) if (!/^https:\/\/[a-z.]*\.gov\.il\//.test(u)) bad.push('EDU.' + k + ' is not a link of the government: ' + u);
    for (const id of ['bagrut.2027', 'bagrut.w2027', 'bagrut.s2027', 'bagrut.moedb', 'bagrut.ext.reg', 'bagrut.cert.rules', 'bagrut.cert.must', 'bagrut.improve']) {
      const f = factGet(id); if (!f) { bad.push('no fact ' + id); continue; }
      if (!['verified', 'unverified', 'conflict'].includes(f.status) || !/^\d{4}-\d{2}-\d{2}$/.test(f.checked)) bad.push('the fact ' + id + ' has no status or no date');
      if (f.status === 'verified' && !f.by) bad.push('the fact ' + id + ' is verified against no one');
    }
    // the summer schedule is a draft, and says so: it is never shown as verified
    if (factGet('bagrut.s2027') && factGet('bagrut.s2027').status === 'verified' && !/סופי/.test(factGet('bagrut.s2027').note || '')) bad.push('the summer schedule is a draft and is marked as verified');
    return bad;
  });
  assert.deepEqual(bad, []);
});
