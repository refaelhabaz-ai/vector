// node --test tools/test/question-bank.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, CATEGORIES, TOPIC_IDS, parseFile, validate, checkTokens, factIds, topicOf, coverage, build, readBank } from '../question-bank.mjs';
import { loadSite, SITE } from '../lib/site-data.mjs';
import { qaBlock, withBlock, blockOf, BEGIN, END } from '../apply-qa.mjs';

// one category file with one track; `questions` is a list of [tag, text, answer?]
const file = (questions, { meta = 'id: t1; match: ^מדעי המחשב$; kind: degree', title = 'מדעי המחשב', category = 'tech', name = '01-x.md' } = {}) =>
  parseFile(`# קטגוריה\n<!-- category: ${category} -->\n\n## ${title}\n<!-- ${meta} -->\n\n${questions.map(([t, q, a]) => `- [${t}] ${q}${a ? '\n  ' + a : ''}`).join('\n')}\n`, name);

const THREE = [
  ['לימודים', 'כמה מתמטיקה יש בשנה הראשונה, ואיך מתכוננים לקורסים הראשונים?'],
  ['עבודה', 'מתי כדאי להתחיל לעבוד כסטודנט בחברה, ומה זה עושה לציונים?'],
  ['קריירה', 'אילו תפקידים אפשר לקבל אחרי התואר חוץ מפיתוח?'],
];
const ANS = [
  'בשנה הראשונה יש הרבה מתמטיקה, ובדרך כלל מתחילים מהבסיס. כדאי לפתוח את תוכנית הלימודים של המוסד ולראות אילו קורסים נדרשים לפני שמתחילים.',
  'אפשר להתחיל כבר בשנה השנייה אם העומס מאפשר, ובתנאי שהמשרה גמישה בתקופת מבחנים. כדאי להתחיל בהיקף קטן ולהגדיל אחרי שמכירים את הקצב.',
  'יש תפקידי ניתוח, בדיקות, תשתיות ומוצר, ולא רק פיתוח. בעמוד התואר באתר מופיעים התפקידים שבהם עובדים הבוגרים לפי עבודאטה.',
];
const withAnswers = (qs = THREE) => qs.map((q, i) => [q[0], q[1], ANS[i % ANS.length]]);
const msgs = (list) => list.map((x) => x.msg);
const has = (list, part) => msgs(list).some((m) => m.includes(part));
const loose = { requireAnswers: false };

test('parseFile reads the title, the category, the track comment, the tagged questions and their answers, and ignores notes', () => {
  const f = parseFile(`# שם\n<!-- category: biz -->\nהערה לקוראים, לא שאלה.\n\n## חשבונאות\n<!-- id: acct; match: חשבונאות; kind: degree; attach: ^כלכלה$; occ: ראיית חשבון; topic: jobs -->\n\nעוד הערה\n- [עבודה] איך נראית עונת הדוחות במשרד גדול?\n  עונת הדוחות עמוסה.\n  שורה שנייה של התשובה.\n- [חיים] איך שומרים על שינה בעונת העומס?\n`, 'x.md');
  assert.equal(f.title, 'שם'); assert.equal(f.category, 'biz'); assert.deepEqual(f.problems, []);
  assert.equal(f.tracks.length, 1);
  const t = f.tracks[0];
  assert.equal(t.title, 'חשבונאות'); assert.equal(t.id, 'acct'); assert.equal(t.match, 'חשבונאות'); assert.equal(t.kind, 'degree');
  assert.equal(t.attach, '^כלכלה$'); assert.equal(t.occ, 'ראיית חשבון'); assert.equal(t.topic, 'jobs');
  assert.deepEqual(t.questions.map((q) => q.tag), ['עבודה', 'חיים']);
  assert.equal(t.questions[0].text, 'איך נראית עונת הדוחות במשרד גדול?');
  assert.equal(t.questions[0].a, 'עונת הדוחות עמוסה.\nשורה שנייה של התשובה.');
  assert.equal(t.questions[1].a, '');
});

