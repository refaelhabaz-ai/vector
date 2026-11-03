#!/usr/bin/env node
/* Stage 2 tests: scores and results (spec chapter 9) on the three personas. Run: node tests/quiz-v2/results.js */
const {load}=require('./lib.js');const fs=require('fs'),path=require('path');
const C=load(['VQ-RESULTS']),{VQ,VQE,VQR}=C;const personas=JSON.parse(fs.readFileSync(path.join(__dirname,'personas.json'),'utf8'));
/* the occupation codes the owner gave for Daniel (the original implementation) */
const DANIEL_IDS={dirs:[['5164','1311','6113'],['5411','5413','5419'],['8341','6111','6122']],wild:'2162'};
const OCN=id=>VQR.D.oc[id].n,WN=w=>VQ.worlds.find(x=>x.id===w).n;
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL: '+m)}return c};
/* what the document says (12.2): the occupations of each direction, the surprise and "what would change the picture" */
const DOC={
 noa:{dirs:[['create',['בימוי, הפקה וניהול אומנותי','עיתונאות','עיצוב גרפי ועיצוב מולטימדיה']],['care',['שירותי דת (יהדות)','אודיולוגיה וקלינאות תקשורת','ניהול בתחום הרווחה והסעד']],['health',['ניהול בתחום שירותי הבריאות','בריאות וגיהות סביבתית ותעסוקתית','פיקוח בתחום הבריאות הסביבתית והתעסוקתית']]],wild:['biz','ייעוץ בתחום הפרסום והשיווק'],change:[],psy:[223,274]},
 itai:{dirs:[['eng',['הנדסאוּת וטכנאוּת חשמל','הנדסאוּת וטכנאוּת בתחומים אחרים','הנדסאוּת וטכנאוּת אלקטרוניקה']],['tech',['הנדסאוּת וטכנאוּת תמיכה בטכנולוגיות מידע','התקנה ושירות בענף טכנולוגיות המידע','מסדי נתונים, רשתות ואבטחת מידע']],['field',['כבאות','מכונאות מנועי כלי טיס','אבטחה ופיקוח בתחומים אחרים']]],wild:['biz','ניהול בתחום התעשייה'],change:[['הנדסת מכונות','אורך הכשרה'],['הנדסת אלקטרוניקה','אורך הכשרה']],psy:[217,274]},
 daniel:{dirs:[['nature',['טיפול וטיפוח חיות מחמד','ניהול ייצור בתחומי החקלאות והייעור','גינון וגידול צמחי גן ומשתלות']],['field',['כבאות','סוֹהרוּת','אבטחה ופיקוח בתחומים אחרים']],['hands',['הפעלת מתקנים ניידים בתחום החקלאות והייעור','גידול ירקות וגידולי שדה','גידול עופות']]],wild:['eng','אדריכלות נוף'],change:[['בריאות וגיהות סביבתית ותעסוקתית','הרבה מתמטיקה'],['וטרינריה','הרבה קריאה וכתיבה, הרבה מתמטיקה, אורך הכשרה']],psy:[225,274]}};
const norm=s=>String(s).replace(/[\u05b0-\u05c7]/g,'').replace(/\s+/g,' ').trim();
function run(name){
  const P=personas[name],steps=P.steps.slice(0,-1),st=VQE.init(P.env);
  for(const s of steps){const a={q:s.q};if(s.picks.length)a.picks=s.picks;if(s.q==='G'||s.q==='HB')a.w=VQE.rank(st.p)[0];VQE.apply(st,a)}
  return st}
