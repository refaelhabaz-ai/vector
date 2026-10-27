#!/usr/bin/env node
// Connects degrees to the Avodata field that describes them, where the match is clear and the degree has none (or has a worse one).
//
// A degree page shows pay, employment, where the graduates work and the regional map only if the degree points at an Avodata field (`av`, and `avHow`: how the match was made).
// A degree that points at nothing says so on its page. Most of them are small or new programs that Avodata has no field for. This table is for the rest:
// a degree whose name is the name of a field spelled differently, or a degree whose subject is the subject of a field and whose institution Avodata's own list of the field names
// (the field lists the very institutions that offer the degree). Where there is no institution to compare, the subject alone has to be the same.
//   exact: the same name (a hyphen, a spelling, an article apart)       syn: the same subject under another name; the page says "the nearest field"
// A row may carry a fifth element, `from`: the field the degree points at now, which this row replaces (a worse match made when the data was collected). Without it a degree
// that already has a field is never changed.
//
//   node tools/map-avodata.mjs            write the connections into index.html
//   node tools/map-avodata.mjs --check    exit 1 if index.html does not hold them
//   node tools/map-avodata.mjs --report   print what would change
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
  // theatre, music, film, design: the field lists the institution that offers the degree
  ['d47', '320', 'syn', 'לימודי תיאטרון (Western Galilee): theatre; the field lists the college'],
  ['d327', '320', 'syn', 'לימודי תיאטרון ופרפורמנס (Haifa): theatre; the field lists Haifa'],
  ['d279', '320', 'syn', 'אמנות התאטרון (Tel Aviv): theatre; the field lists Tel Aviv'],
  ['d442', '310', 'syn', 'זמרה (the Jerusalem Academy of Music and Dance): music; the field lists the Academy'],
  ['d443', '310', 'syn', 'כלי מיתר (the Academy): music; the field lists the Academy'],
  ['d444', '310', 'syn', 'כלי מקלדת (the Academy): music; the field lists the Academy'],
  ['d445', '310', 'syn', 'כלי נשיפה והקשה (the Academy): music; the field lists the Academy'],
  ['d449', '310', 'syn', 'ניצוח (the Academy): music; the field lists the Academy'],
  ['d450', '310', 'syn', 'קומפוזיציה (the Academy): music; the field lists the Academy'],
  ['d451', '323', 'syn', 'אמנויות המסך (Bezalel): film and television; the field lists Bezalel'],
  ['d548', '323', 'syn', 'אמנויות הקול והמסך (Sapir): film and television; the field lists Sapir'],
  ['d455', '343', 'syn', 'צורפות ואופנה (Bezalel): the jewellery department; the field lists Bezalel'],
  ['d594', '349', 'exact', '"עיצוב פנים מבנה וסביבה" is the name of the field without its hyphen, and the field lists Shenkar', '370'],
  // government, management, communication, education
  ['d589', '420', 'syn', 'ממשל (Reichman): government, political science; the field lists Reichman'],
  ['d550', '530', 'syn', 'מנהל ומדיניות ציבורית: public administration'],
  ['d586', '500', 'syn', 'יזמות (Reichman): business administration; the field lists Reichman'],
  ['d424', '500', 'syn', 'יזמות וחדשנות: entrepreneurship, taught in the school of management'],
  ['d575', '500', 'syn', 'חדשנות ויזמות: entrepreneurship, taught in the school of management'],
  ['d434', '931', 'syn', 'ניהול מערכות מידע: information systems'],
  ['d677', '494', 'syn', 'פרסום ותקשורת שיווקית (Ono): communication; the field lists Ono'],
  ['d324', '204', 'syn', 'ייעוץ והתפתחות האדם (Haifa): counselling; the field lists Haifa'],
  ['d360', '200', 'syn', 'יסודות החינוך (Bar-Ilan): education; the field lists Bar-Ilan'],
  ['d374', '200', 'syn', 'מנהיגות וניהול מערכות חינוך (Bar-Ilan): education; the field lists Bar-Ilan'],
  ['d330', '200', 'syn', 'מדעי הלמידה וההוראה (Haifa): education'],
  // teacher training: the name says it, like the 108 other degrees of the field
  ['h59', '210', 'syn', 'הגיל הרך – הכשרה להוראה: teacher training; the field of early childhood has no figures', '248'],
  ['h471', '210', 'syn', 'הגיל הרך בחברה הערבית – הכשרה להוראה: teacher training', '248'],
  ['h561', '210', 'syn', 'הגיל הרך במגזר הבדואי – הכשרה להוראה: teacher training', '248'],
  ['h628', '210', 'syn', 'חינוך מוזיקלי ריתמוס – הכשרה להוראה: teacher training', '248'],
  // life sciences: a subject of the field, at an institution the field lists
  ['d198', '1204', 'syn', 'אגרואקולוגיה ובריאות הצמח (Hebrew University): plant sciences; the field lists the Hebrew University'],
  ['d199', '1204', 'syn', 'אגרואקולוגיה, בריאות הצמח וביוטכנולוגיה (Hebrew University): plant sciences; the field lists the Hebrew University'],
  ['d282', '1100', 'syn', 'ביולוגיה/אקולוגיה ובאבולוציה (Tel Aviv): biology; the field lists Tel Aviv'],
  ['d346', '1100', 'syn', 'בוטניקה (Bar-Ilan): botany is biology; the field lists Bar-Ilan'],
  ['d373', '1100', 'syn', 'מיקרוביולוגיה (Bar-Ilan): microbiology is biology; the field lists Bar-Ilan'],
  ['d147', '1342', 'syn', 'הנדסת ביוטכנולוגיה ומזון (Technion): the same two words as "הנדסת מזון וביוטכנולוגיה", which lists the Technion; the field it had is that of Ben-Gurion', '1393'],
  // humanities
  ['d218', '123', 'syn', 'לימודים ספרדיים ולטינו-אמריקניים (Hebrew University): Romance studies; the field lists the Hebrew University'],
  ['d381', '102', 'syn', 'ספרות עם ישראל (Bar-Ilan): Hebrew literature; the field lists Bar-Ilan'],
  ['d386', '408', 'syn', 'פכ"מ (Bar-Ilan): philosophy, economics and political science, the program of the field'],
  ['d389', '3', 'syn', 'רב-תחומי במדעי היהדות (Bar-Ilan): Jewish studies; the field lists Bar-Ilan'],
  // multidisciplinary programs: the field of the same name, at an institution the field lists where it lists one
  ['d33', '1500', 'syn', 'רב תחומי במדעי החברה והרוח: the field of interdisciplinary humanities and social sciences'],
  ['d41', '1500', 'syn', 'לימודים רב תחומיים: the field of interdisciplinary humanities and social sciences'],
  ['d252', '1500', 'syn', 'תכנית רב תחומית במדעי הרוח (Hebrew University): the field lists the Hebrew University'],
  ['d288', '1500', 'syn', 'התכנית הרב תחומית במדעי הרוח (Tel Aviv): the field lists Tel Aviv'],
  ['d201', '1500', 'syn', 'אמירים (מדעי הרוח) (Hebrew University): interdisciplinary humanities; the field lists the Hebrew University'],
  ['d556', '480', 'syn', 'רב תחומי במדעי החברה (Emek Yezreel): the field lists the college'],
  ['d390', '480', 'syn', 'רב-תחומי מדעי החברה (Bar-Ilan): the field lists Bar-Ilan'],
  ['d375', '491', 'syn', 'משולב מדעי החברה (Bar-Ilan): the field is the combined program of Bar-Ilan'],
  ['d287', '302', 'syn', 'התכנית הרב תחומית באמנויות (Tel Aviv): the field lists Tel Aviv'],
  ['d189', '1550', 'syn', 'מדעי הרוח (Open University): the field is the humanities of the Open University'],
  ['d180', '1550', 'syn', 'לימודים כלליים במדעי הרוח (Open University): the humanities of the Open University'],
  ['d179', '1600', 'syn', 'לימודים כלליים במדעי החברה (Open University): the social sciences of the Open University'],
  ['d178', '1650', 'syn', 'לימודים כלליים (Open University): the humanities and social sciences of the Open University'],
  // artificial intelligence: the programs of the computer science and engineering departments (new programs: the page says there are no graduates to measure yet).
  // Not connected on purpose: "מדעים דיגיטליים להיי טק" (Tel Aviv) is a second major to study together with another field, not a degree in computer science.
  ['d206', '930', 'syn', 'בינה מלאכותית (four universities): computer science; the field lists them'],
  ['d352', '930', 'syn', 'בינה מלאכותית חישובית (Bar-Ilan): computer science; the field lists Bar-Ilan'],
  ['d585', '930', 'syn', 'בינה מלאכותית ולמידה חישובית (Reichman): computer science; the field lists Reichman'],
  ['d176', '930', 'syn', 'יישומי מערכות נבונות (Open University): computer science; the field lists the Open University'],
  ['d544', '930', 'syn', 'יישום מדעי הנתונים ובינה מלאכותית (Tel Aviv-Yaffo college): computer science; the field lists the college'],
  ['d592', '1322', 'syn', 'מערכות בינה מלאכותית (Shenkar): computer engineering; the field lists Shenkar'],
  ['d497', '1322', 'syn', 'הנדסת מערכות בינה מלאכותית (Qiryat Shmona): computer engineering'],
];

/** Sets the connections that are missing, and replaces the ones a row names with `from`. Returns what it set and what it left (a degree that already has another field). */
export function mapDegrees(DATA, table = MAP) {
  const out = { set: [], kept: [], missing: [] };
  const byId = new Map(DATA.deg.map((d) => [d.id, d]));
  for (const [id, av, how, , from] of table) {
    const d = byId.get(id);
    if (!d || !DATA.af[av]) { out.missing.push(id + '->' + av); continue; }
    if (d.av === av && d.avHow === how) continue;
    if (d.av && d.av !== from) { out.kept.push(`${id} ${d.n}: already ${d.av} (${d.avHow})`); continue; }
    const was = d.av ? ` (was ${d.av})` : '';
    d.av = av; d.avHow = how; out.set.push(`${id} ${d.n} -> ${av} ${DATA.af[av].n} (${how})${was}`);
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
