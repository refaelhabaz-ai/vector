#!/usr/bin/env node
// The question bank: what applicants and students ask before and during their studies, with an answer to each.
// The source is questions/NN-name.md, one file per category, in this shape:
//
//   # <category title>
//   <!-- category: tech -->
//   ## <track title>
//   <!-- id: cs; match: מדעי המחשב|הנדסת תוכנה; kind: degree -->
//   - [עבודה] <a question?>
//     <its answer, on the lines that are indented under it>
//   - [לימודים] <a question?>
//     <its answer>
//
// kind: degree (a first degree, matched to the site's degrees by `match`), second (a second degree), mahat (a technician / practical engineer
// program, matched to the site's MAHAT programs by `match`), voc (a trade or a certificate), topic (a field or a specialization the site has no
// page of its own for), general (a theme that belongs to no track).
// Other keys of the comment: attach (a regular expression: the degree pages that show the track too), occ (a regular expression: the occupation
// pages that show it), topic (the forum topic of every question of the track, when the tag of a question does not say it).
// Tags: עבודה (practice, work, pay), לימודים (what studying is like), קריירה (career, future, ways out), חיים (life and balance).
// An answer may hold the live-number tokens of the site: {sal:degree} {emp:degree} {inst:degree} {osal:occupation} {hot:occupation}
// {trend:occupation} {mhsal:program} and the provenance tokens {ft:fact} {fv:fact} (see FAQ in index.html). It holds no amounts of money.
//
//   node tools/question-bank.mjs            check, write questions/bank.json, print the report
//   node tools/question-bank.mjs --check    check only: nothing is written, exit code 1 on an error
//   node tools/question-bank.mjs --strict   also an error when a degree or a program of the site has no track in the bank
//   node tools/question-bank.mjs --partial  answers are not required yet (while they are being written)
//   node tools/question-bank.mjs --json     the report as JSON
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadSite } from './lib/site-data.mjs';

export const ROOT = fileURLToPath(new URL('../questions/', import.meta.url));
export const TAGS = ['עבודה', 'לימודים', 'קריירה', 'חיים'];
export const KINDS = ['degree', 'second', 'mahat', 'voc', 'topic', 'general'];
export const CATEGORIES = ['tech', 'health', 'exact', 'biz', 'social', 'arts', 'mahat', 'voc', 'life'];
export const TOPIC_IDS = ['adm', 'study', 'jobs', 'sched', 'social', 'money', 'dorm', 'other']; // the forum topics of the site (TOPICS in index.html)
export const TOKENS = ['inst', 'sal', 'emp', 'osal', 'hot', 'trend', 'mhsal', 'ft', 'fv'];
const MIN_PER_TRACK = 3;
const ANSWER_MIN = 90, ANSWER_LONG = 1100;

// a question that could be asked of any track says nothing about this one
const GENERIC = [/^(מה|מהם) (הם )?תנאי (ה)?קבלה/, /^מה הסף\b/, /^איפה אפשר ללמוד\b/, /^כמה עולה (ה)?תואר\b/, /^מה צריך כדי להתקבל\b/, /^איך נרשמים\b/];
// first person singular, present tense or an adjective: it has a feminine and a masculine form, and the bank speaks to both
const GENDERED = /(^|[\s,(])אני (לומד|לומדת|מעוניין|מעוניינת|מתלבט|מתלבטת|חושב|חושבת|מרגיש|מרגישה|עובד|עובדת|צריך|צריכה|יכול|יכולה|מסוגל|מסוגלת|בטוח|בטוחה|מוכן|מוכנה|מאוכזב|מאוכזבת|עייף|עייפה|חדש|חדשה|מבוגר|מבוגרת|צעיר|צעירה|סטודנט|סטודנטית|מתכנת|מתכנתת|מהנדס|מהנדסת|הנדסאי|הנדסאית|אחראי|אחראית|נשוי|נשואה|גרוש|גרושה)(?=[\s,.?!)]|$)/;
// an answer speaks to everyone in the plural ("בדקו") or without a person ("כדאי לבדוק"), never to one person
const SINGULAR_YOU = /(^|[\s,(])(אתה|לך|שלך|אותך|עליך|ממך|בשבילך|אליך|איתך|תבדוק|תבדקי|תחליט|תחליטי|תשאל|תשאלי|תלמד|תלמדי|תעשה|תעשי|כשאתה|שאתה)(?=[\s,.?!:)]|$)/;
const MONEY = /₪|ש"ח|(?<![א-ת])(?:שקל|שקלים)(?![א-ת])|אלף שקל/;   // not "נשקלים" (weighed): the word has to stand alone

