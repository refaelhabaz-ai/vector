#!/usr/bin/env node
// Connects degrees to the Avodata field that describes them, where the match is clear and the degree has none.
//
// A degree page shows pay and employment only if the degree points at an Avodata field (`av`, and `avHow`: how the match was made). 160 degrees point at nothing.
// Most are small or new programs that Avodata has no field for, and they say so on their page. This table is for the rest: a degree whose name is the name of a
// field spelled differently, or a degree that Avodata's own list of institutions places in a field (the field lists the very institutions that offer the degree).
//   exact: the same name (a hyphen, a spelling, an article apart)       syn: the same subject under another name; the page says "the nearest field"
//
//   node tools/map-avodata.mjs            write the connections into index.html
//   node tools/map-avodata.mjs --check    exit 1 if index.html does not hold them
//   node tools/map-avodata.mjs --report   print what would change
// A degree that already has a field is never changed.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SITE } from './lib/site-data.mjs';
import { splitSite, joinSite, spliceChanged } from './lib/data-splice.mjs';

/** [degree, field, how, why] */
export const MAP = [
  // the same name
  ['d213', '421', 'exact', 'יחסים בין לאומיים / בין-לאומיים: a hyphen'],
  ['d251', '320', 'exact', 'תולדות התאטרון / התיאטרון: a spelling'],
  ['d146', '1330', 'exact', 'אוירונוטיקה / אוירונאוטיקה: a spelling'],
  ['d26', '410', 'exact', 'אנתרפולוגיה / אנתרופולוגיה: a spelling'],
  ['d234', '311', 'exact', 'מוסיקולוגיה / מוזיקולוגיה: a spelling'],
  ['d542', '497', 'exact', 'מדעי התנהגות / מדעי ההתנהגות: an article'],
  ['d36', '1350', 'exact', '"הנדסה תעשייה וניהול" is a typo of "הנדסת תעשייה וניהול"'],
  // software and computer engineering: the institutions of the field are the colleges and universities that offer these degrees
  ['d38', '1322', 'syn', 'הנדסת תוכנה: 11 institutions, the field lists Kinneret, Lev, Afeka, Sami Shamoon, Technion, Bar-Ilan, Ben-Gurion, the Open University'],
  ['d8', '1322', 'syn', 'הנדסת מחשבים ותכנה (Ariel): the field lists Ariel'],
  ['d155', '1322', 'syn', 'הנדסת מחשבים ותוכנה (Technion): the field lists the Technion'],
  // engineering and architecture: the field lists the institution that offers the degree
  ['d356', '1350', 'syn', 'הנדסת תעשייה ומערכות מידע (Bar-Ilan): industrial engineering, the field lists Bar-Ilan'],
  ['d278', '1361', 'syn', 'אדריכלות (Tel Aviv): the field lists Tel Aviv'],
  ['d161', '1361', 'syn', 'מדעי הארכיטקטורה (Technion): the field lists the Technion'],
  ['d296', '1382', 'syn', 'מדע והנדסה של חומרים (Tel Aviv): the field lists Tel Aviv'],
  ['d276', '1386', 'syn', 'הנדסה רפואית (Afeka): the field is biomedical engineering and lists Afeka'],
  ['d148', '1304', 'syn', 'הנדסת הסביבה (Technion): environmental engineering, the field lists the Technion only'],
  ['d156', '1306', 'syn', 'הנדסת מיפוי וגיאו-אינפורמציה (Technion): geodesy, the field lists the Technion only'],
  ['d165', '1306', 'syn', 'מיפוי וגיאו-אינפורמציה (Technion): geodesy, the field lists the Technion only'],
  // health
  ['d429', '830', 'syn', 'מדעי האחיות (סיעוד): nursing, like d0'],
  ['d554', '830', 'syn', 'מדעי האחיות (סיעוד): nursing, like d0'],
  ['d328', '830', 'syn', 'מדעי האחיות: nursing, like d0'],
  ['d541', '892', 'syn', 'מדעי האופטומטריה: optometry'],
  // sciences, management, humanities, design
  ['d18', '1000', 'syn', 'מדעי הכימיה: chemistry'],
  ['d576', '592', 'syn', 'משאבי אנוש: human resources'],
  ['d577', '536', 'syn', 'ניהול במערכות בריאות: like d25'],
  ['d332', '500', 'syn', 'ניהול עסקי: business administration, like d49'],
  ['d377', '591', 'syn', 'ניהול לוגיסטיקה: logistics'],
  ['d380', '120', 'syn', 'ספרות משווה: like d242'],
  ['d427', '1500', 'syn', 'לימודים רב תחומיים במדעי הרוח: the field of interdisciplinary humanities'],
  ['d428', '1500', 'syn', 'לימודים רב תחומיים במדעי הרוח והחברה: the field of interdisciplinary humanities'],
  ['d224', '1201', 'syn', 'מדעי בעלי החיים: animal sciences'],
  ['d225', '1201', 'syn', 'מדעי בעלי החיים וביוטכנולוגיה: animal sciences'],
  ['d504', '453', 'syn', 'לימודי קיימות: like d547'],
  ['d595', '343', 'syn', 'עיצוב תכשיטים / עיצוב תכשיטים, צורפות'],
];

/** Sets the connections that are missing. Returns what it set and what it left (a degree that already has a field). */
export function mapDegrees(DATA, table = MAP) {
  const out = { set: [], kept: [], missing: [] };
  const byId = new Map(DATA.deg.map((d) => [d.id, d]));
  for (const [id, av, how] of table) {
    const d = byId.get(id);
    if (!d || !DATA.af[av]) { out.missing.push(id + '->' + av); continue; }
    if (d.av === av && d.avHow === how) continue;
    if (d.av) { out.kept.push(`${id} ${d.n}: already ${d.av} (${d.avHow})`); continue; }
    d.av = av; d.avHow = how; out.set.push(`${id} ${d.n} -> ${av} ${DATA.af[av].n} (${how})`);
  }
  return out;
}

export function mapText(body, table = MAP) {
  const before = JSON.parse(body), after = JSON.parse(body);
  const log = mapDegrees(after, table);
  const r = spliceChanged(body, before, after, ['deg']);
  return { body: r.body, log, changed: r.changed };
}

function main() {
  const args = process.argv.slice(2), flag = (n) => args.includes(n);
  const s = splitSite(readFileSync(SITE, 'utf8'));
  const r = mapText(s.body);
  if (r.log.missing.length) { console.error('not in the data: ' + r.log.missing.join(', ')); process.exit(1); }
  if (flag('--report')) { r.log.set.forEach((x) => console.log('set  ', x)); r.log.kept.forEach((x) => console.log('kept ', x)); console.log(`${r.log.set.length} to set, ${r.log.kept.length} kept`); return; }
  if (flag('--check')) {
    if (!r.changed.length) { console.log('index.html holds the ' + MAP.length + ' connections of tools/map-avodata.mjs'); return; }
    console.error(`${r.changed.length} degrees are not connected as tools/map-avodata.mjs says: run it`); process.exit(1);
  }
  if (!r.changed.length) { console.log('nothing to change'); return; }
  writeFileSync(SITE, joinSite(s, r.body));
  console.log(`index.html: ${r.log.set.length} degrees connected to a field of Avodata`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
