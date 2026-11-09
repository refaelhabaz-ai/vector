#!/usr/bin/env node
/* Stage 3 tests: the screens, in a browser. Answers a persona through the page (clicks and keys), at 1280 and at 360 wide.
   Run: node tests/quiz-v2/ui.js [--shots dir] */
const {chromium}=require('playwright');const path=require('path'),fs=require('fs');
const personas=JSON.parse(fs.readFileSync(path.join(__dirname,'personas.json'),'utf8'));
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
const URL='file://'+path.join(__dirname,'..','..','index.html');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL: '+m)}return c};
async function drive(browser,width,name,sex){
  const ctx=await browser.newContext({viewport:{width,height:width<500?740:900}}),p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto(URL);
  await p.evaluate(s=>{localStorage.clear();localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1');if(s)localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',sex:s}))},sex);
  await p.goto(URL+'#dir');await p.reload();await p.waitForTimeout(800);
  const label=`${name} @${width}${sex?' '+sex:''}`,per=personas[name],steps=Object.fromEntries(per.steps.map(s=>[s.q,s]));
  const shot=async n=>{if(shots){fs.mkdirSync(shots,{recursive:true});await p.screenshot({path:path.join(shots,`${name}-${width}-${n}.png`),fullPage:/DAY|res/.test(n)})}};
  await shot('0-intro');await p.click('[data-vqstart]');await p.waitForTimeout(300);
  for(let guard=0;guard<40;guard++){
    const mode=await p.evaluate(()=>VQU.mode);if(mode==='res')break;
    if(mode==='trans'){await shot('trans-'+guard);await p.click('[data-vqcont]');await p.waitForTimeout(150);continue}
    const id=await p.evaluate(()=>VQU.cur.id),s=steps[id];
    if(guard===3||id==='G'||id==='DAY'||id==='P4')await shot(id+'-'+guard);
    ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${label}: horizontal scroll on ${id}`);
    ok(await p.evaluate(()=>!!document.activeElement&&document.activeElement.id==='vqH'),`${label}: focus is not on the question ${id}`);
    if(id==='DAY'){const c=await p.$$('[data-vqday]');await c[0].click();await p.waitForTimeout(100);await shot('DAY-revealed');await p.click('[data-vqnext]');await p.waitForTimeout(300);continue}
    if(!s){await p.click('[data-vqskip]');await p.waitForTimeout(150);continue}
    for(const pid of s.picks){await p.click(`[data-vqo="${pid}"]`);await p.waitForTimeout(40)}
    const b=await p.$('[data-vqnext]');if(b&&!(await b.isDisabled()))await b.click();
    await p.waitForTimeout(420);
  }
  ok(await p.evaluate(()=>VQU.mode)==='res',`${label}: did not reach the results`);
  await p.waitForTimeout(300);await shot('res');
  const R=await p.evaluate(()=>({n:VQU.answers.length,order:VQU.answers.map(a=>a.q),dirs:[...document.querySelectorAll('.vr-tab b')].map(b=>b.textContent),h1:document.querySelector('#vqH').textContent,saved:JSON.parse(localStorage.getItem('kivun3.dir2')||'null'),sw:document.documentElement.scrollWidth<=innerWidth+1,text:document.body.innerText}));
  console.log(`${label}: ${R.n} questions · ${R.h1} · ${R.dirs.join(' / ')}`);
  ok(R.n<=20,label+': more than 20 answers');ok(R.sw,label+': horizontal scroll on the results');
  ok(R.saved&&R.saved.v===2&&R.saved.answers.length===R.n&&R.saved.done&&R.saved.ts,label+': dir2 was not saved as {v,answers,ctx,done,ts}');
  ok(R.dirs.length===3,label+': three directions expected');
  if(sex)ok(!/[א-ת]+\/[א-ת]+/.test(R.text.replace(/\n[^\n]*(מתמטיקה\/פיזיקה)[^\n]*/g,'')),label+': a double form is left in the text for a known gender');
  ok(errs.length===0,label+': page errors: '+errs.join(' | '));
  const doc=per.steps.map(s=>s.q).filter(q=>q!=='DAY'),got=R.order.filter(q=>q!=='DAY');
  ok(got.join()===doc.join(),`${name}@${width}: the screens asked a different order than the document: ${got.join(' ')}`);
  await ctx.close();
}
(async()=>{
  const b=await chromium.launch();
  const only=process.env.VQ_ONLY; /* e.g. VQ_ONLY=itai:360 runs one persona at one width */
  for(const w of [1280,360])for(const n of ['noa','itai','daniel']){if(only&&only!==n+':'+w)continue;await drive(b,w,n,n==='noa'?'f':n==='itai'?'m':'')}
  if(only&&only!=='extras'){await b.close();console.log('\n'+(fails?`${fails} check(s) failed`:'all checks passed'));process.exit(fails?1:0)}
  /* keyboard: keys 1-9 choose, Enter continues; back returns; "I do not know" counts */
  const ctx=await b.newContext({viewport:{width:1280,height:900}}),p=await ctx.newPage();
  await p.goto(URL);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kivun3.seenProf','true')});
  await p.goto(URL+'#dir');await p.reload();await p.waitForTimeout(600);await p.click('[data-vqstart]');await p.waitForTimeout(200);
  await p.keyboard.press('2');await p.keyboard.press('Enter');await p.waitForTimeout(500);
  let a=await p.evaluate(()=>VQU.answers.map(x=>x.q+':'+(x.picks||[]).join('+')));console.log('keyboard (A1: key 2, Enter): '+a.join(' '));
  ok(a[0]==='A1:A1_2','keys 1-9 and Enter: the first answer should be A1_2, got '+a[0]);
  await p.click('[data-vqskip]');await p.waitForTimeout(300);a=await p.evaluate(()=>VQU.answers.length);ok(a===2,'"I do not know" counts as an answer');
  await p.click('[data-vqback]');await p.waitForTimeout(300);a=await p.evaluate(()=>VQU.answers.length);ok(a===1,'"back" removes the last answer');
  await p.click('[data-vqwhy]');await p.waitForTimeout(100);ok(await p.$('.vq-why')!==null,'"why do we ask" shows the text');
  ok(await p.evaluate(()=>!!document.getElementById('live')),'an aria-live region exists');
  await ctx.close();
  /* "3 more questions": outside the quota of 20, then back to the results */
  const c2=await b.newContext({viewport:{width:1280,height:900}}),q=await c2.newPage();
  await q.goto(URL);await q.evaluate(()=>{localStorage.setItem('kivun3.seenProf','true')});await q.goto(URL+'#dir');await q.reload();await q.waitForTimeout(600);
  await q.click('[data-vqstart]');
  q.setDefaultTimeout(5000);
  const answerFirst=async()=>{const k=await q.evaluate(()=>{const x=VQE.Q[VQU.cur.id];return x.maxPick>1?x.maxPick:1});const bts=await q.$$('[data-vqo]');for(let i=0;i<k&&i<bts.length;i++)await bts[i].click();const n=await q.$('[data-vqnext]');if(n&&!(await n.isDisabled()))await n.click();await q.waitForTimeout(330)};
  for(let g=0;g<40;g++){const m=await q.evaluate(()=>VQU.mode);if(m==='res')break;if(m==='trans'){await q.click('[data-vqcont]');continue}
    if(m==='day'){await q.click('[data-vqday]');await q.click('[data-vqnext]');continue}
    await answerFirst()}
  const n0=await q.evaluate(()=>VQU.answers.length);await q.click('[data-vqmore]');await q.waitForTimeout(300);
  ok(await q.evaluate(()=>VQU.mode)==='q','"3 more questions" should ask a question');
  for(let g=0;g<6;g++){const m=await q.evaluate(()=>VQU.mode);if(m==='res')break;await answerFirst()}
  const n1=await q.evaluate(()=>({n:VQU.answers.length,mode:VQU.mode,dups:VQU.answers.length-new Set(VQU.answers.map(a=>a.q)).size}));
  console.log(`more: ${n0} answers, then ${n1.n} (extra ${n1.n-n0}), back in ${n1.mode}`);
  ok(n1.n-n0===3&&n1.mode==='res'&&n1.dups===0,'"3 more questions": exactly three new questions, no repeats, then the results');
  await c2.close();
  await b.close();console.log('\n'+(fails?`${fails} check(s) failed`:'all checks passed'));process.exit(fails?1:0);
})();