const norm = (s) => s.normalize('NFD').replace(/[֑-ׇ]/g, '').replace(/[״“”]/g, '"').replace(/[׳‘’]/g, "'").replace(/\s+/g, ' ').trim();
const key = (s) => norm(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const words = (s) => new Set((norm(s).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []));
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };
const rx = (s) => { try { return s ? new RegExp(s) : null; } catch { return null; } };

// the forum topic of a question: what its tag says, and for the questions about life, what they are about
const LIFE_RULES = [
  ['money', /שכר לימוד|הלוואה|תקציב|מימון|מלגה|מלגות|עלות|כסף|שכר דירה|הכנסה|לחסוך|משכנתא|חובות|מחיר/],
  ['dorm', /מעונות|דירה|שותפים|מגורים|שכירות/],
  ['sched', /עומס|שעות|לוח זמנים|מבחנים|שחיקה|שינה|משמרות|כוננות|שגרה|לחץ|זמן פנוי|קריסה|לילות/],
  ['social', /חברים|חברתי|חברה|זוגיות|משפחה|הורים|הורות|ילדים|בדידות|אווירה|חברויות|קהילה|שייך/],
];
export function topicOf(track, q) {
  if (track.topic) return track.topic;
  if (q.tag === 'לימודים') return 'study';
  if (q.tag === 'עבודה' || q.tag === 'קריירה') return 'jobs';
  for (const [t, re] of LIFE_RULES) if (re.test(q.text)) return t;
  return 'other';
}

