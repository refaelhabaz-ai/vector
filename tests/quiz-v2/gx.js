#!/usr/bin/env node
/* The double forms ("אוהב/ת") in all the questionnaire texts: every form, in the three states (man, woman, not said). Run: node tests/quiz-v2/gx.js */
const {load}=require('./lib.js');const {VQ,VQX}=load();
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL: '+m)}return c};
const texts=[];VQ.questions.forEach(q=>{['q','hint','why','title'].forEach(k=>texts.push(q[k]||''));q.options.forEach(o=>texts.push(o.t))});
/* the texts have 21 forms in 25 places: את/ה appears once inside quotation marks, and it is the same form as the other את/ה, so there are 20 different ones */
const forms=new Map();texts.forEach(t=>{for(const m of t.matchAll(/([א-ת]+)\/([א-ת]+)/g))forms.set(m[0],[m[1],m[2]])});
console.log(`forms found in the texts: ${forms.size}\n`);
console.log('form'.padEnd(12)+'man'.padEnd(12)+'woman'.padEnd(12)+'not said');
const exceptions=[];
for(const [f,[stem,suf]] of forms){
  const m=VQX.form(stem,suf,'m'),w=VQX.form(stem,suf,'f'),n=VQX.form(stem,suf,'');
  console.log(f.padEnd(12)+m.padEnd(12)+w.padEnd(12)+n);
  if(w!==stem+suf)exceptions.push(`${f}: man ${m}, woman ${w}`+(w===VQX.add(stem,suf)?' (a final letter changes)':''));
  ok(n===f,f+': not said must stay as written');ok(!/\//.test(m)&&!/\//.test(w),f+': a slash is left');
  ok(m===stem||(/^[שוכלמב]?את$/.test(stem)&&m===stem+'ה'),f+': the man form should be the stem'+(/^[שוכלמב]?את$/.test(stem)?' + ה':'')+', got '+m);
}
console.log('\nthe exceptions to "stem + suffix" for a woman:\n  '+exceptions.join('\n  '));
ok(forms.size===20,'expected 20 different forms (21 appearances: את/ה also once inside quotes), found '+forms.size);
/* whole texts */
let left={m:0,f:0};texts.forEach(t=>{for(const s of ['m','f']){const x=VQX.text(t,s);if(/[א-ת]\/[א-ת]/.test(x))left[s]++}ok(VQX.text(t,'')===t&&VQX.text(t,'x')===t,'a text changed for a gender that was not said: '+t)});
ok(left.m===0&&left.f===0,'double forms left in whole texts: '+JSON.stringify(left));
console.log(`\ntexts checked: ${texts.length}, double forms left: man ${left.m}, woman ${left.f}`);
console.log('examples: '+['בוא/י נמצא את הכיוון שלך','נראה שאת/ה אוהב/ת {core}. כמה מזה','נהנה/ית'].map(t=>`\n  ${t}\n   man   ${VQX.text(t,'m')}\n   woman ${VQX.text(t,'f')}`).join(''));
console.log('\n'+(fails?`${fails} check(s) failed`:'all checks passed'));process.exit(fails?1:0);