test('parseFile reports a malformed file with the line it is on, and throws nothing', () => {
  const f = parseFile(`- [עבודה] שאלה לפני כל כותרת?\n  תשובה בלי שאלה\n# א\n# ב\n## נושא\n- שאלה בלי תגית?\n<!-- id: a; speed: 3 -->\n### כותרת קטנה\n<!-- id: b -->\n`, 'bad.md');
  const m = msgs(f.problems).join(' | ');
  for (const part of ['a question before any track heading', 'an indented line that is not under a question', 'a second category heading', 'a list item without a [tag]', 'unknown part in the track comment', 'heading level not used here', 'a comment that belongs to no track heading', 'no <!-- category: id --> comment'])
    assert.ok(m.includes(part), part + ' was not reported: ' + m);
  assert.ok(f.problems.every((p) => p.file === 'bad.md' && p.line >= 1));
});

test('validate: a valid track passes, and only the categories that have no file are missing', () => {
  const { errors, warnings } = validate([file(withAnswers())]);
  assert.deepEqual(warnings, []);
  assert.equal(errors.length, CATEGORIES.length - 1);
  assert.ok(errors.every((e) => e.msg.startsWith('category ') && e.msg.endsWith('has no file')));
});

test('validate: the rules of a track', () => {
  const only = (f) => validate([f], loose).errors.filter((e) => !e.msg.endsWith('has no file'));
  assert.ok(has(only(file(THREE.slice(0, 2))), 'has 2 question(s); at least 3 are needed'));
  assert.ok(has(only(file(THREE, { meta: 'id: Bad Id; kind: voc' })), 'the track needs an id in ASCII'));
  assert.ok(has(only(file(THREE, { meta: 'id: a--b; kind: voc' })), 'the track needs an id in ASCII'));
  assert.ok(has(only(file(THREE, { meta: 'id: t1; kind: hobby' })), 'kind must be one of'));
  assert.ok(has(only(file(THREE, { meta: 'id: t1; kind: degree' })), 'needs match:'));
  assert.ok(has(only(file(THREE, { meta: 'id: t1; match: (; kind: degree' })), 'not a regular expression'));
  assert.ok(has(only(file(THREE, { meta: 'id: t1; kind: topic; attach: [' })), 'attach is not a regular expression'));
  assert.ok(has(only(file(THREE, { meta: 'id: t1; kind: topic; topic: weather' })), 'topic must be one of'));
  assert.ok(has(only(file(THREE, { category: 'nope' })), 'unknown category id nope'));
});

test('validate: the rules of a question', () => {
  const run = (...qs) => validate([file([...THREE.slice(0, 2), ...qs])], loose);
  assert.ok(has(run(['חלום', 'כמה זמן לוקח ללמוד את החומר בשנה הראשונה, ואיך מתכוננים לזה']).errors, 'a question ends with ?'));
  assert.ok(has(run(['לימודים', 'מה עוד אפשר?']).errors, 'too short'));
  assert.ok(has(run(['חלום', 'האם כדאי ללמוד את זה בכלל כשמתחילים מאפס בלי רקע?']).errors, 'unknown tag'));
  assert.ok(has(run(['לימודים', 'מה תנאי הקבלה לתואר הזה ומה צריך להגיש?']).errors, 'a generic question'));
  assert.ok(has(run(['לימודים', 'מה  הקורס שמפיל הכי הרבה סטודנטים בשנה הראשונה כאן?']).errors, 'double space'));
  assert.ok(has(run(['חיים', 'אני עייף מהעומס ואני לא יודע אם להמשיך, מה עושים?']).warnings, 'speaks in one gender'));
  assert.ok(!has(run(['חיים', 'לא כתבתי שורת קוד בחיים, אפשר להתחיל מאפס בלי להישאר מאחור?']).warnings, 'speaks in one gender'));
});

