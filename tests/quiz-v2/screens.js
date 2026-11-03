#!/usr/bin/env node
/* Takes the screenshots of docs/quiz-v2/screens/ (360 wide): intro, a regular question, a multi-select question, a transition, the guess,
   a day in the life before and after the reveal, and the results (first direction open, and all collapsed). Run: node tests/quiz-v2/screens.js */
const {chromium}=require('playwright');const path=require('path'),fs=require('fs');
const personas=JSON.parse(fs.readFileSync(path.join(__dirname,'personas.json'),'utf8'));
const URL='file://'+path.join(__dirname,'..','..','index.html'),OUT=path.join(__dirname,'..','..','docs','quiz-v2','screens');
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
  const b=await chromium.launch(),ctx=await b.newContext({viewport:{width:360,height:740},deviceScaleFactor:2}),p=await ctx.newPage();p.setDefaultTimeout(8000);
  await p.goto(URL);await p.evaluate(()=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',sex:'f'}))});
  await p.goto(URL+'#dir');await p.reload();await p.waitForTimeout(800);
  const hideBar=()=>p.addStyleTag({content:'#botnav,.tbar{display:none!important}.hdr{position:static!important}.skip{display:none!important}'});
  const shot=async(n,full)=>{await p.waitForTimeout(250);if(full)await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,0)});await p.screenshot({path:path.join(OUT,n+'.png'),fullPage:!!full});console.log('saved '+n)};
  await shot('1-intro');
  await p.click('[data-vqstart]');await p.waitForTimeout(300);
  const steps=Object.fromEntries(personas.noa.steps.map(s=>[s.q,s]));let got={};
  for(let g=0;g<40;g++){
    const mode=await p.evaluate(()=>VQU.mode);if(mode==='res')break;
    if(mode==='trans'){if(!got.trans){await shot('4-transition');got.trans=1}await p.click('[data-vqcont]');await p.waitForTimeout(150);continue}
    const id=await p.evaluate(()=>VQU.cur.id),s=steps[id];
    if(id==='X12'&&!got.q){await shot('2-question');got.q=1}
    if(id==='G'&&!got.g){await p.waitForTimeout(1300);await shot('5-guess');got.g=1}
    if(id==='DAY'){await hideBar();await shot('6-day-before',true);const c=await p.$$('[data-vqday]');await c[0].click();await p.waitForTimeout(200);await shot('7-day-after-reveal',true);await p.click('[data-vqnext]');await p.waitForTimeout(400);continue}
    for(const pid of s.picks){await p.click(`[data-vqo="${pid}"]`);await p.waitForTimeout(40);
      if(id==='A1'&&!got.m&&pid===s.picks[s.picks.length-1]){await hideBar();await p.evaluate(()=>scrollTo(0,0));await shot('3-multi-select',true);got.m=1}}
    const nb=await p.$('[data-vqnext]');if(nb&&!(await nb.isDisabled()))await nb.click();await p.waitForTimeout(420);
  }
  await hideBar();await p.waitForTimeout(400);
  await shot('8-results-open',true);
  await p.evaluate(()=>document.querySelectorAll('.vq-dir[open]').forEach(d=>d.removeAttribute('open')));
  await shot('9-results-collapsed',true);
  await b.close();
})().catch(e=>{console.log('ERROR',String(e).slice(0,300));process.exit(1)});
