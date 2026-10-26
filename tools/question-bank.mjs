#!/usr/bin/env node
// The question bank: what applicants and students ask before and during their studies (questions only; answers are written elsewhere).
// The source is questions/NN-name.md, one file per category, in this shape:
//
//   # <category title>
//   <!-- category: tech -->
//   ## <track title>
//   <!-- id: cs; match: מדעי המחשב|הנדסת תוכנה; kind: degree -->
//   - [עבודה] <a question?>
//   - [לימודים] <a question?>
//
// kind: degree (a first degree, matched to the site's degrees by `match`), second (a second degree), mahat (a technician / practical engineer
// program, matched to the site's MAHAT programs by `match`), voc (a trade or a certificate), topic (a field or a specialization the site has no
// page of its own for), general (a theme that belongs to no track).
// Tags: עבודה (practice, work, pay), לימודים (what studying is like), קריירה (career, future, ways out), חיים (life and balance).
//
//   node tools/question-bank.mjs            check, write questions/bank.json, print the report
//   node tools/question-bank.mjs --check    check only: nothing is written, exit code 1 on an error
//   node tools/question-bank.mjs --strict   also an error when a degree or a program of the site has no track in the bank
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
const MIN_PER_TRACK = 3;

// a question that could be asked of any track says nothing about this one
const GENERIC = [/^(מה|מהם) (הם )?תנאי (ה)?קבלה/, /^מה הסף\b/, /^איפה אפשר ללמוד\b/, /^כמה עולה (ה)?תואר\b/, /^מה צריך כדי להתקבל\b/, /^איך נרשמים\b/];
// first person singular, present tense or an adjective: it has a feminine and a masculine form, and the bank speaks to both
const GENDERED = /(^|[\s,(])אני (לומד|לומדת|מעוניין|מעוניינת|מתלבט|מתלבטת|חושב|חושבת|מרגיש|מרגישה|עובד|עובדת|צריך|צריכה|יכול|יכולה|מסוגל|מסוגלת|בטוח|בטוחה|מוכן|מוכנה|מאוכזב|מאוכזבת|עייף|עייפה|חדש|חדשה|מבוגר|מבוגרת|צעיר|צעירה|סטודנט|סטודנטית|מתכנת|מתכנתת|מהנדס|מהנדסת|הנדסאי|הנדסאית|אחראי|אחראית|נשוי|נשואה|גרוש|גרושה)(?=[\s,.?!)]|$)/;

const norm = (s) => s.normalize('NFD').replace(/[֑-ׇ]/g, '').replace(/[״“”]/g, '"').replace(/[׳‘’]/g, "'").replace(/\s+/g, ' ').trim();
const key = (s) => norm(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const words = (s) => new Set((norm(s).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []));
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };

