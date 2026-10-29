// node --test tools/test/path.test.mjs
// The road and the calendar, in a real browser: what the mentor says about the gap and which moves it prices, what the calendar holds (nothing, until the student puts something in it),
// and that the map is still the map. It needs Playwright with Chromium; without them every test here is skipped and the rest of the suite runs with no dependencies.
// The bagrut model (what is missing and what is only not entered yet), the plain average and the official tables are in bagrut.test.mjs.
import assert from 'node:assert/strict';
import { scenario, student, visit, addDays, today, cssId } from './site.mjs';

// ---- four students ----
// medicine at Tel Aviv with a good psychometric and a high bagrut, and still a few dozen points below the threshold: a gap that can be closed
const GAP = student({ d: 'd172', i: 'tau', stage: 'g11', scores: { p: 690, b: 96, est: true }, calc: { math: [5, 93], eng: [5, 96], heb: [2, 95], hist: [2, 90], civ: [2, 98], lit: [2, 94], bible: [2, 92], phys: [5, 91], chem: [5, 94] } });
// computer science at Tel Aviv with a lower bagrut: even 800 in the psychometric does not reach the threshold, so the road goes through the bagrut first
const FAR = student({ d: 'd20', i: 'tau', scores: { p: 600, b: 90 }, calc: { math: [5, 88], eng: [4, 90], heb: [2, 86], hist: [2, 84], civ: [2, 90], lit: [2, 83], bible: [2, 85], phys: [3, 80] } });
// the same degree, strong numbers: above the threshold
const OK = student({ d: 'd20', i: 'tau', scores: { p: 760, b: 96 }, calc: { math: [5, 95], eng: [5, 96], heb: [2, 94], hist: [2, 92], civ: [2, 95], lit: [2, 93], bible: [2, 90], cs: [5, 97], phys: [5, 92] } });
// a goal and no numbers at all
const FRESH = student({ d: 'd20', i: 'huji', stage: 'svc', psy: 'plan' });


const CSS_ID = cssId;

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

// ---- "המספרים שלי": the numbers, the chart, saving. Nothing else ----
const openNumbers = async (page) => { await page.click('[data-ktab="lab"]'); await page.waitForSelector('#kpOut'); };
scenario('the numbers tool holds the sliders, the verdict, the chart and saving, and no boosters and no doors', FAR, {}, async (page) => {
  await openNumbers(page);
  for (const sel of ['#kpIn', '#kpPn', '#kpP', '#kpRows', '#kpVerdict', '#kpChart svg', '#kpSave']) assert.ok(await page.$(sel), `${sel} is there`);
  for (const sel of ['#kpBoost', '#kpDoors', '.kp-bst', '.kp-dr', '.kp-dsum', '[data-lb]', '[data-lbd]', '[data-lbplan]']) assert.equal(await page.$(sel), null, `${sel} is gone`);
  assert.doesNotMatch(await page.$eval('#kpTab', (e) => e.innerText), /בוסטר|דלתות פתוחות|דלתות קרובות|לפירוט הדלתות/);
});

scenario('a number moved in the numbers tool changes the verdict and the chart at once, and reaches the profile only when the student says so', FAR, {}, async (page) => {
  await openNumbers(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('kivun3.scores') || '{}').p);
  const before = { verdict: await page.$eval('#kpVerdict', (e) => e.innerText), dot: await page.$eval('#kpChart circle.me', (e) => e.getAttribute('cy')) };
  assert.equal(await stored(), 600);
  await page.fill('#kpPn', '780');
  await page.waitForFunction((v) => document.querySelector('#kpVerdict').innerText !== v, before.verdict);
  assert.notEqual(await page.$eval('#kpChart circle.me', (e) => e.getAttribute('cy')), before.dot, 'the dot of the chart moved with the score');
  assert.equal(await page.$eval('#kpP', (e) => +e.value), 780, 'the slider follows the typed number');
  assert.equal(await stored(), 600, 'nothing is saved by moving a number');
  await page.click('[data-lbsave]');
  await page.waitForSelector('[data-lbok]');
  assert.equal(await stored(), 600, 'nor by asking to save: it asks first');
  await page.click('[data-lbok="real"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('kivun3.scores') || '{}').p === 780);
  // moved again, and put back: the profile is what it was
  await page.fill('#kpPn', '650');
  await page.waitForSelector('[data-lbreset]');
  await page.click('[data-lbreset]');
  await page.waitForFunction(() => +document.querySelector('#kpPn').value === 780);
  assert.equal(await stored(), 780);
});