test('validate: every question needs an answer, and the answer has rules of its own', () => {
  assert.ok(has(validate([file(THREE)]).errors, 'no answer under the question'));
  assert.ok(!has(validate([file(THREE)], loose).errors, 'no answer'));
  const run = (a) => validate([file([THREE[0], THREE[1], [THREE[2][0], THREE[2][1], a]].map((q, i) => (i < 2 ? [q[0], q[1], ANS[i]] : q)))]);
  assert.ok(has(run('קצר מדי.').errors, 'the answer is too short'));
  assert.ok(has(run(ANS[2] + ' המשכורת מגיעה לשלושים אלף ₪ בחודש.').errors, 'an amount of money'));
  assert.ok(has(run(ANS[2] + ' בדקו שכר של 20 אלף שקל באתר.').errors, 'an amount of money'));
  assert.ok(!has(run(ANS[2] + ' בהליך הקבלה נשקלים דברים רבים ומשקלים שונים.').errors, 'an amount of money'));
  assert.ok(has(run(ANS[2] + ' ' + 'ארוך מאוד. '.repeat(120)).warnings, 'the answer is long'));
  assert.ok(has(run(ANS[2] + ' אתה יכול לבדוק את זה באתר המוסד.').warnings, 'speaks to one person'));
  assert.ok(has(run(ANS[2] + ' אני לומד את זה כבר שנתיים.').warnings, 'one gender'));
  assert.ok(!has(run(ANS[2] + ' כדאי לבדוק באתר המוסד, ובעמוד של התואר בעבודאטה.').warnings, 'speaks to one person'));
  assert.ok(has(run(ANS[0]).errors, 'the same answer as'));
});

test('validate: the tokens of an answer', () => {
  const run = (a) => validate([file([[THREE[0][0], THREE[0][1], ANS[0]], [THREE[1][0], THREE[1][1], ANS[1]], [THREE[2][0], THREE[2][1], ANS[2] + ' ' + a]])]);
  assert.deepEqual(run('{sal:מדעי המחשב} {ft:md.six} {emp:מדעי המחשב}').errors.filter((e) => !e.msg.endsWith('has no file')), []);
  assert.ok(has(run('{salary:מדעי המחשב}').errors, 'unknown token'));
  assert.ok(has(run('{sal:}').errors, 'an empty token'));
  assert.ok(has(run('{sal:מדעי המחשב').errors, 'a stray brace'));
  assert.ok(has(run('סוף }').errors, 'a stray brace'));
});

test('checkTokens: the names are checked against the data and the facts of the site', () => {
  const site = {
    html: "x\nconst FACTS=[\n {id:'md.six',t:'a'},\n {id:'psy.range',t:'b'}\n];\ny",
    DATA: { deg: [{ id: 'd1', n: 'מדעי המחשב' }, { id: 'd2', n: 'פיזיקה (ארבע-שנתי)' }], mahat: [{ n: 'הנדסת תוכנה' }], oc: { 2512: { n: 'פיתוח תוכנה' } } },
  };
  assert.deepEqual([...factIds(site.html)].sort(), ['md.six', 'psy.range']);
  assert.deepEqual(checkTokens('{sal:מדעי המחשב} {inst:מדעי המחשב} {emp:מדעי המחשב} {mhsal:הנדסת תוכנה} {osal:פיתוח תוכנה} {hot:פיתוח תוכנה} {trend:פיתוח תוכנה} {ft:md.six}{fv:psy.range}', site), []);
  assert.equal(checkTokens('{sal:פיזיקה (ארבע-שנתי)}', site).length, 1);        // a length variant is joined to its main degree on the page
  assert.equal(checkTokens('{sal:מדעי הרוח}', site).length, 1);
  assert.equal(checkTokens('{mhsal:מכונות}', site).length, 1);
  assert.equal(checkTokens('{osal:רופא}', site).length, 1);
  assert.equal(checkTokens('{ft:no.such.fact}', site).length, 1);
  assert.deepEqual(checkTokens('{ft:no.such.fact} {sal:אין}'), []);                // without a site, only the shape is checked
});

test('validate: the same question twice is an error, even with other punctuation, spacing or niqqud', () => {
  const a = file(THREE, { meta: 'id: a; match: ^א$; kind: degree', title: 'א', name: '01-a.md' });
  const b = file([['לימודים', 'כַּמָּה מתמטיקה יש בשנה הראשונה - ואיך מתכוננים לקורסים הראשונים'.replace(/$/, '?')], THREE[1], THREE[2]], { meta: 'id: b; match: ^ב$; kind: degree', title: 'ב', category: 'biz', name: '04-b.md' });
  const { errors } = validate([a, b], loose);
  assert.ok(errors.some((e) => e.msg.includes('the same question as 01-a.md')), msgs(errors).join('\n'));
});