/** Reads one category file. Nothing is thrown: the problems come back with the line they are on. */
export function parseFile(text, file = '') {
  const out = { file, title: '', category: '', tracks: [], problems: [] };
  const bad = (line, msg) => out.problems.push({ level: 'error', file, line, msg });
  let cur = null, expectMeta = false;
  text.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const line = i + 1, s = raw.trim();
    if (!s) return;
    let m;
    if ((m = s.match(/^# (.+)$/))) { if (out.title) bad(line, 'a second category heading'); out.title = m[1].trim(); return; }
    if ((m = s.match(/^<!--\s*category:\s*([\w-]+)\s*-->$/))) { out.category = m[1]; return; }
    if ((m = s.match(/^## (.+)$/))) { cur = { title: m[1].trim(), id: '', match: '', kind: '', line, questions: [] }; out.tracks.push(cur); expectMeta = true; return; }
    if ((m = s.match(/^<!--(.*)-->$/))) {
      if (!cur || !expectMeta) { bad(line, 'a comment that belongs to no track heading'); return; }
      expectMeta = false;
      for (const part of m[1].split(';')) {
        const kv = part.match(/^\s*(id|match|kind)\s*:\s*(.*?)\s*$/);
        if (kv) cur[kv[1]] = kv[2]; else if (part.trim()) bad(line, 'unknown part in the track comment: ' + part.trim());
      }
      return;
    }
    if ((m = s.match(/^- \[([^\]]+)\]\s*(.+)$/))) {
      if (!cur) { bad(line, 'a question before any track heading'); return; }
      expectMeta = false;
      cur.questions.push({ tag: m[1].trim(), text: m[2].trim(), line });
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

/** Everything the bank has to satisfy. Returns { errors, warnings } as lists of { file, line, msg }. */
export function validate(files) {
  const errors = [], warnings = [];
  const err = (file, line, msg) => errors.push({ file, line, msg });
  const warn = (file, line, msg) => warnings.push({ file, line, msg });
  for (const f of files) f.problems.forEach((p) => err(p.file, p.line, p.msg));

  const seenCat = new Map(), seenTrack = new Map(), seenQ = new Map(), all = [];
  for (const f of files) {
    if (f.category) {
      if (!CATEGORIES.includes(f.category)) err(f.file, 1, 'unknown category id ' + f.category);
      if (seenCat.has(f.category)) err(f.file, 1, `category ${f.category} is also in ${seenCat.get(f.category)}`);
      seenCat.set(f.category, f.file);
    }
    for (const t of f.tracks) {
      const at = (msg, level = err) => level(f.file, t.line, `[${t.id || t.title}] ${msg}`);
      if (!/^[a-z][a-z0-9-]*$/.test(t.id)) at('the track needs an id in ASCII (a-z, 0-9, -)');
      if (seenTrack.has(t.id)) at(`id ${t.id} is also in ${seenTrack.get(t.id)}`);
      seenTrack.set(t.id, f.file);
      if (!KINDS.includes(t.kind)) at('kind must be one of ' + KINDS.join(', '));
      if (t.match) { try { new RegExp(t.match); } catch (e) { at('match is not a regular expression: ' + e.message); } }
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
  return { errors, warnings };
}

const fixName = (s) => norm(String(s || '')).replace(/\s*[-–]\s*/g, ' - ');

/** Which tracks cover which of the site's degrees and technician programs. */
export function coverage(files, DATA) {
  const tracks = files.flatMap((f) => f.tracks.map((t) => ({ ...t, re: t.match ? new RegExp(t.match) : null }))); // a match is written against the names as fixName() leaves them: quotes plain, a hyphen with a space on each side
  const hits = (kind, name) => tracks.filter((t) => t.kind === kind && t.re && t.re.test(fixName(name)));
  const degrees = new Map(), programs = new Map();
  const noDegree = [], noProgram = [];
  for (const d of DATA.deg) {
    const h = hits('degree', d.n);
    if (!h.length) noDegree.push(`${d.id}:${d.n}`);
    for (const t of h) degrees.set(t.id, [...(degrees.get(t.id) || []), d.id]);
  }
  DATA.mahat.forEach((m, i) => {
    const h = hits('mahat', m.n);
    if (!h.length) noProgram.push(`${i}:${m.n}`);
    for (const t of h) programs.set(t.id, [...(programs.get(t.id) || []), i]);
  });
  const idle = tracks.filter((t) => (t.kind === 'degree' && !degrees.has(t.id)) || (t.kind === 'mahat' && !programs.has(t.id))).map((t) => t.id);
  return { degrees, programs, noDegree, noProgram, idle, nDeg: DATA.deg.length, nProg: DATA.mahat.length };
}

/** The bank as one JSON document: categories, tracks (with the site's degree ids and program numbers they cover) and questions. */
export function build(files, cov = null) {
  const bank = { version: 1, categories: [], tracks: [], questions: [] };
  for (const f of files) {
    bank.categories.push({ id: f.category, title: f.title, file: f.file });
    for (const t of f.tracks) {
      bank.tracks.push({ id: t.id, title: t.title, category: f.category, kind: t.kind, ...(t.match ? { match: t.match } : {}),
        ...(cov && cov.degrees.has(t.id) ? { degrees: cov.degrees.get(t.id) } : {}), ...(cov && cov.programs.has(t.id) ? { programs: cov.programs.get(t.id) } : {}) });
      for (const q of t.questions) bank.questions.push({ id: t.id + '.' + createHash('sha1').update(key(q.text)).digest('hex').slice(0, 6), track: t.id, tag: q.tag, q: q.text });
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
  const { errors, warnings } = validate(files);
  let cov = null;
  try { cov = coverage(files, loadSite().DATA); } catch (e) { warnings.push({ file: 'index.html', line: 0, msg: 'the site data could not be read, so coverage was not checked: ' + e.message }); }
  if (cov && flag('--strict')) {
    for (const x of cov.noDegree) errors.push({ file: 'index.html', line: 0, msg: 'a degree of the site has no track: ' + x });
    for (const x of cov.noProgram) errors.push({ file: 'index.html', line: 0, msg: 'a technician program of the site has no track: ' + x });
  }
  const bank = build(files, cov);
  if (!flag('--check') && !errors.length) writeFileSync(join(ROOT, 'bank.json'), JSON.stringify(bank, null, 1) + '\n');

  const count = (f) => f.tracks.reduce((n, t) => n + t.questions.length, 0);
  const report = {
    questions: bank.questions.length, tracks: bank.tracks.length,
    byCategory: files.map((f) => ({ category: f.category, title: f.title, tracks: f.tracks.length, questions: count(f) })),
    byTag: Object.fromEntries(TAGS.map((t) => [t, bank.questions.filter((q) => q.tag === t).length])),
    coverage: cov && { degreesCovered: cov.nDeg - cov.noDegree.length, degrees: cov.nDeg, programsCovered: cov.nProg - cov.noProgram.length, programs: cov.nProg, degreesWithoutTrack: cov.noDegree, programsWithoutTrack: cov.noProgram, tracksThatMatchNothing: cov.idle },
    errors, warnings,
  };
  if (flag('--json')) console.log(JSON.stringify(report, null, 1));
  else {
    console.log(`${report.questions} questions in ${report.tracks} tracks`);
    for (const c of report.byCategory) console.log(`  ${String(c.questions).padStart(4)}  ${String(c.tracks).padStart(3)} tracks  ${c.category.padEnd(7)} ${c.title}`);
    console.log('  by side: ' + TAGS.map((t) => `${t} ${report.byTag[t]}`).join(' · '));
    if (cov) {
      console.log(`  degrees of the site with a track: ${report.coverage.degreesCovered}/${cov.nDeg}; technician programs: ${report.coverage.programsCovered}/${cov.nProg}`);
      if (cov.noDegree.length) console.log('  no track for degrees: ' + cov.noDegree.slice(0, 40).join(' | ') + (cov.noDegree.length > 40 ? ` ... (+${cov.noDegree.length - 40})` : ''));
      if (cov.noProgram.length) console.log('  no track for programs: ' + cov.noProgram.join(' | '));
      if (cov.idle.length) console.log('  tracks whose match finds nothing in the site: ' + cov.idle.join(', '));
    }
    for (const w of warnings.slice(0, 60)) console.log(`  warning ${w.file}:${w.line} ${w.msg}`);
    if (warnings.length > 60) console.log(`  ... and ${warnings.length - 60} more warnings`);
    for (const e of errors.slice(0, 80)) console.log(`  ERROR ${e.file}:${e.line} ${e.msg}`);
    if (errors.length > 80) console.log(`  ... and ${errors.length - 80} more errors`);
  }
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
