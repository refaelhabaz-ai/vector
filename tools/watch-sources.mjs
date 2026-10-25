#!/usr/bin/env node
// Watches the official pages the data was taken from (admission conditions, threshold tables, registration dates, exam dates).
// Every run it fetches each page, reduces it to its text, and keeps a fingerprint of it. A page whose text changed is recorded with its date.
// Over the weeks this builds, per institution, the answer to "how often does it change its admission conditions", and a list of the pages
// that changed after the site's data was collected (the pages to re-read before the next registration season).
//
//   node tools/watch-sources.mjs --state data/watch --report data/watch/report.md
//   options:  --only thresholds,admission,registration,fact,calculator   (default: all but the institutions' home pages)
//             --limit N  --concurrency 6  --timeout 20000  --delay 400  (ms between two requests to one host)
//             --today YYYY-MM-DD   --json   --fail-on-change
//
// It never edits index.html. tools/apply-watch.mjs writes the result into the site's data when you decide to.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadSite, sources } from './lib/site-data.mjs';

// ---------- pure helpers (tested in tools/test/watch.test.mjs) ----------

/** The text of a page, without what changes on every request (scripts, styles, tokens, clocks). */
export function normalizeText(html) {
  let t = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
  t = t
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ')   // uuids
    .replace(/\b[A-Za-z0-9+/_-]{28,}={0,2}/g, ' ')                                            // tokens, nonces, hashes
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?\b/g, ' ')                    // iso timestamps
    .replace(/\b\d{1,2}:\d{2}:\d{2}\b/g, ' ')                                                  // clocks
    .replace(/\s+/g, ' ').trim();
  return t;
}
export const fingerprint = (text) => createHash('sha256').update(text).digest('hex');

const DAY = 864e5;
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / DAY);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** One observation of one page folded into its record. obs = { ok, status, hash, len, etag, lastModified } ; returns { rec, changed } */
export function observe(rec, obs, today) {
  rec = rec || { first: today, last: null, lastOk: null, lastChanged: null, hash: null, len: 0, observed: 0, fails: 0, failStreak: 0, status: 'new', history: [] };
  rec.last = today;
  if (!obs.ok) {
    rec.fails++; rec.failStreak++; rec.status = obs.status === 403 || obs.status === 429 || obs.status === 503 ? 'blocked' : 'fail'; rec.lastStatus = obs.status || 0;
    return { rec, changed: false };
  }
  rec.failStreak = 0; rec.status = 'ok'; rec.lastOk = today; rec.observed++;
  if (obs.etag !== undefined) rec.etag = obs.etag;
  if (obs.lastModified !== undefined) rec.lastModified = obs.lastModified;
  if (obs.notModified) return { rec, changed: false };
  let changed = false;
  if (rec.hash === null) { rec.history.push({ t: today, h: obs.hash.slice(0, 12), len: obs.len, init: 1 }); }
  else if (rec.hash !== obs.hash) { changed = true; rec.lastChanged = today; rec.history.push({ t: today, h: obs.hash.slice(0, 12), len: obs.len, from: rec.len }); }
  rec.hash = obs.hash; rec.len = obs.len;
  if (rec.history.length > 60) rec.history = rec.history.slice(-60);
  return { rec, changed };
}

/** How often a page changes: the number of recorded changes, the typical gap, and how fresh the last change is. */
export function cadence(rec, today) {
  const ch = rec.history.filter((x) => !x.init).map((x) => x.t);
  const within = (n) => ch.filter((t) => daysBetween(t, today) <= n).length;
  const gaps = ch.slice(1).map((t, i) => daysBetween(ch[i], t));
  const spanDays = rec.first ? Math.max(1, daysBetween(rec.first, today)) : 1;
  let cls;
  if (rec.observed < 3) cls = 'unknown';
  else if (within(90) >= 6 || (rec.observed >= 5 && within(30) >= rec.observed - 1)) cls = 'volatile';     // changes on almost every look: a dynamic page, not a change of conditions
  else if (rec.lastChanged && daysBetween(rec.lastChanged, today) <= 45) cls = 'active';
  else if (spanDays >= 120 && ch.length === 0) cls = 'stable';
  else cls = 'quiet';
  const per = ch.length ? Math.round((ch.length / spanDays) * 365 * 10) / 10 : 0;
  const every = { volatile: 14, active: 7, quiet: 21, stable: 45, unknown: 14 }[cls];
  return { cls, changes: ch.length, changes90: within(90), changes365: within(365), perYear: per, medianGap: median(gaps), spanDays, every, lastChanged: rec.lastChanged };
}

