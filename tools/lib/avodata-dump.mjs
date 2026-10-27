// Reads what tools/avodata-collect.console.js saved (a zip file, or the folder it was unpacked to) and turns each page into something that can be searched:
// the text, the numbers and the links that the page held, wherever they sat (the text of the page, a table, the label of a chart, an answer of the site's servers).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

// ---------- zip (the collector writes stored or deflated entries; nothing else is needed) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** { name: Buffer } of the entries of a zip file; throws on a damaged file (so that a cut download is not read as a short run) */
export function readZip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip file (no end record: was the download cut?)');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  const out = new Map();
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('damaged zip: central directory');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), at = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28), raw = buf.subarray(start, start + csize);
    if (method !== 0 && method !== 8) throw new Error(`zip entry ${name}: unsupported method ${method}`);
    const data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
    if (data.length !== usize || crc32(data) !== crc) throw new Error(`zip entry ${name} is damaged (size or checksum)`);
    out.set(name, data);
    p += 46 + nl + el + cl;
  }
  return out;
}

/** The run: { meta, pages: Map('Academic/38' -> record), problems: [..] }. `path` is the zip file or the folder (with pages/*.json) it was unpacked to. */
export function readDump(path) {
  const files = new Map();                                               // 'pages/Academic-38.json' -> text
  if (statSync(path).isDirectory()) {
    const walk = (dir, pre) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, pre + f + '/'); else if (/\.json$/.test(f)) files.set(pre + f, readFileSync(p, 'utf8')); } };
    walk(path, '');
  } else for (const [name, data] of readZip(readFileSync(path))) files.set(name, data.toString('utf8'));
  const problems = [];
  const parse = (name) => { try { return JSON.parse(files.get(name)); } catch (e) { problems.push(`${name} is not valid JSON: ${e.message}`); return null; } };
  const meta = files.has('meta.json') ? parse('meta.json') : null;
  if (!meta) problems.push('meta.json is missing');
  const shared = new Map((files.has('shared.json') ? parse('shared.json') || [] : []).map((s) => [s.id, s]));
  const pages = new Map();
  for (const name of files.keys()) {
    if (!/^pages\/.+\.json$/.test(name)) continue;
    const r = parse(name); if (!r || !r.key) continue;
    for (const x of r.net || []) if (x.ref && shared.has(x.ref)) x.r = shared.get(x.ref).r;
    pages.set(r.key, r);
  }
  return { meta, pages, problems };
}

// ---------- searching a page ----------
const MARKS = /[‎‏‪-‮⁦-⁩­֑-ׇ]/g;

/** A text reduced to what it says: no direction marks or points, one kind of quote and dash, one space, lower case. */
export const norm = (s) => String(s == null ? '' : s)
  .replace(MARKS, '').replace(/[״”“„]/g, '"').replace(/[׳’‘`´]/g, "'").replace(/[־‐‑‒–—―−]/g, '-')
  .replace(/ |\s+/g, ' ').trim().toLowerCase();

/** The numbers inside a text: 11,600 -> 11600, 46.9 -> 46.9, 92% -> 92, "1-2" -> 1 and 2 */
export function numbersIn(s) {
  const out = [];
  for (const m of String(s).matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) out.push(Number(m[0].replace(/,/g, '')));
  return out;
}

const walkJson = (v, onString, onNumber, depth = 0) => {
  if (depth > 40 || v == null) return;
  if (typeof v === 'string') return onString(v);
  if (typeof v === 'number') return onNumber(v);
  if (Array.isArray(v)) { for (const x of v) walkJson(x, onString, onNumber, depth + 1); return; }
  if (typeof v === 'object') for (const [k, x] of Object.entries(v)) { onString(k); walkJson(x, onString, onNumber, depth + 1); }
};

const KINDS = ['Academic', 'isco_group', 'MahatEducation', 'TrainingEducation'];        // the last one is the vocational courses that an occupation page lists
const PATH = new RegExp('/(' + KINDS.join('|') + ')/(\\d+)', 'g');

/**
 * What a page holds, to be searched. { text, nums, links, has(str), hasNum(n), nearest(n, within) }
 *   text   every string of the page, normalized, one after another;  lines  the same as lines (for a snapshot that must be found in order)
 *   nums   every number of the page (in a text, a cell, a label, an answer of the servers)
 *   links  { kind: Set(ids) } of the pages that this page points at
 */
export function corpus(r) {
  const strings = [], nums = new Set(), links = Object.fromEntries(KINDS.map((k) => [k, new Set()]));
  const str = (s) => { if (typeof s !== 'string' || !s) return; strings.push(s); for (const n of numbersIn(s)) nums.add(n); for (const m of s.matchAll(PATH)) links[m[1]].add(m[2]); };
  const num = (n) => { if (Number.isFinite(n)) nums.add(n); };
  const json = (v) => walkJson(v, str, num);
  str(r.title); str(r.text);
  for (const s of r.shadow || []) str(s);
  for (const t of [...(r.tables || []), ...(r.grids || [])]) for (const row of t) for (const c of row) str(c);
  for (const [href, text] of r.links || []) { str(href); str(text); }
  for (const a of r.aria || []) str(a[2]);
  for (const t of r.titles || []) str(t[1]);
  for (const s of r.svg || []) str(s);
  for (const m of r.meters || []) { str(m.text); str(m.label); str(m.near); if (m.now != null && m.now !== '') str(String(m.now)); }
  for (const c of r.controls || []) { str(c.text); str(c.label); for (const o of c.options || []) str(o[1]); }
  json(r.d3); json(r.charts); json(r.state);
  for (const s of r.scripts || []) { try { json(JSON.parse(s)); } catch (e) { str(s); } }
  for (const x of r.net || []) {
    if (typeof x.r !== 'string') continue;
    try { json(JSON.parse(x.r)); } catch (e) { str(x.r); }                // an answer that is not JSON is text
  }
  const text = strings.map(norm).join('\n');
  const lines = strings.flatMap((x) => String(x).split('\n').map(norm)).filter(Boolean);       // in the order of the page: the text first, then the tables and the labels
  const sorted = [...nums].sort((a, b) => a - b);
  return {
    text, lines, nums, links, strings,
    /** the phrase is somewhere on the page (a `$` in the data marks where the page breaks a phrase in two) */
    has: (p) => { const q = norm(String(p).replace(/\$/g, ' ')); return q.length > 0 && text.includes(q); },
    /** the number is on the page; a fraction (0.83) is also looked for as a percent (83); a decimal within 0.05 */
    hasNum: (n) => { if (nums.has(n)) return true; if (n > 0 && n < 1 && nums.has(Math.round(n * 1000) / 10)) return true; if (!Number.isInteger(n)) return sorted.some((x) => Math.abs(x - n) <= 0.05); return false; },
    /** the number on the page that is nearest to n, if it is within `within` of it (a share of n) */
    nearest: (n, within = 0.3) => { let best = null; for (const x of sorted) if (x >= 1000 === n >= 1000 && Math.abs(x - n) <= n * within && (best === null || Math.abs(x - n) < Math.abs(best - n))) best = x; return best; },
  };
}

export const exists = (p) => existsSync(p);
