// Reads the data that is embedded in index.html (the site has no server and no build step).
//   DATA   - the JSON object on the `const DATA = {...};` line
//   sources() - every official page the data was taken from, with what it is used for
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// VECTOR_SITE lets the tests (and a maintainer) point the tools at another copy of the file
export const SITE = process.env.VECTOR_SITE || fileURLToPath(new URL('../../index.html', import.meta.url));

export function loadSite(file = SITE) {
  const html = readFileSync(file, 'utf8');
  const m = html.match(/^const DATA = (.*);\s*$/m);
  if (!m) throw new Error('the `const DATA = ...;` line was not found in ' + file);
  return { html, DATA: JSON.parse(m[1]) };
}

/** The names Avodata uses for institutions, mapped to the ids of the site (the table AVN of index.html: a field lists its institutions by these names). */
export function avodataInstitutions(html) {
  const m = html.match(/const AVN=(\{[^}]*\})/);
  if (!m) throw new Error('the table AVN was not found in index.html');
  return Function('return ' + m[1])();
}

const isUrl = (u) => typeof u === 'string' && /^https?:\/\//.test(u);

/** Every URL the data points at, deduplicated, each with the kind of data it feeds. */
export function sources({ html, DATA }) {
  const out = new Map();
  const add = (url, kind, who) => {
    if (!isUrl(url)) return;
    const key = url.replace(/#.*$/, '');
    const cur = out.get(key) || { url: key, kinds: new Set(), who: new Set() };
    cur.kinds.add(kind);
    if (who) cur.who.add(who);
    out.set(key, cur);
  };
  // institutions: their own site (not watched for changes: it is a home page) and the Council's page
  for (const i of DATA.inst) { add(i.site, 'home', i.id); }
  // numeric thresholds of the five universities that publish a table
  for (const [id, t] of Object.entries(DATA.thr || {})) {
    add(t.src, 'thresholds', id); add(t.calc, 'calculator', id); add(t.sheet, 'thresholds', id);
  }
  // per-row links of a threshold table
  for (const d of DATA.deg) for (const [i, rows] of Object.entries(d.th || {})) for (const r of rows) add(r.url, 'thresholds', i);
  // admission texts of the colleges: { institution: { p: {program: {u, l}}, g: [{u, l}] } }
  const walk = (x, inst) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach((y) => walk(y, inst));
    if (isUrl(x.u)) add(x.u, 'admission', inst);
    for (const v of Object.values(x)) if (v && typeof v === 'object') walk(v, inst);
  };
  for (const [i, a] of Object.entries(DATA.adm || {})) walk(a, i);
  // registration pages of the last published cycle and the hand-written facts (exam dates, fees, rules)
  for (const m of html.matchAll(/REGD\s*=\s*\{[\s\S]*?\n\};?/g)) for (const u of m[0].matchAll(/src:'(https?:[^']+)'/g)) add(u[1], 'registration', 'REGD');
  for (const m of html.matchAll(/\{id:'([\w.-]+)',t:'[^']*'[^\n]*?src:'(https?:[^']+)'/g)) add(m[2], 'fact', m[1]);
  return [...out.values()].map((s) => ({ url: s.url, kinds: [...s.kinds].sort(), who: [...s.who].sort() }));
}