// ---------- fetching ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function fetchPage(url, { timeout = 20000, etag, lastModified, ua = 'VectorSourceWatch/1.0 (+https://github.com/refaelhabaz-ai/vector)' } = {}) {
  const headers = { 'user-agent': ua, 'accept-language': 'he,en;q=0.7', accept: 'text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5' };
  if (etag) headers['if-none-match'] = etag;
  if (lastModified) headers['if-modified-since'] = lastModified;
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
    if (res.status === 304) return { ok: true, notModified: true, status: 304, etag, lastModified };
    if (!res.ok) return { ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || '';
    // a PDF or other binary: fingerprint the bytes; HTML or text: fingerprint the normalized text
    const text = /html|text|json|xml/i.test(type) || !type ? normalizeText(buf.toString('utf8')) : buf.toString('latin1');
    return { ok: true, status: res.status, hash: fingerprint(text), len: text.length, etag: res.headers.get('etag') || undefined, lastModified: res.headers.get('last-modified') || undefined };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.cause && e.cause.code || e && e.name || e) };
  }
}

/** Runs fn over items with a limit on parallel work and a pause between two requests to the same host. */
async function pool(items, n, delay, fn) {
  const lastHit = new Map(); let i = 0; const out = new Array(items.length);
  const worker = async () => {
    while (i < items.length) {
      const k = i++; const host = new URL(items[k].url).host;
      const wait = (lastHit.get(host) || 0) + delay - Date.now(); lastHit.set(host, Math.max(Date.now(), (lastHit.get(host) || 0) + delay));
      if (wait > 0) await sleep(wait);
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

// ---------- the run ----------

export function loadState(dir) {
  const f = `${dir}/state.json`;
  if (!existsSync(f)) return { v: 1, sources: {} };
  const s = JSON.parse(readFileSync(f, 'utf8'));
  return s && s.v === 1 && s.sources ? s : { v: 1, sources: {} };
}
export function saveState(dir, state) { mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/state.json`, JSON.stringify(state)); }

export async function watch({ list, state, today, fetcher = fetchPage, concurrency = 6, delay = 400, timeout = 20000 }) {
  const changed = [], failed = [];
  await pool(list, concurrency, delay, async (s) => {
    const prev = state.sources[s.url];
    const obs = await fetcher(s.url, { timeout, etag: prev && prev.etag, lastModified: prev && prev.lastModified });
    const { rec, changed: ch } = observe(prev, obs, today);
    rec.kinds = s.kinds; rec.who = s.who;
    state.sources[s.url] = rec;
    if (ch) changed.push(s.url);
    if (!obs.ok) failed.push(s.url);
  });
  state.checked = today;
  return { changed, failed };
}

// ---------- the report ----------

const CLS_HE = { volatile: 'משתנה כמעט בכל בדיקה (כנראה דף דינמי, לא שינוי תנאים)', active: 'השתנה בחודש וחצי האחרונים', quiet: 'שינויים נדירים', stable: 'לא השתנה מאז שהתחלנו לעקוב', unknown: 'עוד אין מספיק בדיקות (צריך 3 לפחות)' };
const KIND_HE = { thresholds: 'ספי קבלה', admission: 'תנאי קבלה', registration: 'מועדי הרשמה', fact: 'עובדה (מועד, סכום, כלל)', calculator: 'מחשבון רשמי', home: 'דף הבית' };

export function buildReport({ state, DATA, today, changedNow, failedNow }) {
  const INST = new Map(DATA.inst.map((i) => [i.id, i.n]));
  const recs = Object.entries(state.sources).map(([url, r]) => ({ url, r, c: cadence(r, today) }));
  const L = [];
  L.push(`# בדיקת מקורות הנתונים · ${today}`, '');
  const ok = recs.filter((x) => x.r.status === 'ok').length;
  L.push(`נבדקו ${recs.length} דפי מקור: ${ok} נקראו בהצלחה, ${recs.length - ok} לא נגישים או חסומים. הנתונים באתר נאספו ב-${DATA.built}.`, '');
  // 1. what changed after the data was collected
  const since = recs.filter((x) => x.r.lastChanged && x.r.lastChanged >= DATA.built && x.c.cls !== 'volatile').sort((a, b) => b.r.lastChanged.localeCompare(a.r.lastChanged));
  L.push(`## דפים שהשתנו אחרי איסוף הנתונים (${DATA.built})`, '');
  if (!since.length) L.push('אין. עד כה לא זוהה שינוי בטקסט של דף מקור.', '');
  else {
    L.push('כדאי לקרוא שוב את הדפים האלה ולעדכן את הנתונים אם צריך:', '', '| מוסד | סוג | השתנה | הדף |', '|---|---|---|---|');
    for (const x of since) L.push(`| ${(x.r.who || []).map((w) => INST.get(w) || w).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(', ')} | ${(x.r.kinds || []).map((k) => KIND_HE[k] || k).join(', ')} | ${x.r.lastChanged} | ${x.url} |`);
    L.push('');
  }
  // 2. how often each institution changes its pages
  const byInst = new Map();
  for (const x of recs) {
    if (!(x.r.kinds || []).some((k) => k === 'thresholds' || k === 'admission' || k === 'registration')) continue;
    for (const w of x.r.who || []) {
      if (!INST.has(w)) continue;
      const a = byInst.get(w) || { pages: 0, observed: 0, changes365: 0, perYear: 0, last: '' };
      a.pages++; a.observed = Math.max(a.observed, x.r.observed); a.changes365 += x.c.cls === 'volatile' ? 0 : x.c.changes365; a.perYear += x.c.cls === 'volatile' ? 0 : x.c.perYear;
      if (x.r.lastChanged && x.r.lastChanged > a.last && x.c.cls !== 'volatile') a.last = x.r.lastChanged;
      byInst.set(w, a);
    }
  }
  L.push('## באיזו תדירות כל מוסד משנה את דפי התנאים', '');
  const rows = [...byInst.entries()].sort((a, b) => b[1].perYear - a[1].perYear);
  const enough = rows.filter(([, a]) => a.observed >= 3);
  if (!enough.length) L.push('עוד אין מספיק בדיקות כדי לדבר על תדירות (צריך לפחות 3 בדיקות לכל דף, בהפרש של שבוע). הטבלה תתמלא ככל שהכלי ירוץ.', '');
  else {
    L.push('| מוסד | דפים במעקב | שינויים בשנה (סכום הדפים) | שינוי אחרון |', '|---|---|---|---|');
    for (const [id, a] of enough) L.push(`| ${INST.get(id)} | ${a.pages} | ${Math.round(a.perYear * 10) / 10} | ${a.last || '—'} |`);
    L.push('', 'הערה: ספירה לפי טקסט הדף. שינוי קטן (תאריך בתחתית הדף) נספר כמו שינוי של סף, ולכן זה מדד לתדירות לבדוק מחדש ולא לשינוי בתנאים עצמם.', '');
  }
  // 3. classes and the recommended interval
  const cnt = {}; recs.forEach((x) => { cnt[x.c.cls] = (cnt[x.c.cls] || 0) + 1; });
  L.push('## סוגי הדפים', '', ...Object.entries(CLS_HE).map(([k, v]) => `- ${v}: ${cnt[k] || 0}`), '');
  const noisy = recs.filter((x) => x.c.cls === 'volatile');
  if (noisy.length) L.push(`### דפים שמשתנים בכל בדיקה (${noisy.length})`, '', 'ייתכן שהם כוללים תוכן דינמי. כדאי לבדוק אותם ידנית ולהחליט אם להוציא אותם מהמעקב.', '', ...noisy.slice(0, 15).map((x) => `- ${x.url}`), '');
  // 4. what could not be read
  const bad = recs.filter((x) => x.r.status !== 'ok');
  if (bad.length) {
    L.push(`## דפים שלא נקראו (${bad.length})`, '', 'חסימה (403/429) משמעותה בדרך כלל CAPTCHA או הגבלת קצב: את הדפים האלה בודקים ידנית.', '');
    for (const x of bad.slice(0, 40)) L.push(`- ${x.r.lastStatus || 'שגיאת רשת'} · ${x.r.failStreak} בדיקות רצופות · ${x.url}`);
    L.push('');
  }
  if (changedNow && changedNow.length) L.push(`בריצה הזו זוהו ${changedNow.length} שינויים חדשים.`, '');
  return L.join('\n');
}

// ---------- cli ----------

async function main() {
  const args = process.argv.slice(2);
  const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const dir = val('--state', 'data/watch');
  const today = val('--today', new Date().toISOString().slice(0, 10));
  const only = new Set((val('--only', '') || 'thresholds,admission,registration,fact,calculator').split(',').filter(Boolean));
  const site = loadSite();
  let list = sources(site).filter((s) => s.kinds.some((k) => only.has(k)));
  if (val('--limit', '')) list = list.slice(0, +val('--limit', 0));
  const state = loadState(dir);
  console.error(`${list.length} sources, state in ${dir}`);
  const res = await watch({ list, state, today, concurrency: +val('--concurrency', 6), delay: +val('--delay', 400), timeout: +val('--timeout', 20000) });
  saveState(dir, state);
  const report = buildReport({ state, DATA: site.DATA, today, changedNow: res.changed, failedNow: res.failed });
  if (val('--report', '')) { mkdirSync(val('--report').replace(/\/[^/]*$/, '') || '.', { recursive: true }); writeFileSync(val('--report'), report + '\n'); }
  if (args.includes('--json')) console.log(JSON.stringify({ today, checked: list.length, changed: res.changed, failed: res.failed.length }, null, 1));
  else console.log(report);
  process.exit(args.includes('--fail-on-change') && res.changed.length ? 2 : 0);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