test('validate: two tracks with the same template and another field name are flagged as look-alikes', () => {
  const q = (field) => [['לימודים', `${field}: כמה זמן לוקח למצוא עבודה ראשונה אחרי הסיום, ומה מבדיל את מי שמוצא מהר?`], ['עבודה', `מתי כדאי להתחיל לעבוד כסטודנט ב${field} ומה זה עושה לציונים?`], ['קריירה', `אילו תפקידים אפשר לקבל אחרי ${field} חוץ ממה שכולם מכירים?`]];
  const a = file(q('פיזיקה'), { meta: 'id: a; kind: topic', title: 'פיזיקה', name: '01-a.md' });
  const b = file(q('כימיה'), { meta: 'id: b; kind: topic', title: 'כימיה', category: 'biz', name: '04-b.md' });
  const { warnings } = validate([a, b], loose);
  assert.ok(warnings.some((w) => w.msg.startsWith('looks like')), 'no look-alike warning: ' + msgs(warnings).join(' | '));
  assert.deepEqual(validate([a], loose).warnings, []);
});

test('validate: two answers that are one template are flagged', () => {
  const base = 'כדי לדעת איך זה נראה בפועל כדאי לפתוח את תוכנית הלימודים של המוסד ולבדוק אילו קורסים נדרשים בכל שנה, ואחר כך לשאול סטודנטים ובוגרים מה היה קשה להם ומה עזר להם להצליח בלימודים';
  const a = file([[THREE[0][0], THREE[0][1], base + ' בפיזיקה.'], [THREE[1][0], THREE[1][1], ANS[1]], [THREE[2][0], THREE[2][1], ANS[2]]], { meta: 'id: a; kind: topic', title: 'א', name: '01-a.md' });
  const b = file([[THREE[0][0], THREE[0][1] + ' ', base + ' בכימיה.'], [THREE[1][0], 'מתי כדאי להתחיל לעבוד כסטודנט בחברה גדולה, ומה זה עושה לציונים בפועל?', ANS[0]], [THREE[2][0], 'אילו תפקידים אפשר לקבל אחרי התואר בכימיה חוץ ממעבדה?', ANS[1]]], { meta: 'id: b; kind: topic', title: 'ב', category: 'biz', name: '04-b.md' });
  const { warnings } = validate([a, b]);
  assert.ok(warnings.some((w) => /the answer looks like the one at/.test(w.msg)), msgs(warnings).join(' | '));
});

test('validate: a track that covers fewer than three of the four sides gets a warning, a general theme does not', () => {
  const two = [['לימודים', THREE[0][1]], ['לימודים', 'אילו קורסים מפילים הכי הרבה סטודנטים בשנה הראשונה כאן?'], ['עבודה', THREE[1][1]]];
  assert.ok(has(validate([file(two)], loose).warnings, 'cover only 2 of the four sides'));
  assert.ok(!has(validate([file(two, { meta: 'id: g; kind: general' })], loose).warnings, 'of the four sides'));
});

test('topicOf: the tag says it, and for the questions about life what they are about', () => {
  const t = (tag, text, track = {}) => topicOf(track, { tag, text });
  assert.equal(t('לימודים', 'מה הקורס הכי קשה?'), 'study');
  assert.equal(t('עבודה', 'כמה מרוויחים?'), 'jobs');
  assert.equal(t('קריירה', 'לאן ממשיכים אחרי התואר?'), 'jobs');
  assert.equal(t('חיים', 'איך מממנים שכר לימוד וחיים בזמן הלימודים?'), 'money');
  assert.equal(t('חיים', 'מעונות או דירה שכורה עם שותפים?'), 'dorm');
  assert.equal(t('חיים', 'איך שומרים על שינה בתקופת מבחנים?'), 'sched');
  assert.equal(t('חיים', 'איך שומרים על זוגיות לצד הלימודים?'), 'social');
  assert.equal(t('חיים', 'מה קורה לגב אחרי כמה שנים?'), 'other');
  assert.equal(t('חיים', 'איך שומרים על שינה?', { topic: 'adm' }), 'adm');
  assert.ok(TOPIC_IDS.includes('adm') && TOPIC_IDS.length === 8);
});

