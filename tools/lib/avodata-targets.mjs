// The Avodata pages that the data of the site points at: the pages tools/avodata-collect.console.js reads and tools/verify-avodata.mjs compares with index.html.
//   Academic/<id>        a field of study            DATA.af         (a degree reaches its pay, employment and occupations through `av`)
//   isco_group/<id>      an occupation               DATA.oc
//   MahatEducation/<id>  a technician track          DATA.mahatAv
// and the pages that list them (the home page and the three lists), which show whether Avodata has pages that the data does not know.

export const KINDS = ['Academic', 'isco_group', 'MahatEducation'];
export const INDEX = [['home', '/'], ['Academic', '/Academic'], ['isco_group', '/isco_group'], ['MahatEducation', '/MahatEducation']];

const byNumber = (a, b) => a - b || (a < b ? -1 : a > b ? 1 : 0);

/** { Academic: [ids], isco_group: [ids], MahatEducation: [ids] } of the data, each sorted */
export function targets(DATA) {
  const ids = (x) => x.map(String).sort(byNumber);
  return { Academic: ids(Object.keys(DATA.af)), isco_group: ids(Object.keys(DATA.oc)), MahatEducation: ids(DATA.mahatAv.map((a) => a.id)) };
}

export const pagePath = (kind, id) => `/${kind}/${id}`;

const MARK = /(\/\*targets\*\/)[\s\S]*?(\/\*end\*\/)/;

/** The text of the collector with its list of pages replaced by `t` (the list sits between the marks `targets` and `end`). */
export function stamp(script, t) {
  if (!MARK.test(script)) throw new Error('the marks /*targets*/ ... /*end*/ were not found in the collector');
  return script.replace(MARK, (_, a, b) => a + JSON.stringify(t) + b);
}

/** The list of pages that the collector holds. */
export function stamped(script) {
  const m = script.match(MARK);
  if (!m) throw new Error('the marks /*targets*/ ... /*end*/ were not found in the collector');
  return JSON.parse(m[0].slice(m[1].length, m[0].length - m[2].length));
}
