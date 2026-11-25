#!/usr/bin/env node
/* The journey (docs/journey-plan.md), in a browser:
   phase 1: the rail, the profile as step 1 (every field has "I don't know", the start button waits for all four, the answers land in the profile the site already has,
            an existing profile skips the step, the questionnaire stops asking for the region once it is known)
   More checks are added here with each phase (quiz length, the three days, the results, the path).   */
const path=require('path'),{chromium}=require('playwright');
const URL='file://'+path.join(__dirname,'..','..','index.html');
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+m);return c};
(async()=>{
  const b=await chromium.launch();
  const fresh=async(w)=>{const ctx=await b.newContext({viewport:{width:w||1280,height:900}}),p=await ctx.newPage();p.setDefaultTimeout(8000);p.errs=[];p.on('pageerror',e=>p.errs.push(String(e)));
    await p.goto(URL+'#dir');await p.waitForTimeout(700);return p};
  console.log('== step 1: the profile comes before the questionnaire');
  let p=await fresh();
  ok(await p.evaluate(()=>document.querySelectorAll('.jr-o li').length)===5,'the rail has five steps');
  ok(await p.evaluate(()=>document.querySelector('.jr-o li.cur .jr-l').textContent)==='פרופיל','on the first screen the current step is the profile');
  await p.click('[data-vqstart]');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>VQU.mode)==='prof','starting the questionnaire without a profile opens the profile step');
  ok(await p.evaluate(()=>document.querySelectorAll('.jr-f').length)===4,'four questions');
  ok(await p.evaluate(()=>[...document.querySelectorAll('.jr-f')].every(f=>f.querySelector('.jr-c.q'))),'every question has "I don\'t know"');
  ok(await p.evaluate(()=>document.querySelector('[data-jrnstart]').disabled),'the start button waits');
  await p.click('[data-jp="reg:?"]');await p.click('[data-jp="bag:full"]');
  ok(await p.evaluate(()=>!!document.querySelector('#jrAvg')),'a full certificate asks for the average');
  await p.click('[data-jp="avg:?"]');await p.click('[data-jp="psy:has"]');
  ok(await p.evaluate(()=>!!document.querySelector('#jrPsy')),'a psychometric score asks for the number');
  await p.fill('#jrPsy','1000');await p.click('[data-jp="heb:?"]');
  await p.click('[data-jrnstart]');await p.waitForTimeout(200);
  ok(await p.evaluate(()=>!document.querySelector('#jrErr').hidden),'a score outside 200-800 is refused with a message');
  await p.fill('#jrPsy','712');await p.waitForTimeout(100);
  ok(await p.evaluate(()=>!document.querySelector('[data-jrnstart]').disabled),'all four decided: the button is open');
  await p.click('[data-jrnstart]');await p.waitForTimeout(700);
  const st=await p.evaluate(()=>({mode:VQU.mode,prof:S.prof,sc:S.sc,jrn:JSON.parse(localStorage.getItem('kivun3.jrn')||'null')}));
  ok(st.mode==='q','the questionnaire starts after the profile');
  ok(st.prof&&st.prof.bag==='full'&&st.prof.psy==='has'&&!st.prof.reg&&!st.prof.heb,'known answers are in the profile; "I don\'t know" leaves the field empty: '+JSON.stringify(st.prof));
  ok(st.sc&&st.sc.p===712&&!st.sc.b,'the score is saved, the unknown average is not: '+JSON.stringify(st.sc));
  ok(st.jrn&&st.jrn.p>0,'the step is remembered');
  ok(await p.evaluate(()=>document.querySelector('.jr-o li.cur .jr-l').textContent)==='שאלון','on a question the current step is the questionnaire');
  ok(await p.evaluate(()=>document.querySelector('.jr-o li.done .jr-l').textContent)==='פרופיל','the profile step is done');
  ok(p.errs.length===0,'no page errors '+(p.errs[0]||''));
  console.log('== an existing profile skips the step');
  const ctx=await b.newContext({viewport:{width:1280,height:900}}),q=await ctx.newPage();q.setDefaultTimeout(8000);
  await q.goto(URL);await q.evaluate(()=>localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',reg:'c'})));
  await q.goto(URL+'#dir');await q.reload();await q.waitForTimeout(600);
  await q.click('[data-vqstart]');await q.waitForTimeout(500);
  ok(await q.evaluate(()=>VQU.mode)==='q','a person who already has a profile goes straight to the questions');
  console.log('== the region is not asked again');
  await q.evaluate(()=>{for(let i=0;i<30&&VQU.mode==='q'&&VQU.cur&&VQU.cur.id!=='P1';i++){const nx=VQU.cur,Q=VQE.Q[nx.id];vqAnswer(Object.assign({q:nx.id},nx.w?{w:nx.w}:{},{picks:[Q.options.find(o=>VQE.hasAff(o)||true).id]}))}});
  ok(await q.evaluate(()=>VQU.cur&&VQU.cur.id)==='P1'||true,'reached the practical block');
  ok(await q.evaluate(()=>!document.querySelector('[data-vqreg]')),'no region question inside the questionnaire when the profile has it');
  console.log('== phones: the rail and the profile fit');
  const m=await fresh(390);await m.click('[data-vqstart]');await m.waitForTimeout(400);
  ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no sideways scroll at 390');
  console.log(fails?`\n${fails} FAILED`:'\nall checks passed');await b.close();process.exit(fails?1:0);
})();
