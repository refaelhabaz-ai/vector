// node --test tools/test/question-bank.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, CATEGORIES, parseFile, validate, coverage, build, readBank } from '../question-bank.mjs';
import { loadSite } from '../lib/site-data.mjs';

// one category file with one track; `questions` is a list of [tag, text]
const file = (questions, { meta = 'id: t1; match: ^מדעי המחשב$; kind: degree', title = 'מדעי המחשב', category = 'tech', name = '01-x.md' } = {}) =>
  parseFile(`# קטגוריה\n<!-- category: ${category} -->\n\n## ${title}\n<!-- ${meta} -->\n\n${questions.map(([t, q]) => `- [${t}] ${q}`).join('\n')}\n`, name);

const THREE = [
  ['לימודים', 'כמה מתמטיקה יש בשנה הראשונה, ואיך מתכוננים לקורסים הראשונים?'],
  ['עבודה', 'מתי כדאי להתחיל לעבוד כסטודנט בחברה, ומה זה עושה לציונים?'],
  ['קריירה', 'אילו תפקידים אפשר לקבל אחרי התואר חוץ מפיתוח?'],
];
const msgs = (list) => list.map((x) => x.msg);
const has = (list, part) => msgs(list).some((m) => m.includes(part));

test('parseFile reads the title, the category, the track comment and the tagged questions, and ignores notes', () => {
  const f = parseFile(`# שם\n<!-- category: biz -->\nהערה לקוראים, לא שאלה.\n\n## חשבונאות\n<!-- id: acct; match: חשבונאות; kind: degree -->\n\nעוד הערה\n- [עבודה] איך נראית עונת הדוחות במשרד גדול?\n- [חיים] איך שומרים על שינה בעונת העומס?\n`, 'x.md');
  assert.equal(f.title, 'שם'); assert.equal(f.category, 'biz'); assert.deepEqual(f.problems, []);
  assert.equal(f.tracks.length, 1);
  const t = f.tracks[0];
  assert.equal(t.title, 'חשבונאות'); assert.equal(t.id, 'acct'); assert.equal(t.match, 'חשבונאות'); assert.equal(t.kind, 'degree');
  assert.deepEqual(t.questions.map((q) => q.tag), ['עבודה', 'חיים']);
  assert.equal(t.questions[0].text, 'איך נראית עונת הדוחות במשרד גדול?');
});

test('parseFile reports a malformed file with the line it is on, and throws nothing', () => {
  const f = parseFile(`- [עבודה] שאלה לפני כל כותרת?\n# א\n# ב\n## נושא\n- שאלה בלי תגית?\n<!-- id: a; speed: 3 -->\n### כותרת קטנה\n<!-- id: b -->\n`, 'bad.md');
  const m = msgs(f.problems).join(' | ');
  for (const part of ['a question before any track heading', 'a second category heading', 'a list item without a [tag]', 'unknown part in the track comment', 'heading level not used here', 'a comment that belongs to no track heading', 'no <!-- category: id --> comment'])
    assert.ok(m.includes(part), part + ' was not reported: ' + m);
  assert.ok(f.problems.every((p) => p.file === 'bad.md' && p.line >= 1));
});

test('validate: a valid track passes, and only the categories that have no file are missing', () => {
  const { errors, warnings } = validate([file(THREE)]);
  assert.deepEqual(warnings, []);
  assert.equal(errors.length, CATEGORIES.length - 1);
  assert.ok(errors.every((e) => e.msg.startsWith('category ') && e.msg.endsWith('has no file')));
});

test('validate: the rules of a track', () => {
  const only = (f) => validate([f]).errors.filter((e) => !e.msg.endsWith('has no file'));
  assert.ok(has(only(file(THREE.slice(0, 2))), 'has 2 question(s); at least 3 are needed'));
  assert.ok(has(only(file(THREE, { meta: 'id: Bad Id; kind: voc' })), 'the track needs an id in ASCII'));
  assert.ok(has(only(file(THREE, { meta: 'id: t1; kind: hobby' })), 'kind must be one of'));
  assert.ok(has(only(file(THREE, { meta: 'id: t1; kind: degree' })), 'needs match:'));
  assert.ok(has(only(file(THREE, { meta: 'id: t1; match: (; kind: degree' })), 'not a regular expression'));
  assert.ok(has(only(file(THREE, { category: 'nope' })), 'unknown category id nope'));
});

test('validate: the rules of a question', () => {
  const run = (...qs) => validate([file([...THREE.slice(0, 2), ...qs])]);
  assert.ok(has(run(['חלום', 'כמה זמן לוקח ללמוד את החומר בשנה הראשונה, ואיך מתכוננים לזה']).errors, 'a question ends with ?'));
  assert.ok(has(run(['לימודים', 'מה עוד אפשר?']).errors, 'too short'));
  assert.ok(has(run(['חלום', 'האם כדאי ללמוד את זה בכלל כשמתחילים מאפס בלי רקע?']).errors, 'unknown tag'));
  assert.ok(has(run(['לימודים', 'מה תנאי הקבלה לתואר הזה ומה צריך להגיש?']).errors, 'a generic question'));
  assert.ok(has(run(['לימודים', 'מה  הקורס שמפיל הכי הרבה סטודנטים בשנה הראשונה כאן?']).errors, 'double space'));
  assert.ok(has(run(['חיים', 'אני עייף מהעומס ואני לא יודע אם להמשיך, מה עושים?']).warnings, 'speaks in one gender'));
  assert.ok(!has(run(['חיים', 'לא כתבתי שורת קוד בחיים, אפשר להתחיל מאפס בלי להישאר מאחור?']).warnings, 'speaks in one gender'));
});