test('coverage matches the names the way the site shows them: no niqqud, straight quotes, a hyphen with a space', () => {
  const f = [
    file(THREE, { meta: 'id: cs; match: ^מדעי המחשב( \\(| - |$); kind: degree', name: '01-a.md' }),
    file(THREE, { meta: 'id: civil-struct; match: ^הנדסה אזרחית - מבנים$; kind: degree', title: 'מבנים', category: 'biz', name: '04-b.md' }),
    file(THREE, { meta: 'id: pep; match: פכ"מ; kind: degree', title: 'פכ"מ', category: 'social', name: '05-c.md' }),
    file(THREE, { meta: 'id: sw; match: ^הנדסת תוכנה$|^הנדסת תוכנה - ogem$; kind: mahat', title: 'תוכנה', category: 'mahat', name: '07-d.md' }),
    file(THREE, { meta: 'id: nothing; match: ^לא קיים$; kind: degree', title: 'לא קיים', category: 'arts', name: '06-e.md' }),
    file(THREE, { meta: 'id: elec; match: ^מדעי המחשב$; kind: voc', title: 'חשמלאי', category: 'voc', name: '08-f.md' }),
  ];
  const DATA = {
    deg: [{ id: 'd1', n: 'מדעי המחשב' }, { id: 'd2', n: 'מדעי המחשב (תואר כפול)' }, { id: 'd3', n: 'הנדסה אזרחית-מבנים' }, { id: 'd4', n: 'פכ״מ' }, { id: 'd5', n: 'שם שאין לו נושא' }],
    mahat: [{ n: 'הנדסת תוכנה' }, { n: 'הנדסת תוכנה-ogem' }, { n: 'תוכנית שאין לה נושא' }],
  };
  const c = coverage(f, DATA);
  assert.deepEqual(c.degrees.get('cs'), ['d1', 'd2']);
  assert.deepEqual(c.degrees.get('civil-struct'), ['d3']);
  assert.deepEqual(c.degrees.get('pep'), ['d4']);
  assert.deepEqual(c.programs.get('sw'), [0, 1]);
  assert.deepEqual(c.noDegree, ['d5:שם שאין לו נושא']);
  assert.deepEqual(c.noProgram, ['2:תוכנית שאין לה נושא']);
  assert.deepEqual(c.idle, ['nothing']);
  assert.equal(c.degrees.has('elec'), false, 'a voc track is never matched to the degrees of the site');
  assert.equal(c.nDeg, 5); assert.equal(c.nProg, 3);
});

test('coverage: a track can be attached to degrees and to occupations of the site', () => {
  const f = [
    file(THREE, { meta: 'id: m-cs; kind: second; attach: ^מדעי המחשב|^הנדסת תוכנה$', title: 'תואר שני', name: '01-a.md' }),
    file(THREE, { meta: 'id: electrician; kind: voc; occ: חשמלאות בניין', title: 'חשמלאי', category: 'voc', name: '08-b.md' }),
    file(THREE, { meta: 'id: ghost; kind: voc; occ: ^אין כזה$', title: 'רוח', category: 'life', name: '09-c.md' }),
  ];
  const DATA = { deg: [{ id: 'd1', n: 'מדעי המחשב' }, { id: 'd2', n: 'הנדסת תוכנה' }, { id: 'd3', n: 'פיזיקה' }], mahat: [], oc: { 7411: { n: 'חשמלאות בניין וחשמלאות אחרת (ראשית ומוסמכת)' }, 7412: { n: 'מכונאות חשמל' } } };
  const c = coverage(f, DATA);
  assert.deepEqual(c.attached.get('m-cs'), ['d1', 'd2']);
  assert.deepEqual(c.occs.get('electrician'), ['7411']);
  assert.deepEqual(c.idle, ['ghost']);
});

test('build: one JSON document, with ids that follow the wording of a question and not its place in the file', () => {
  const f1 = file(withAnswers());
  const f2 = file([withAnswers()[2], withAnswers()[0], [THREE[1][0], THREE[1][1].replace('?', ' ?'), ANS[1]]]);
  const b1 = build([f1]), b2 = build([f2]);
  assert.equal(b1.version, 2);
  assert.deepEqual(b1.categories, [{ id: 'tech', title: 'קטגוריה', file: '01-x.md' }]);
  assert.equal(b1.tracks.length, 1); assert.equal(b1.tracks[0].category, 'tech'); assert.equal(b1.tracks[0].match, '^מדעי המחשב$');
  assert.deepEqual(b1.questions.map((q) => q.id).sort(), b2.questions.map((q) => q.id).sort());
  assert.ok(b1.questions.every((q) => /^t1\.[0-9a-f]{6}$/.test(q.id) && q.track === 't1' && q.a && TOPIC_IDS.includes(q.topic)));
  assert.deepEqual(b1.questions.map((q) => q.topic), ['study', 'jobs', 'jobs']);
  assert.equal(new Set(b1.questions.map((q) => q.id)).size, 3);
  const changed = build([file([['לימודים', THREE[0][1].replace('מתמטיקה', 'פיזיקה'), ANS[0]], withAnswers()[1], withAnswers()[2]])]);
  assert.notEqual(changed.questions.find((q) => q.tag === 'לימודים').id, b1.questions.find((q) => q.tag === 'לימודים').id);
});

