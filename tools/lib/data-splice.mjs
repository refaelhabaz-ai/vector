// Writing into the `const DATA = {...};` line of index.html without touching the rest of it.
// The line was written by another program (numbers like 19.0, no spaces), so it is not read and written whole: the value of one key is found in the text,
// and only that value is replaced. Everything else in the line, and in the file, stays byte for byte as it was, and the line endings of the file are kept.
const skipString = (s, i) => { i++; while (s[i] !== '"') { if (s[i] === '\\') i++; i++; } return i + 1; };
const skipValue = (s, i) => {
  const c = s[i];
  if (c === '"') return skipString(s, i);
  if (c === '{' || c === '[') { let d = 0; for (;;) { const ch = s[i]; if (ch === '"') { i = skipString(s, i); continue; } if (ch === '{' || ch === '[') d++; else if (ch === '}' || ch === ']') { d--; if (d === 0) return i + 1; } i++; } }
  while (i < s.length && !',}]'.includes(s[i])) i++;
  return i;
};

/** [start, end) of the value at `path` (keys and array indexes) in the JSON text */
export function spanOf(s, path) {
  let start = 0, end = skipValue(s, 0);
  for (const key of path) {
    let i = start + 1, found = false;
    if (s[start] === '{') {
      for (;;) {
        if (s[i] === '}') break;
        const ke = skipString(s, i), k = JSON.parse(s.slice(i, ke)); i = ke + 1;
        const ve = skipValue(s, i);
        if (k === key) { start = i; end = ve; found = true; break; }
        i = ve; if (s[i] === ',') i++;
      }
    } else {
      let n = 0;
      for (;;) {
        if (s[i] === ']') break;
        const ve = skipValue(s, i);
        if (n === key) { start = i; end = ve; found = true; break; }
        n++; i = ve; if (s[i] === ',') i++;
      }
    }
    if (!found) throw new Error('not found in the data: ' + path.join('.'));
  }
  return [start, end];
}

/** the file split around the DATA line */
export function splitSite(text) {
  const crlf = text.includes('\r\n');
  const lines = text.split(crlf ? '\r\n' : '\n');
  const idx = lines.findIndex((l) => l.startsWith('const DATA = '));
  if (idx < 0) throw new Error('the `const DATA = ...;` line was not found');
  const m = /^(const DATA = )(.*)(;\s*)$/s.exec(lines[idx]);
  if (!m) throw new Error('the DATA line does not end with ";"');
  return { crlf, lines, idx, head: m[1], body: m[2], tail: m[3] };
}

/** the file again, with a new DATA body */
export const joinSite = (s, body) => { s.lines[s.idx] = s.head + body + s.tail; return s.lines.join(s.crlf ? '\r\n' : '\n'); };

/**
 * `before` and `after` are two parsed copies of the body (after = before, edited). Every entity (a key of `sections`, or an element of an array section)
 * whose JSON differs is replaced in the text. Returns the new body and the list of what was replaced.
 */
export function spliceChanged(body, before, after, sections) {
  let out = body;
  const changed = [];
  for (const sec of sections) {
    const keys = Array.isArray(after[sec]) ? after[sec].map((_, i) => i) : Object.keys(after[sec]);
    for (const k of keys) if (JSON.stringify(before[sec][k]) !== JSON.stringify(after[sec][k])) changed.push([sec, k]);
  }
  for (const [sec, k] of changed) {
    const [a, b] = spanOf(out, [sec, k]);
    out = out.slice(0, a) + JSON.stringify(after[sec][k]) + out.slice(b);
  }
  return { body: out, changed };
}