// ---- the calendar ----
// It opens empty. Nothing is in it until the student puts it there: a line they write, a sitting they mark in the menu of official dates, a scholarship they follow.
const openCalendar = async (page) => { await page.click('[data-ktab="cal"]'); await page.waitForSelector('#cuMain'); };
// what fills the month, the week and the list: three things of the student's own (a task today, study hours tomorrow, an event in five days) and two official sittings
const fillCalendar = (page, day) => page.evaluate((day) => {
  const P = pth(), at = (n) => { const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() + n); return isoD(d); };
  P.dates.push({ id: 'my-t1', t: 'לברר על מלגה', d: at(0), kind: 'task' }, { id: 'my-s1', t: 'תרגול כמותי', d: at(1), kind: 'study', tm: '16:30', len: 90 }, { id: 'my-e1', t: 'יום פתוח בטכניון', d: at(5), kind: 'event', tm: '10:00', len: 120 });
  P.pick = [bagEv(BAGD.find((b) => daysTo(b[4] || b[2]) >= 0)).id, 'psy-' + PSYD.find((z) => daysTo(z.d2 || z.d) >= 0).id];
  pthSave(); PLC = null;
}, day);

scenario('the calendar opens empty: no card, no pill, no next-date banner, and no date taken from the student\'s goals', GAP, {}, async (page) => {
  await openCalendar(page);
  const m = await page.evaluate(() => ({ mine: cuItems(plan()).length, line: timeline(plan()).length, menu: officialAll(plan()).length, shown: document.querySelectorAll('#cuRoot .cu-c, #cuRoot .cu-pl, #cuRoot .cu-hero').length,
    empty: !!document.querySelector('#cuRoot .cu-em'), file: !!document.querySelector('[data-kics]'), saved: (({ dates, pick }) => ({ dates: dates.length, pick: (pick || []).length }))(pth()) }));
  assert.equal(m.mine, 0, 'nothing in the calendar'); assert.equal(m.line, 0, 'nothing on the timeline, which summaries, lists and files read');
  assert.ok(m.menu > 10, 'the official dates wait in the menu');
  assert.equal(m.shown, 0); assert.ok(m.empty, 'it says that it is empty'); assert.equal(m.file, false, 'there is no file to download of nothing');
  assert.deepEqual(m.saved, { dates: 0, pick: 0 }, 'the student has a target, registration dates and an exam table behind it, and none of that came in by itself');
});

scenario('an official sitting enters the calendar only when it is marked in the menu, on its own days, and leaves when it is marked again', GAP, {}, async (page) => {
  await openCalendar(page);
  await page.click('.cu-top [data-cu="pick:open"]');
  await page.waitForSelector('#cuPickIn');
  assert.equal(await page.$eval('#ov', (e) => e.getAttribute('role')), 'dialog');
  assert.equal(await page.$$eval('#cuPickIn .cu-pr.on', (e) => e.length), 0, 'nothing is marked in a fresh menu');
  const sit = await page.evaluate(() => { const b = BAGD.find((b) => daysTo(b[4] || b[2]) >= 0); return { id: bagEv(b).id, d: b[2], d2: b[4] || '' }; });
  const btn = `#cuPickIn .cu-pr[data-kbag="${sit.id}"]`;
  await page.click(btn);
  await page.waitForFunction((id) => pth().pick.includes(id), sit.id);
  assert.equal(await page.$eval(btn, (e) => e.getAttribute('aria-pressed')), 'true');
  const known = await page.evaluate(() => [...PSYD.flatMap((z) => [z.reg, z.d, z.d2]), ...BAGD.flatMap((b) => [b[2], b[4]])].filter(Boolean));
  const mine = await page.evaluate(() => cuItems(plan()).map((x) => ({ id: x.id, d: x.d, off: x.off, f: x.f })));
  assert.deepEqual(mine.map((x) => x.id), [sit.id], 'only that sitting');
  assert.ok(known.includes(mine[0].d) && mine[0].d === sit.d, 'on a date of the official table'); assert.equal(mine[0].off, 1); assert.ok(mine[0].f, 'with the fact behind it');
  await page.evaluate((m) => { KC.m = m; cuRepaint(); }, sit.d.slice(0, 7)); // the month of the sitting, under the menu
  assert.ok(await page.$(`.cu-gd[data-iso="${sit.d}"] .cu-pl.bag`), 'a pill on its first day');
  if (sit.d2 && sit.d2.slice(0, 7) === sit.d.slice(0, 7)) assert.ok(await page.$(`.cu-gd[data-iso="${sit.d2}"] .cu-pl.bag`), 'and on its last');
  // the psychometric: the exam, and the day its regular registration closes, each of them a choice
  await page.click('#cuPickIn [data-cu="pickt:psy"]');
  const psy = await page.$$eval('#cuPickIn .cu-pr', (b) => b.map((x) => x.dataset.kbag));
  assert.ok(psy.some((id) => /^psy-/.test(id)) && psy.some((id) => /^psyreg-/.test(id)), 'the exam and the closing of its registration');
  assert.ok(await page.evaluate(() => { const o = document.querySelector('#ov'), h = o && document.getElementById(o.getAttribute('aria-labelledby')); return !!h && h.textContent.trim().length > 0; }), 'the dialog keeps its name when its tab changes');
  assert.equal(await page.$$eval('#cuPickIn .cu-pr.on', (e) => e.length), 0, 'none of them is marked');
  await page.click('#cuPickIn [data-cu="pickt:bag"]');
  await page.click(btn); // marked again: out
  await page.waitForFunction((id) => !pth().pick.includes(id), sit.id);
  assert.equal(await page.evaluate(() => cuItems(plan()).length), 0, 'and the calendar is empty again');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#ov'));
});