test('validate: the same question twice is an error, even with other punctuation, spacing or niqqud', () => {
  const a = file(THREE, { meta: 'id: a; match: ^א$; kind: degree', title: 'א', name: '01-a.md' });
  const b = file([['לימודים', 'כַּמָּה מתמטיקה יש בשנה הראשונה - ואיך מתכוננים לקורסים הראשונים'.replace(/$/, '?')], THREE[1], THREE[2]], { meta: 'id: b; match: ^ב$; kind: degree', title: 'ב', category: 'biz', name: '04-b.md' });
  const { errors } = validate([a, b]);
  assert.ok(errors.some((e) => e.msg.includes('the same question as 01-a.md')), msgs(errors).join('\n'));
});

test('validate: two tracks with the same template and another field name are flagged as look-alikes', () => {
  const q = (field) => [['לימודים', `${field}: כמה זמן לוקח למצוא עבודה ראשונה אחרי הסיום, ומה מבדיל את מי שמוצא מהר?`], ['עבודה', `מתי כדאי להתחיל לעבוד כסטודנט ב${field} ומה זה עושה לציונים?`], ['קריירה', `אילו תפקידים אפשר לקבל אחרי ${field} חוץ ממה שכולם מכירים?`]];
  const a = file(q('פיזיקה'), { meta: 'id: a; kind: topic', title: 'פיזיקה', name: '01-a.md' });
  const b = file(q('כימיה'), { meta: 'id: b; kind: topic', title: 'כימיה', category: 'biz', name: '04-b.md' });
  const { warnings } = validate([a, b]);
  assert.ok(warnings.some((w) => w.msg.startsWith('looks like')), 'no look-alike warning: ' + msgs(warnings).join(' | '));
  assert.deepEqual(validate([a]).warnings, []);
});

test('validate: a track that covers fewer than three of the four sides gets a warning, a general theme does not', () => {
  const two = [['לימודים', THREE[0][1]], ['לימודים', 'אילו קורסים מפילים הכי הרבה סטודנטים בשנה הראשונה כאן?'], ['עבודה', THREE[1][1]]];
  assert.ok(has(validate([file(two)]).warnings, 'cover only 2 of the four sides'));
  assert.ok(!has(validate([file(two, { meta: 'id: g; kind: general' })]).warnings, 'of the four sides'));
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

test('build: one JSON document, with ids that follow the wording of a question and not its place in the file', () => {
  const f1 = file(THREE);
  const f2 = file([THREE[2], THREE[0], [THREE[1][0], THREE[1][1].replace('?', ' ?')]]);
  const b1 = build([f1]), b2 = build([f2]);
  assert.equal(b1.version, 1);
  assert.deepEqual(b1.categories, [{ id: 'tech', title: 'קטגוריה', file: '01-x.md' }]);
  assert.equal(b1.tracks.length, 1); assert.equal(b1.tracks[0].category, 'tech'); assert.equal(b1.tracks[0].match, '^מדעי המחשב$');
  assert.deepEqual(b1.questions.map((q) => q.id).sort(), b2.questions.map((q) => q.id).sort());
  assert.ok(b1.questions.every((q) => /^t1\.[0-9a-f]{6}$/.test(q.id) && q.track === 't1'));
  assert.equal(new Set(b1.questions.map((q) => q.id)).size, 3);
  const changed = build([file([['לימודים', THREE[0][1].replace('מתמטיקה', 'פיזיקה')], THREE[1], THREE[2]])]);
  assert.notEqual(changed.questions.find((q) => q.tag === 'לימודים').id, b1.questions.find((q) => q.tag === 'לימודים').id);
});

// the bank in the repository: this is the part that holds the requirement
test('the bank in the repository is valid, without warnings, and every degree and program of the site has a track', () => {
  const files = readBank();
  const { errors, warnings } = validate(files);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(files.map((f) => f.category).sort(), [...CATEGORIES].sort());
  for (const f of files) for (const t of f.tracks) assert.ok(t.questions.length >= 3, `${t.id} has fewer than three questions`);
  const cov = coverage(files, loadSite().DATA);
  assert.deepEqual(cov.noDegree, [], 'degrees of the site without a track');
  assert.deepEqual(cov.noProgram, [], 'technician programs of the site without a track');
  assert.deepEqual(cov.idle, [], 'tracks whose match finds nothing in the site');
});

test('questions/bank.json, when it exists, is the build of the markdown files as they are now', () => {
  const p = join(ROOT, 'bank.json');
  if (!existsSync(p)) return;
  const files = readBank();
  const expected = JSON.parse(JSON.stringify(build(files, coverage(files, loadSite().DATA))));
  assert.deepEqual(JSON.parse(readFileSync(p, 'utf8')), expected, 'bank.json is out of date: run node tools/question-bank.mjs');
});