/** Reads one category file. Nothing is thrown: the problems come back with the line they are on. */
export function parseFile(text, file = '') {
  const out = { file, title: '', category: '', tracks: [], problems: [] };
  const bad = (line, msg) => out.problems.push({ level: 'error', file, line, msg });
  let cur = null, expectMeta = false, last = null;   // last: the question that the next indented line is the answer of
  text.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const line = i + 1, s = raw.trim();
    if (!s) return;
    let m;
    if (/^[ \t]+\S/.test(raw) && !/^[ \t]+(#|<!--|- \[)/.test(raw)) {
      if (!last) bad(line, 'an indented line that is not under a question');
      else last.a = last.a ? last.a + '\n' + s : s;
      return;
    }
    last = null;
    if ((m = s.match(/^# (.+)$/))) { if (out.title) bad(line, 'a second category heading'); out.title = m[1].trim(); return; }
    if ((m = s.match(/^<!--\s*category:\s*([\w-]+)\s*-->$/))) { out.category = m[1]; return; }
    if ((m = s.match(/^## (.+)$/))) { cur = { title: m[1].trim(), id: '', match: '', kind: '', attach: '', occ: '', topic: '', line, questions: [] }; out.tracks.push(cur); expectMeta = true; return; }
    if ((m = s.match(/^<!--(.*)-->$/))) {
      if (!cur || !expectMeta) { bad(line, 'a comment that belongs to no track heading'); return; }
      expectMeta = false;
      for (const part of m[1].split(';')) {
        const kv = part.match(/^\s*(id|match|kind|attach|occ|topic)\s*:\s*(.*?)\s*$/);
        if (kv) cur[kv[1]] = kv[2]; else if (part.trim()) bad(line, 'unknown part in the track comment: ' + part.trim());
      }
      return;
    }
    if ((m = s.match(/^- \[([^\]]+)\]\s*(.+)$/))) {
      if (!cur) { bad(line, 'a question before any track heading'); return; }
      expectMeta = false;
      last = { tag: m[1].trim(), text: m[2].trim(), a: '', line };
      cur.questions.push(last);
      return;
    }
    if (/^- /.test(s)) { bad(line, 'a list item without a [tag]'); return; }
    if (/^#/.test(s)) { bad(line, 'heading level not used here'); return; }
    // any other line is a note for the people who read the file and is ignored
  });
  if (!out.title) bad(1, 'no category title (# ...)');
  if (!out.category) bad(1, 'no <!-- category: id --> comment');
  return out;
}

/** The ids of the sourced facts of the site (the FACTS list of index.html), for the {ft:...} tokens. */
export function factIds(html) {
  const a = html.indexOf('const FACTS=['), b = a < 0 ? -1 : html.indexOf('\n];', a);
  return new Set(a < 0 ? [] : [...html.slice(a, b).matchAll(/\{id:'([^']+)'/g)].map((m) => m[1]));
}

/** The tokens of an answer and what is wrong with them. `site` ({ html, DATA }) is optional: without it only the shape is checked. */
export function checkTokens(answer, site = null) {
  const problems = [];
  for (const m of answer.matchAll(/\{([a-z]+):([^}]*)\}/g)) {
    const [, k, n] = m;
    if (!TOKENS.includes(k)) { problems.push(`unknown token {${k}:...}`); continue; }
    if (!n.trim()) { problems.push(`an empty token {${k}:}`); continue; }
    if (!site) continue;
    const { html, DATA } = site;
    if (k === 'ft' || k === 'fv') { if (!site.facts) site.facts = factIds(html); if (!site.facts.has(n)) problems.push(`{${k}:${n}}: no such fact in the site`); }
    else if (k === 'inst' || k === 'sal' || k === 'emp') { if (!DATA.deg.some((d) => d.n === n && !/\((ארבע|תלת|חד|דו|חמש|שש)-שנתי\)\s*$/.test(d.n))) problems.push(`{${k}:${n}}: no degree with exactly this name`); }
    else if (k === 'mhsal') { if (!(DATA.mahat || []).some((p) => p.n === n)) problems.push(`{${k}:${n}}: no technician program with exactly this name`); }
    else if (!Object.values(DATA.oc || {}).some((o) => o.n === n)) problems.push(`{${k}:${n}}: no occupation with exactly this name`);
  }
  const rest = answer.replace(/\{[a-z]+:[^}]*\}/g, '');
  if (/[{}]/.test(rest)) problems.push('a stray brace');
  return problems;
}

/** Everything the bank has to satisfy. Returns { errors, warnings } as lists of { file, line, msg }. */
export function validate(files, opts = {}) {
  const { site = null, requireAnswers = true } = opts;
  const errors = [], warnings = [];
  const err = (file, line, msg) => errors.push({ file, line, msg });
  const warn = (file, line, msg) => warnings.push({ file, line, msg });
  for (const f of files) f.problems.forEach((p) => err(p.file, p.line, p.msg));

  const seenCat = new Map(), seenTrack = new Map(), seenQ = new Map(), seenA = new Map(), all = [], allA = [];
  for (const f of files) {
    if (f.category) {
      if (!CATEGORIES.includes(f.category)) err(f.file, 1, 'unknown category id ' + f.category);
      if (seenCat.has(f.category)) err(f.file, 1, `category ${f.category} is also in ${seenCat.get(f.category)}`);
      seenCat.set(f.category, f.file);
    }
    for (const t of f.tracks) {
      const at = (msg, level = err) => level(f.file, t.line, `[${t.id || t.title}] ${msg}`);
      if (!/^[a-z][a-z0-9-]*$/.test(t.id) || t.id.includes('--')) at('the track needs an id in ASCII (a-z, 0-9, single -)');
      if (seenTrack.has(t.id)) at(`id ${t.id} is also in ${seenTrack.get(t.id)}`);
      seenTrack.set(t.id, f.file);
      if (!KINDS.includes(t.kind)) at('kind must be one of ' + KINDS.join(', '));
      for (const k of ['match', 'attach', 'occ']) if (t[k]) { try { new RegExp(t[k]); } catch (e) { at(`${k} is not a regular expression: ${e.message}`); } }
      if (t.topic && !TOPIC_IDS.includes(t.topic)) at('topic must be one of ' + TOPIC_IDS.join(', '));
      if ((t.kind === 'degree' || t.kind === 'mahat') && !t.match) at('a degree or a mahat track needs match:');
      if (t.questions.length < MIN_PER_TRACK) at(`has ${t.questions.length} question(s); at least ${MIN_PER_TRACK} are needed`);
      const tags = new Set(t.questions.map((q) => q.tag));
      if (t.kind !== 'general' && t.questions.length >= MIN_PER_TRACK && tags.size < 3) at(`its questions cover only ${tags.size} of the four sides (${[...tags].join(', ')})`, warn);
      const titleWords = words(t.title);
      for (const q of t.questions) {
        const here = (msg, level = err) => level(f.file, q.line, `[${t.id}] ${msg}`);
        if (!TAGS.includes(q.tag)) here(`unknown tag [${q.tag}]`);
        if (!/\?$/.test(q.text)) here('a question ends with ?');
        if (q.text.length < 25) here('too short to say anything specific: ' + q.text);
        if (q.text.length > 190) here(`too long (${q.text.length} characters)`, warn);
        if (/\s{2}|[‎‏‪-‮]/.test(q.text)) here('double space or a direction mark');
        if (GENERIC.some((r) => r.test(q.text))) here('a generic question, the same for every track: ' + q.text);
        if (GENDERED.test(q.text)) here('speaks in one gender (first person, present tense): ' + q.text, warn);
        const k = key(q.text);
        if (seenQ.has(k)) here(`the same question as ${seenQ.get(k)}`);
        seenQ.set(k, `${f.file}:${q.line}`);
        const w = words(q.text);
        for (const x of titleWords) w.delete(x);
        all.push({ file: f.file, line: q.line, track: t.id, w, text: q.text });

        const a = q.a || '';
        if (!a) { if (requireAnswers) here('no answer under the question'); continue; }
        if (a.length < ANSWER_MIN) here(`the answer is too short (${a.length} characters): ${q.text}`);
        if (a.length > ANSWER_LONG) here(`the answer is long (${a.length} characters)`, warn);
        for (const p of checkTokens(a, site)) here(p);
        if (MONEY.test(a)) here('an amount of money in an answer: amounts come from the tokens ({sal:...}, {osal:...}), not from the text');
        if (SINGULAR_YOU.test(a)) here('an answer speaks to one person (use the plural or no person): ' + a.slice(0, 60), warn);
        if (GENDERED.test(a)) here('an answer speaks in one gender (first person, present tense): ' + a.slice(0, 60), warn);
        if (/\s{2}|[‎‏‪-‮]/.test(a)) here('double space or a direction mark in an answer');
        const ka = key(a);
        if (seenA.has(ka)) here(`the same answer as ${seenA.get(ka)}`);
        seenA.set(ka, `${f.file}:${q.line}`);
        allA.push({ file: f.file, line: q.line, track: t.id, w: words(a), text: a });
      }
    }
  }
  for (const c of CATEGORIES) if (!seenCat.has(c)) err('questions/', 0, `category ${c} has no file`);
  // questions that are the same question with other words: inside a track, or the same template across tracks
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.w.size < 4 || b.w.size < 4) continue;
    const s = jaccard(a.w, b.w);
    if (s >= (a.track === b.track ? 0.6 : 0.7)) warn(a.file, a.line, `looks like ${b.file}:${b.line} (${Math.round(s * 100)}%): "${a.text}" / "${b.text}"`);
  }
  // answers that are the same answer with other words: a template that was filled in
  for (let i = 0; i < allA.length; i++) for (let j = i + 1; j < allA.length; j++) {
    const a = allA[i], b = allA[j];
    if (a.w.size < 12 || b.w.size < 12) continue;
    const s = jaccard(a.w, b.w);
    if (s >= 0.8) warn(a.file, a.line, `the answer looks like the one at ${b.file}:${b.line} (${Math.round(s * 100)}%)`);
  }
  return { errors, warnings };
}

export const fixName = (s) => norm(String(s || '')).replace(/\s*[-–]\s*/g, ' - ');

/** Which tracks cover which of the site's degrees, technician programs and occupations. */
export function coverage(files, DATA) {
  const tracks = files.flatMap((f) => f.tracks.map((t) => ({ ...t, re: rx(t.match), at: rx(t.attach), oc: rx(t.occ) }))); // a match is written against the names as fixName() leaves them: quotes plain, a hyphen with a space on each side
  const hits = (kind, name) => tracks.filter((t) => t.kind === kind && t.re && t.re.test(fixName(name)));
  const degrees = new Map(), programs = new Map(), attached = new Map(), occs = new Map();
  const noDegree = [], noProgram = [];
  const push = (m, k, v) => m.set(k, [...(m.get(k) || []), v]);
  for (const d of DATA.deg) {
    const h = hits('degree', d.n);
    if (!h.length) noDegree.push(`${d.id}:${d.n}`);
    for (const t of h) push(degrees, t.id, d.id);
    for (const t of tracks) if (t.at && t.at.test(fixName(d.n)) && !h.includes(t)) push(attached, t.id, d.id);
  }
  DATA.mahat.forEach((m, i) => {
    const h = hits('mahat', m.n);
    if (!h.length) noProgram.push(`${i}:${m.n}`);
    for (const t of h) push(programs, t.id, i);
  });
  for (const [id, o] of Object.entries(DATA.oc || {})) for (const t of tracks) if (t.oc && t.oc.test(fixName(o.n))) push(occs, t.id, id);
  const idle = tracks.filter((t) => (t.kind === 'degree' && !degrees.has(t.id)) || (t.kind === 'mahat' && !programs.has(t.id)) || (t.at && !attached.has(t.id) && !degrees.has(t.id)) || (t.oc && !occs.has(t.id))).map((t) => t.id);
  return { degrees, programs, attached, occs, noDegree, noProgram, idle, nDeg: DATA.deg.length, nProg: DATA.mahat.length };
}

/** The bank as one JSON document: categories, tracks (with the site's degree ids and program numbers they cover) and questions with their answers. */
export function build(files, cov = null) {
  const bank = { version: 2, categories: [], tracks: [], questions: [] };
  for (const f of files) {
    bank.categories.push({ id: f.category, title: f.title, file: f.file });
    for (const t of f.tracks) {
      bank.tracks.push({ id: t.id, title: t.title, category: f.category, kind: t.kind, ...(t.match ? { match: t.match } : {}), ...(t.attach ? { attach: t.attach } : {}), ...(t.occ ? { occ: t.occ } : {}),
        ...(cov && cov.degrees.has(t.id) ? { degrees: cov.degrees.get(t.id) } : {}), ...(cov && cov.programs.has(t.id) ? { programs: cov.programs.get(t.id) } : {}),
        ...(cov && cov.attached.has(t.id) ? { attached: cov.attached.get(t.id) } : {}), ...(cov && cov.occs.has(t.id) ? { occupations: cov.occs.get(t.id) } : {}) });
      for (const q of t.questions) bank.questions.push({ id: t.id + '.' + createHash('sha1').update(key(q.text)).digest('hex').slice(0, 6), track: t.id, tag: q.tag, topic: topicOf(t, q), q: q.text, a: q.a || '' });
    }
  }
  return bank;
}

export function readBank(dir = ROOT) {
  return readdirSync(dir).filter((n) => /^\d\d-.*\.md$/.test(n)).sort().map((n) => parseFile(readFileSync(join(dir, n), 'utf8'), n));
}

function main() {
  const args = process.argv.slice(2), flag = (n) => args.includes(n);
  if (!existsSync(ROOT)) { console.error('no questions/ directory'); process.exit(1); }
  const files = readBank();
  let site = null, cov = null;
  const warnLater = [];
  try { site = loadSite(); cov = coverage(files, site.DATA); } catch (e) { warnLater.push({ file: 'index.html', line: 0, msg: 'the site data could not be read, so coverage and tokens were not checked: ' + e.message }); }
  const { errors, warnings } = validate(files, { site, requireAnswers: !flag('--partial') });
  warnings.push(...warnLater);
  if (cov && flag('--strict')) {
    for (const x of cov.noDegree) errors.push({ file: 'index.html', line: 0, msg: 'a degree of the site has no track: ' + x });
    for (const x of cov.noProgram) errors.push({ file: 'index.html', line: 0, msg: 'a technician program of the site has no track: ' + x });
    for (const x of cov.idle) errors.push({ file: 'questions/', line: 0, msg: 'a track whose match, attach or occ finds nothing in the site: ' + x });
  }
  const bank = build(files, cov);
  if (!flag('--check') && !errors.length) writeFileSync(join(ROOT, 'bank.json'), JSON.stringify(bank, null, 1) + '\n');

  const count = (f) => f.tracks.reduce((n, t) => n + t.questions.length, 0);
  const answered = bank.questions.filter((q) => q.a).length;
  const report = {
    questions: bank.questions.length, answered, tracks: bank.tracks.length,
    byCategory: files.map((f) => ({ category: f.category, title: f.title, tracks: f.tracks.length, questions: count(f), answered: f.tracks.reduce((n, t) => n + t.questions.filter((q) => q.a).length, 0) })),
    byTag: Object.fromEntries(TAGS.map((t) => [t, bank.questions.filter((q) => q.tag === t).length])),
    byTopic: Object.fromEntries(TOPIC_IDS.map((t) => [t, bank.questions.filter((q) => q.topic === t).length])),
    coverage: cov && { degreesCovered: cov.nDeg - cov.noDegree.length, degrees: cov.nDeg, programsCovered: cov.nProg - cov.noProgram.length, programs: cov.nProg, degreesWithoutTrack: cov.noDegree, programsWithoutTrack: cov.noProgram, tracksThatMatchNothing: cov.idle },
    errors, warnings,
  };
  if (flag('--json')) console.log(JSON.stringify(report, null, 1));
  else {
    console.log(`${report.questions} questions (${answered} answered) in ${report.tracks} tracks`);
    for (const c of report.byCategory) console.log(`  ${String(c.questions).padStart(4)} (${String(c.answered).padStart(4)})  ${String(c.tracks).padStart(3)} tracks  ${c.category.padEnd(7)} ${c.title}`);
    console.log('  by side: ' + TAGS.map((t) => `${t} ${report.byTag[t]}`).join(' · '));
    console.log('  by forum topic: ' + TOPIC_IDS.map((t) => `${t} ${report.byTopic[t]}`).join(' · '));
    if (cov) {
      console.log(`  degrees of the site with a track: ${report.coverage.degreesCovered}/${cov.nDeg}; technician programs: ${report.coverage.programsCovered}/${cov.nProg}`);
      if (cov.noDegree.length) console.log('  no track for degrees: ' + cov.noDegree.slice(0, 40).join(' | ') + (cov.noDegree.length > 40 ? ` ... (+${cov.noDegree.length - 40})` : ''));
      if (cov.noProgram.length) console.log('  no track for programs: ' + cov.noProgram.join(' | '));
      if (cov.idle.length) console.log('  tracks whose match, attach or occ finds nothing in the site: ' + cov.idle.join(', '));
    }
    for (const w of warnings.slice(0, 60)) console.log(`  warning ${w.file}:${w.line} ${w.msg}`);
    if (warnings.length > 60) console.log(`  ... and ${warnings.length - 60} more warnings`);
    for (const e of errors.slice(0, 80)) console.log(`  ERROR ${e.file}:${e.line} ${e.msg}`);
    if (errors.length > 80) console.log(`  ... and ${errors.length - 80} more errors`);
  }
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