scenario('a line written in the day panel is saved on that day, once, and the field is ready for the next one', GAP, {}, async (page) => {
  await openCalendar(page);
  assert.match(await page.$eval('#cuDP', (e) => e.textContent), /אין כלום ביום הזה/);
  await page.fill('#cuQT', 'לקרוא על מלגות');
  await page.click('#cuQuick button[type="submit"]');
  await page.waitForFunction(() => pth().dates.length === 1);
  const got = await page.evaluate(() => ({ x: pth().dates[0], today: isoD(today0()), stored: JSON.parse(localStorage.getItem('kivun3.path')).dates.length }));
  assert.equal(got.x.t, 'לקרוא על מלגות'); assert.equal(got.x.kind, 'task'); assert.equal(got.x.d, got.today); assert.equal(got.stored, 1);
  assert.ok(await page.$('.cu-gd.today .cu-pl.task'), 'a pill in the cell of the day');
  assert.equal(await page.$('.cu-em'), null, 'no longer empty');
  assert.deepEqual(await page.evaluate(() => [document.activeElement.id, document.activeElement.value]), ['cuQT', ''], 'the field is empty and has the focus again');
});

scenario('a weekly study session is saved with its time and length, and a student who comes back finds it', GAP, {}, async (page, { ctx }) => {
  const day = addDays(today(), 3), ymd = (s) => s.replace(/-/g, '');
  await openCalendar(page);
  await page.click('.cu-top .btn.primary');
  await page.waitForSelector('#cuForm');
  await page.click('.cu-kk.study');
  await page.fill('#cuT', 'תרגול כמותי');
  await page.fill('#cuD', day);
  await page.fill('#cuTm', '16:30');
  await page.click('.cu-lc:has(input[value="90"])');
  await page.check('#cuRp');
  await page.click('#cuForm button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('#ov'));
  const mine = await page.evaluate(() => pth().dates.filter((x) => x.t === 'תרגול כמותי'));
  assert.equal(mine.length, 4, 'four weeks');
  assert.deepEqual(mine.map((x) => x.d), [0, 7, 14, 21].map((n) => addDays(day, n)));
  assert.ok(mine.every((x) => x.kind === 'study' && x.tm === '16:30' && x.len === 90 && x.grp && x.grp === mine[0].grp), 'one series');
  // the file for the calendar app: a floating local time, the end from the length, a reminder half an hour before
  const ics = await page.evaluate(() => icsFile(null, cuItems(plan()).filter((i) => !i.fixed).map((i) => i.x)));
  assert.match(ics, new RegExp('DTSTART:' + ymd(day) + 'T163000')); assert.match(ics, new RegExp('DTEND:' + ymd(day) + 'T180000')); assert.match(ics, /TRIGGER:-PT30M/);
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'lines are folded at 75 octets');
  // coming back later: the same storage, a new tab
  const store = await page.evaluate(() => Object.entries(localStorage));
  const back = await visit(store);
  try {
    await openCalendar(back.page);
    await back.page.click('[data-cu="view:list"]');
    const text = await back.page.$eval('#cuMain', (e) => e.textContent);
    assert.ok(text.includes('תרגול כמותי'), 'the session is in the calendar of the returning student');
    assert.deepEqual(back.errors, []);
  } finally { await back.ctx.close(); }
  void ctx;
});