for(const name of Object.keys(personas)){
  const st=run(name),R=VQR.results(st),D=DOC[name];
  console.log(`\n== ${name}: ${personas[name].who}`);
  console.log('confidence: '+R.conf+' · worlds by p: '+R.top.map(w=>w+' '+Math.round(st.p[w]*100)+'%').join(', '));
  R.dirs.forEach((d,i)=>{console.log(`direction ${i+1}: ${WN(d.world)} (${Math.round(d.p*100)}%, blend ${d.blend.toFixed(2)})  ${d.occs.map(x=>OCN(x.id)+' ['+VQR.fit(x.top)[0]+']').join(' · ')}`)});
  console.log('surprise : '+(R.wildcard?`${WN(R.wildcard.w)} · ${OCN(R.wildcard.id)}`:'none'));
  console.log('would change: '+(R.change.length?R.change.map(c=>`${OCN(c.id)} (${c.reasons.map(r=>r.text).join(', ')})`).join(' | '):'none'));
  const psy=R.all.findIndex(x=>x.id==='2634');const rankOf=id=>{const i=R.all.findIndex(x=>x.id===id);return i<0?null:i+1};
  console.log(`psychologists rank: ${rankOf('2634')} of ${R.all.length} (document: ${D.psy[0]} of ${D.psy[1]})`);
  ok(rankOf('2634')===D.psy[0],name+': the psychologists rank is '+rankOf('2634')+', the document says '+D.psy[0]);
  /* against the document */
  const chg=R.change.map(c=>[norm(OCN(c.id)),c.reasons.map(r=>r.text).join(', ')]),docChg=D.change.map(c=>[norm(c[0]),c[1]]);
  console.log('  vs document, what would change: '+(JSON.stringify(chg)===JSON.stringify(docChg)?'same':'different (document: '+(docChg.map(x=>x.join(' — ')).join(' | ')||'none')+')'));
  ok(JSON.stringify(chg)===JSON.stringify(docChg),name+': what would change differs');
  R.dirs.forEach((d,i)=>{const doc=D.dirs[i];
    const same=d.world===doc[0],occ=d.occs.map(x=>norm(OCN(x.id))),docOcc=doc[1].map(norm);
    console.log(`  vs document, direction ${i+1}: world ${same?'same':'DIFFERENT ('+doc[0]+')'}; occupations in common ${occ.filter(x=>docOcc.includes(x)).length}/3`);
    ok(same,name+': direction '+(i+1)+' is '+d.world+', document '+doc[0])});
  console.log(`  vs document, surprise: ${R.wildcard&&R.wildcard.w===D.wild[0]?'same world':'DIFFERENT'}; occupation ${R.wildcard&&norm(OCN(R.wildcard.id))===norm(D.wild[1])?'same':'different'}`);
  ok(R.wildcard&&R.wildcard.w===D.wild[0],name+': surprise world differs');
  /* structure: 3 directions, 3 different occupations each, no duplicates, no ISCO 9, every S finite */
  ok(R.dirs.length===3,'3 directions');const all=R.dirs.flatMap(d=>d.occs.map(x=>x.id));ok(new Set(all).size===all.length,name+': an occupation shows twice');
  ok(R.dirs.every(d=>d.occs.length===3),name+': a direction has fewer than 3 occupations');
  ok(all.every(id=>!id.startsWith('9')),name+': an ISCO 9 occupation was shown');ok(R.all.every(x=>isFinite(x.S)),name+': a score is not a number');
  ok(R.all.length===288-Object.keys(VQ.occupations).filter(i=>i.startsWith('9')).length,name+': number of scored occupations');
  ok(R.dirs[0].world===R.top[0],name+': direction 1 is not the leading world');
  const w1=R.dirs[0].occs[0];const wy=VQR.why(st,w1.id),ls=VQR.less(st,w1.id);
  if(name==='daniel'){R.dirs.forEach((d,i)=>ok(JSON.stringify(d.occs.map(x=>x.id).sort())===JSON.stringify(DANIEL_IDS.dirs[i].slice().sort()),'daniel: direction '+(i+1)+' occupations are '+d.occs.map(x=>x.id)+', expected '+DANIEL_IDS.dirs[i]));ok(R.wildcard&&R.wildcard.id===DANIEL_IDS.wild,'daniel: the surprise is not 2162');
    const x=R.byId['2263'],o=VQR.prep().occ['2263'];console.log(`  2263 penalties: red lines ${st.set.redlines.join(', ')} | math s1=${o.z.s1} strong -0.15 | reading s17=${o.z.s17}, s3=${o.z.s3} borderline -0.06 | total ${x.red.toFixed(2)} | years ${x.yrs} | W ${x.W.toFixed(3)} F ${x.F.toFixed(3)} V ${x.V.toFixed(3)} S ${x.S.toFixed(3)} (8341 S ${R.byId['8341'].S.toFixed(3)}, 6111 S ${R.byId['6111'].S.toFixed(3)})`)}
  console.log('  why ('+OCN(w1.id)+'): '+wy.map(x=>`${x.title}: ${x.text}`).join(' | '));console.log('  less: '+(ls.map(x=>x.text).join(' | ')||'—'));
  const cards=VQR.dayCards(st);console.log('  DAY cards: '+cards.map(c=>`${OCN(c.occ)} (${c.tasks.length} tasks, tags: ${c.tags.join('/')})`).join(' | '));
  ok(cards.length===3&&cards.every(c=>c.tasks.length>=2&&c.tasks.every(t=>t.length<=90)&&c.tags.length<=2),name+': DAY cards are not complete');
  const g=VQR.guessOccs(st,R.top[0]);ok(g.length===2&&g[0].id.slice(0,3)!==g[1].id.slice(0,3),name+': G occupations');
}
console.log('\n'+(fails?`${fails} check(s) differ`:'all structural checks passed'));process.exit(0);