// the bank in the repository: this is the part that holds the requirement
const partial = !!process.env.QB_PARTIAL;   // QB_PARTIAL=1 while the answers are still being written
test('the bank in the repository is valid, without warnings, answered, and every degree and program of the site has a track', () => {
  const files = readBank(), site = loadSite();
  const { errors, warnings } = validate(files, { site, requireAnswers: !partial });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(files.map((f) => f.category).sort(), [...CATEGORIES].sort());
  for (const f of files) for (const t of f.tracks) assert.ok(t.questions.length >= 3, `${t.id} has fewer than three questions`);
  const cov = coverage(files, site.DATA);
  assert.deepEqual(cov.noDegree, [], 'degrees of the site without a track');
  assert.deepEqual(cov.noProgram, [], 'technician programs of the site without a track');
  assert.deepEqual(cov.idle, [], 'tracks whose match, attach or occ finds nothing in the site');
});

test('questions/bank.json, when it exists, is the build of the markdown files as they are now', { skip: partial }, () => {
  const p = join(ROOT, 'bank.json');
  if (!existsSync(p)) return;
  const files = readBank();
  const expected = JSON.parse(JSON.stringify(build(files, coverage(files, loadSite().DATA))));
  assert.deepEqual(JSON.parse(readFileSync(p, 'utf8')), expected, 'bank.json is out of date: run node tools/question-bank.mjs');
});

// the page: tools/apply-qa.mjs writes the bank into index.html
test('qaBlock lists every track once and only the questions that have an answer, each with the number of its track', () => {
  const b = build([file([...withAnswers(), ['חיים', 'שאלה שעדיין אין לה תשובה, ולכן היא לא מוצגת באתר בכלל?']])]);
  const block = qaBlock(b);
  assert.ok(block[0].startsWith(BEGIN) && block[block.length - 1] === END);
  const rows = block.filter((l) => l.startsWith('['));   // the rows of QA_T and QA_I
  assert.equal(rows.length, 1 + 3);   // one track, three answered questions
  const q = JSON.parse(rows[1].replace(/,$/, ''));
  assert.equal(q[0], 0); assert.ok(/^t1\.[0-9a-f]{6}$/.test(q[1])); assert.ok(TOPIC_IDS.includes(q[2]));
});

test('withBlock puts the block before `let DEMO_C=null;` once, replaces it on the next run, keeps the line endings and touches nothing else', () => {
  const page = ['a', 'let DEMO_C=null;', 'b'].join('\r\n');
  const one = withBlock(page, ['/* QA:begin x */', 'const QA_T=[];', '/* QA:end */']);
  assert.equal(one, ['a', '/* QA:begin x */', 'const QA_T=[];', '/* QA:end */', 'let DEMO_C=null;', 'b'].join('\r\n'));
  const two = withBlock(one, ['/* QA:begin y */', 'const QA_T=[1];', '/* QA:end */']);
  assert.equal(two, ['a', '/* QA:begin y */', 'const QA_T=[1];', '/* QA:end */', 'let DEMO_C=null;', 'b'].join('\r\n'));
  assert.deepEqual(blockOf(two), ['/* QA:begin y */', 'const QA_T=[1];', '/* QA:end */']);
  assert.equal(blockOf(page), null);
  assert.throws(() => withBlock('no anchor here', []), /DEMO_C/);
});

test('index.html carries the bank as the markdown files write it now (run node tools/apply-qa.mjs)', { skip: partial }, () => {
  const files = readBank();
  const want = qaBlock(build(files, coverage(files, loadSite().DATA)));
  assert.deepEqual(blockOf(readFileSync(SITE, 'utf8')), want, 'index.html is out of date: run node tools/apply-qa.mjs');
});