scenario('my own task can be ticked, taken back, deleted and brought back with "undo"', GAP, {}, async (page) => {
  await page.evaluate((day) => { const P = pth(), d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() + 5); P.dates.push({ id: 'my-t1', t: 'לברר על מלגה', d: isoD(d), kind: 'task' }); pthSave(); PLC = null; }, today());
  await openCalendar(page);
  await page.click('[data-cu="view:list"]');
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

scenario('the month, the week and the list show the same things, a day opens its panel, and the arrow keys move through the days', GAP, {}, async (page) => {
  const day = today();
  await fillCalendar(page, day);
  await openCalendar(page);
  assert.equal(await page.$('.cu-em'), null, 'not empty');
  assert.ok(await page.$('.cu-hero'), 'the date that comes next is shown');
  // the month: my three things, and the sittings I marked
  assert.ok(await page.$(`.cu-gd[data-iso="${day}"] .cu-pl.task`), 'the task is on its day');
  assert.match(await page.$eval('#cuDP', (e) => e.textContent), /לברר על מלגה/, 'and the panel of the day lists it');
  await page.click('[data-cu="view:week"]');
  assert.equal(await page.$$eval('.cu-wc', (e) => e.length), 7, 'seven days in a week');
  await page.click('[data-cu="view:list"]');
  const list = await page.$eval('#cuMain', (e) => e.textContent);
  for (const t of ['לברר על מלגה', 'תרגול כמותי', 'יום פתוח בטכניון']) assert.ok(list.includes(t), `"${t}" is in the list`);
  await page.click('[data-cu="view:month"]');
  await page.evaluate((d) => { KC.m = d.slice(0, 7); KC.sel = d; cuRepaint(); }, day);
  await page.focus(`.cu-gd[data-iso="${day}"]`);
  await page.keyboard.press('ArrowLeft'); // the page reads right to left: left is the next day
  const next = await page.evaluate((d) => { const a = new Date(d + 'T00:00:00'); a.setDate(a.getDate() + 1); return { want: isoD(a), got: KC.sel, on: document.activeElement.dataset.iso }; }, day);
  assert.equal(next.got, next.want); assert.equal(next.on, next.want, 'the focus follows');
});

// ---- phones, and the map ----
for (const [tab, view] of [['now', ''], ['cal', 'month'], ['cal', 'week'], ['cal', 'list']]) {
  scenario(`on a phone the ${tab === 'cal' ? `calendar (${view})` : 'road'} never scrolls sideways`, GAP, { w: 360, h: 740, mobile: true }, async (page) => {
    if (tab === 'cal') await fillCalendar(page, today());
    await page.click(`[data-ktab="${tab}"]`);
    await page.waitForSelector(tab === 'cal' ? '#cuMain' : '#mtPlanHost');
    if (tab === 'cal') await page.click(`[data-cu="view:${view}"]`);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert.ok(w.sw <= w.iw, `the page is ${w.sw}px wide in a ${w.iw}px window`);
  });
}

scenario('a search typed on the jobs page and left at once does not break the page that follows', GAP, {}, async (page) => {
  await page.evaluate(() => { location.hash = '#jobs'; });
  await page.waitForSelector('#jq');
  await page.fill('#jq', 'מהנדס');
  await page.evaluate(() => { location.hash = '#terms'; }); // before the timer of the search has fired
  await page.waitForTimeout(500);
});

scenario('a search typed on the degrees page and left at once does not break the page that follows', GAP, {}, async (page) => {
  await page.evaluate(() => { location.hash = '#degrees'; });
  await page.waitForSelector('#dq');
  await page.fill('#dq', 'מדעי');
  await page.evaluate(() => { location.hash = '#sch'; }); // before the timer of the search has fired
  await page.waitForTimeout(500);
});

scenario('the account dialog that a route change closed does not break when its delayed focus fires', GAP, {}, async (page) => {
  await page.evaluate(() => { openAuth(); location.hash = '#degrees'; }); // gone before the 60 ms after which the dialog takes the focus
  await page.waitForTimeout(300);
  assert.equal(await page.$('#ov'), null);
});

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
