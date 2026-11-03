#!/usr/bin/env node
/* Tests for the review fixes, in a browser (360 wide):
   - the "day in the life" screen: 3 cards visible after the reveal, the skip link out of the viewport, the heading not covered by the header;
   - keyboard focus on an answer card is an outline, not a fill; only the selected card is filled;
   - the results screen: one button at the top, the other three below the directions;
   - the "how to get there" block: gender forms for a female and a male profile, the "not enough data" line once per occupation and never per degree.
   Run: node tests/quiz-v2/fixes.js */
const {chromium}=require('playwright');const path=require('path'),fs=require('fs');
const personas=JSON.parse(fs.readFileSync(path.join(__dirname,'personas.json'),'utf8'));
const URL='file://'+path.join(__dirname,'..','..','index.html');
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+m);return c};
(async()=>{
  const b=await chromium.launch();
  const open=async(sex,sync)=>{
    const ctx=await b.newContext({viewport:{width:360,height:740}}),p=await ctx.newPage();p.setDefaultTimeout(8000);const errs=[];p.on('pageerror',e=>errs.push(String(e)));
    await p.goto(URL);await p.evaluate(s=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',sex:s,reg:'c'}))},sex);
    await p.goto(URL+'#dir');await p.reload();await p.waitForTimeout(600);p.errs=errs;
    /* a saved run that stops right before the last screen (the day in the life) */
    await p.evaluate(P=>{const st=VQE.init({}),ans=[];for(const s of P.steps.slice(0,-1)){const a={q:s.q,picks:s.picks};if(s.q==='G'||s.q==='HB')a.w=VQE.rank(st.p)[0];VQE.apply(st,a);ans.push(a)}localStorage.setItem('kivun3.dir2',JSON.stringify({v:2,answers:ans,ts:Date.now()}))},personas.noa);
    await p.reload();await p.waitForTimeout(600);await p.click('[data-vqresume]');await p.waitForTimeout(400);
    for(let g=0;g<3&&(await p.evaluate(()=>VQU.mode))==='trans';g++){await p.click('[data-vqcont]');await p.waitForTimeout(200)}
    return p};
  /* ---- the day in the life ---- */
  let p=await open('f');
  ok(await p.evaluate(()=>VQU.mode)==='day','reached the day-in-the-life screen');
  ok(await p.evaluate(()=>document.querySelectorAll('.vq-day').length)===3,'three cards before the reveal');
  await p.click('[data-vqday]');await p.waitForTimeout(400);
  const cards=await p.evaluate(()=>[...document.querySelectorAll('.vq-day')].map(c=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c);return {h:Math.round(r.height),op:s.opacity,vis:s.visibility,nm:!!c.querySelector('.vq-rvn')}}));
  ok(cards.length===3&&cards.every(c=>c.h>50&&c.vis==='visible'),'three cards after the reveal: '+JSON.stringify(cards.map(c=>c.h)));
  ok(cards.filter(c=>c.op==='1').length>=2,'the cards are not transparent (opacity: '+cards.map(c=>c.op).join(', ')+')');
  ok(cards.every(c=>c.nm),'every card shows its occupation after the reveal');
  const sk=await p.evaluate(()=>{const s=document.querySelector('.skip');return s?Math.round(s.getBoundingClientRect().bottom):null});
  ok(sk===null||sk<=0,'the skip link is outside the viewport (bottom '+sk+')');
  await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,0)});await p.waitForTimeout(400);
  const hh=await p.evaluate(()=>{const h=document.querySelector('.hdr'),t=document.querySelector('#vqH');if(!h||!t)return null;document.documentElement.style.scrollBehavior='auto';scrollTo(0,0);return {hb:Math.round(h.getBoundingClientRect().bottom),tt:Math.round(t.getBoundingClientRect().top),pos:getComputedStyle(h).position}});
  ok(!hh||hh.tt>=hh.hb,'at the top of the page the heading is below the header '+JSON.stringify(hh));
  await p.click('[data-vqnext]');await p.waitForTimeout(500);
  ok(await p.evaluate(()=>VQU.mode)==='res','the results screen opens after the day');
  /* ---- results layout ---- */
  const lay=await p.evaluate(()=>{const top=[...document.querySelectorAll('.dres-hero [data-go],.dres-hero [data-vqmore],.dres-hero [data-vqstart]')].map(x=>x.textContent.trim());
    const dirs=[...document.querySelectorAll('.vq-dir')],last=dirs[dirs.length-1],after=document.querySelector('.vq-after');
    const sur=document.querySelector('.vq-sur'),chg=document.querySelector('.vq-chg');
    const below=el=>!!el&&!!(last.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING);
    const afterSur=!sur||!!(sur.compareDocumentPosition(after)&Node.DOCUMENT_POSITION_FOLLOWING);
    return {top,after:after?[...after.querySelectorAll('button')].map(x=>x.textContent.trim()):[],below:below(after),afterSur,afterChg:!chg||!!(chg.compareDocumentPosition(after)&Node.DOCUMENT_POSITION_FOLLOWING)}});
  ok(lay.top.length===1&&/למסלול שלי/.test(lay.top[0]),'one button at the top: '+JSON.stringify(lay.top));
  ok(lay.after.length===3&&lay.below&&lay.afterSur&&lay.afterChg,'three buttons below the directions, the surprise and "what would change": '+JSON.stringify(lay.after));
  ok(!lay.after.some(t=>/^(השווה|התחל)/.test(t)),'the labels are not masculine imperatives');
  /* ---- the routes block: gender and the data line ---- */
  const routes=async pg=>pg.evaluate(()=>{document.querySelectorAll('.vq-dir').forEach(d=>d.setAttribute('open',''));
    const occ=[...document.querySelectorAll('.vq-occ')].map(o=>{const r=o.querySelector('.vq-routes');return {txt:r?r.textContent:'',naInLi:r?r.querySelectorAll('li .vq-adm.na').length:0,naLines:[...o.querySelectorAll('.vq-adm.na')].length,deg:r?r.querySelectorAll('li').length:0}});
    return occ});
  const rf=await routes(p);
  const all=rf.map(o=>o.txt).join(' | ');
  ok(!/אני יכול(?!ה)/.test(all),'female profile: no masculine "אני יכול" in the routes block');
  ok(rf.every(o=>o.naInLi===0),'"not enough data" never appears per degree');
  ok(rf.every(o=>o.naLines<=1),'"not enough data" at most once per occupation');
  const yesSeen=/אני יכולה להתקבל/.test(all);console.log('       (female admission line seen: '+yesSeen+', occupations with the data line: '+rf.filter(o=>o.naLines===1).length+' of '+rf.length+')');
  ok(p.errs.length===0,'no page errors '+p.errs.join(';'));
  await p.context().close();
  const pm=await open('m');
  await pm.click('[data-vqday]');await pm.waitForTimeout(300);await pm.click('[data-vqnext]');await pm.waitForTimeout(500);
  const rm=await routes(pm),allm=rm.map(o=>o.txt).join(' | ');
  ok(!/אני יכולה/.test(allm),'male profile: no feminine form');
  ok(/אני יכול להתקבל/.test(allm)||!/להתקבל/.test(allm),'male profile: masculine form when an admission line exists');
  await pm.context().close();
  /* ---- keyboard focus on the answer cards ---- */
  const ctx=await b.newContext({viewport:{width:1000,height:800}}),k=await ctx.newPage();k.setDefaultTimeout(6000);
  await k.goto(URL);await k.evaluate(()=>{localStorage.setItem('kivun3.seenProf','true')});await k.goto(URL+'#dir');await k.reload();await k.waitForTimeout(500);
  await k.click('[data-vqstart]');await k.waitForTimeout(300);
  let f=null;
  for(let i=0;i<20&&!f;i++){await k.keyboard.press('Tab');f=await k.evaluate(()=>{const a=document.activeElement;if(!a||!a.matches('[data-vqo]'))return null;const s=getComputedStyle(a);return {bg:s.backgroundImage==='none'?s.backgroundColor:s.backgroundImage,ow:s.outlineWidth,os:s.outlineStyle,sel:a.classList.contains('vq-sel'),fv:a.matches(':focus-visible')}})}
  ok(!!f&&f.fv&&f.os==='solid'&&parseFloat(f.ow)>=3,'a focused card has an outline '+JSON.stringify(f));
  ok(!!f&&!f.sel&&!/gradient/.test(f.bg),'a focused card is not filled like a selected one');
  await k.keyboard.press('Space');await k.waitForTimeout(150);
  const g=await k.evaluate(()=>{const a=document.activeElement;if(!a||!a.matches('[data-vqo]'))return null;const s=getComputedStyle(a);return {sel:a.classList.contains('vq-sel'),bg:s.backgroundImage,aria:a.getAttribute('aria-checked')}});
  ok(!!g&&g.sel&&/gradient/.test(g.bg)&&g.aria==='true','after Space the card is selected and filled '+JSON.stringify(g&&{sel:g.sel,aria:g.aria}));
  await ctx.close();
  await b.close();
  console.log(fails?`\n${fails} FAILED`:'\nall checks passed');process.exit(fails?1:0);
})().catch(e=>{console.log('ERROR',String(e).slice(0,400));process.exit(1)});
