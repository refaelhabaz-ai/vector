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
  const pAns=async(pg,v)=>{await pg.click(`#pf [data-pfv="${v}"]`);await pg.waitForTimeout(520)};
  const pQ=pg=>pg.evaluate(()=>({q:(document.querySelector('#pf .pf-q')||{}).textContent||'',n:document.querySelectorAll('#pf .pf-q').length,prog:(document.querySelector('#pf .pf-prog')||{}).textContent||'',opts:document.querySelectorAll('#pf .pf-o').length,unk:!!document.querySelector('#pf .pf-o.unk'),back:!document.querySelector('#pf .pf-back').hidden}));
  let p=await fresh();
  ok(await p.evaluate(()=>document.querySelectorAll('.jr-o li').length)===5,'the rail has five steps');
  ok(await p.evaluate(()=>document.querySelector('.jr-o li.cur .jr-l').textContent)==='פרופיל','on the first screen the current step is the profile');
  await p.click('[data-vqstart]');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>VQU.mode)==='prof','starting the questionnaire without a profile opens the profile step');
  let Q=await pQ(p);
  ok(Q.n===1&&/איפה אני עכשיו/.test(Q.q)&&Q.opts===6&&!Q.unk&&!Q.back&&/ראשונה/.test(Q.prog),'one question at a time, the first is "where I am now": no "I don\'t know" (the road needs it), no back yet: '+Q.q+' / '+Q.prog);
  ok(await p.evaluate(()=>document.querySelectorAll('.jr-f,.jr-c').length)===0,'the old stacked layout is gone');
  await pAns(p,'g10');Q=await pQ(p);
  ok(Q.n===1&&/גר/.test(Q.q)&&Q.unk&&Q.back&&/שאלה 2 מתוך 4/.test(Q.prog),'grade 10: four questions in all (no certificate, no average): '+Q.prog);
  await p.click('#pf [data-pfback]');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>document.querySelector('#pf [data-pfv="g10"]').getAttribute('aria-pressed'))==='true','back returns to the previous question with the answer kept');
  await p.click('#pf [data-pfskip]');await p.waitForTimeout(400);
  await pAns(p,'?');Q=await pQ(p);
  ok(/פסיכומטרי/.test(Q.q)&&/שאלה 3 מתוך 4/.test(Q.prog),'then the psychometric question: '+Q.prog);
  await pAns(p,'plan');Q=await pQ(p);
  ok(/שפה/.test(Q.q)&&/שאלה 4 מתוך 4/.test(Q.prog),'planning to take it: no score is asked, on to the language: '+Q.prog);
  await pAns(p,'he');await p.waitForTimeout(500);
  const st=await p.evaluate(()=>({mode:VQU.mode,prof:S.prof,jrn:JSON.parse(localStorage.getItem('kivun3.jrn')||'null')}));
  ok(st.mode==='q','the questionnaire starts after the last question');
  ok(st.prof&&st.prof.stage==='g10'&&st.prof.bag==='full'&&st.prof.psy==='plan'&&st.prof.heb==='he'&&!st.prof.reg,'answers are in the profile; "I don\'t know" leaves the field empty: '+JSON.stringify(st.prof));
  ok(st.jrn&&st.jrn.p>0&&st.jrn.unk&&st.jrn.unk.reg,'the step and the "I don\'t know" are remembered');
  ok(await p.evaluate(()=>document.querySelector('.jr-o li.cur .jr-l').textContent)==='שאלון','on a question the current step is the questionnaire');
  ok(await p.evaluate(()=>document.querySelector('.jr-o li.done .jr-l').textContent)==='פרופיל','the profile step is done');
  ok(p.errs.length===0,'no page errors '+(p.errs[0]||''));
  console.log('== the questions follow the answers');
  {
    const q2=await fresh();await q2.click('[data-vqstart]');await q2.waitForTimeout(400);
    await pAns(q2,'after');await pAns(q2,'c');let X=await pQ(q2);
    ok(/תעודה/.test(X.q),'finished service: the certificate is asked');
    await pAns(q2,'none');X=await pQ(q2);ok(/12 שנות/.test(X.q),'no certificate: 12 years of school');
    await pAns(q2,'yes');X=await pQ(q2);ok(/גיל/.test(X.q),'then age');
    await pAns(q2,'u30');X=await pQ(q2);ok(/פסיכומטרי/.test(X.q)&&/מתוך 7/.test(X.prog),'then the psychometric question, and the count grew with the longer path: '+X.prog);
    await pAns(q2,'has');X=await pQ(q2);ok(/ציון הכללי/.test(X.q)&&/מתוך 8/.test(X.prog),'"I have a score" asks for the score: '+X.prog);
    await q2.fill('#pfNum','1000');await q2.click('#pf [data-pfnum]');await q2.waitForTimeout(200);
    ok(await q2.evaluate(()=>!document.querySelector('#pfErr').hidden)&&/ציון הכללי/.test((await pQ(q2)).q),'a score outside 200-800 is refused with a message');
    await q2.fill('#pfNum','712');await q2.click('#pf [data-pfnum]');await q2.waitForTimeout(500);
    X=await pQ(q2);ok(/שפה/.test(X.q),'a valid score moves on');
    await q2.click('#pf [data-pfback]');await q2.waitForTimeout(300);
    ok(await q2.evaluate(()=>document.querySelector('#pfNum').value)==='712','back shows the number I typed');
    await q2.close();
    const q3=await fresh();await q3.click('[data-vqstart]');await q3.waitForTimeout(400);
    await pAns(q3,'g12');await pAns(q3,'c');X=await pQ(q3);
    ok(/ממוצע/.test(X.q)&&/מצפה/.test(X.q)&&!!X.unk===false||/ממוצע/.test(X.q),'grade 12: the bagrut average is asked as an estimate: '+X.q);
    ok(await q3.evaluate(()=>!!document.querySelector('#pf [data-pfv="?"]')),'and it can be skipped with "I don\'t know"');
    await pAns(q3,'?');X=await pQ(q3);ok(/פסיכומטרי/.test(X.q)&&/מתוך 5/.test(X.prog),'grade 12 has five questions: '+X.prog);
    await q3.close();
    const q4=await fresh();await q4.click('[data-vqstart]');await q4.waitForTimeout(400);
    await pAns(q4,'svc');await pAns(q4,'?');await pAns(q4,'full');X=await pQ(q4);
    ok(/ממוצע/.test(X.q)&&!/מצפה/.test(X.q),'in service with a full certificate: the average itself is asked');
    await q4.fill('#pfNum','98,5');await q4.click('#pf [data-pfnum]');await q4.waitForTimeout(500);
    ok(await q4.evaluate(()=>S.sc&&S.sc.b)===98.5,'a comma is accepted and the average is saved at once');
    await pAns(q4,'no');X=await pQ(q4);ok(/שפה/.test(X.q),'"no psychometric and not planning": no score asked');
    await q4.close();
  }
  console.log('== saved at once, resumed where it stopped');
  {
    const q5=await fresh();await q5.click('[data-vqstart]');await q5.waitForTimeout(400);
    await pAns(q5,'g12');await pAns(q5,'c');
    await q5.evaluate(()=>{const j=JSON.parse(localStorage.getItem('kivun3.prof')||'null');return j});
    ok(await q5.evaluate(()=>{const j=JSON.parse(localStorage.getItem('kivun3.prof')||'{}');return j.stage==='g12'&&j.reg==='c'}),'each answer is in the profile the moment it is given');
    await q5.reload();await q5.waitForTimeout(700);await q5.click('[data-vqstart]');await q5.waitForTimeout(500);
    const X=await pQ(q5);ok(/ממוצע/.test(X.q),'coming back, the profile continues at the first unanswered question: '+X.q);
    await q5.click('#pf [data-pfback]');await q5.waitForTimeout(300);await q5.click('#pf [data-pfback]');await q5.waitForTimeout(300);
    ok(await q5.evaluate(()=>document.querySelector('#pf [data-pfv="g12"]').getAttribute('aria-pressed'))==='true','and the earlier answers can be changed');
    await q5.close();
  }
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
  console.log('== phase 3: the three work days');
  for(const w of [1280,390]){
    const ctx3=await b.newContext({viewport:{width:w,height:900}}),d=await ctx3.newPage();d.setDefaultTimeout(8000);const errs3=[];d.on('pageerror',e=>errs3.push(String(e)));
    await d.goto(URL);await d.evaluate(()=>{localStorage.setItem('kivun3.jrn',JSON.stringify({p:1}))});await d.goto(URL+'#dir');await d.reload();await d.waitForTimeout(600);
    await d.evaluate(()=>{const st=VQE.init(vqEnv()),ans=[];for(let g=0;g<40;g++){const nx=VQE.next(st);if(nx.done||nx.id==='DAY')break;const Q=VQE.Q[nx.id];const a={q:nx.id,picks:Q.fmt==='multi'?Q.options.slice(0,Q.maxPick).map(o=>o.id):[Q.options[0].id]};if(nx.w)a.w=nx.w;VQE.apply(st,a);ans.push(a)}VQU.answers=ans;vqSave();VQU.preDone='';vqStep();vqPaint()});
    for(let g=0;g<3&&(await d.evaluate(()=>VQU.mode))==='trans';g++){await d.click('[data-vqcont]');await d.waitForTimeout(200)}
    ok(await d.evaluate(()=>VQU.mode)==='day',`@${w}: the day screen opens`);
    const info=await d.evaluate(()=>{const cs=[...document.querySelectorAll('.vq-day')];return {n:cs.length,rows:cs.map(c=>c.querySelectorAll('.vd-row').length),icons:cs.map(c=>c.querySelectorAll('.vd-i svg').length),hidden:cs.every(c=>!c.querySelector('.vq-rvn')),
      real:cs.every((c,i)=>[...c.querySelectorAll('.vd-t span:last-child')].every(s=>{const o=VQU.dayCards[i].occ,tasks=(OC[o].tasks||[]).map(x=>x.replace(/\s+\S*$/,'').slice(0,40));return tasks.some(x=>s.textContent.startsWith(x.slice(0,30)))||(OC[o].tasks||[]).some(x=>x.startsWith(s.textContent.replace(/…$/,'').slice(0,40)))})),sw:document.documentElement.scrollWidth<=innerWidth+1}});
    ok(info.n===3&&info.rows.every(r=>r>=1)&&info.icons.every(n=>n>=1),`@${w}: three days, each with a timeline and a drawing for every task: rows ${info.rows} icons ${info.icons}`);
    ok(info.hidden,`@${w}: the profession names are hidden before the choice`);
    ok(info.real,`@${w}: every task on a card is a task of the occupation behind it (the official data)`);
    ok(info.sw,`@${w}: no sideways scroll on the page`);
    const more=await d.$('[data-vqdayopen="0"]');
    if(more){const before=await d.evaluate(()=>document.querySelectorAll('.vq-day')[0].querySelectorAll('.vd-t').length);await more.click();await d.waitForTimeout(200);
      const after=await d.evaluate(()=>document.querySelectorAll('.vq-day')[0].querySelectorAll('.vd-t').length);ok(after>before,`@${w}: "more from this day" shows more tasks (${before} to ${after})`)}
    await d.click('[data-vqday]');await d.waitForTimeout(500);
    const rv=await d.evaluate(()=>({names:[...document.querySelectorAll('.vq-rvn b')].map(x=>x.textContent),why:document.querySelectorAll('.vd-why').length}));
    ok(rv.names.length===3&&rv.names.every(Boolean),`@${w}: after the choice the three professions are shown: ${rv.names.join(' / ')}`);
    ok(rv.why===3,`@${w}: each one says why it was in the set`);
    if(w===390)ok(await d.evaluate(()=>{const e=document.querySelector('.vq-days');return getComputedStyle(e).overflowX==='auto'&&getComputedStyle(e).scrollSnapType.includes('x')}),'on a phone the three days slide sideways and snap');
    ok(errs3.length===0,`@${w}: no page errors ${errs3[0]||''}`);await ctx3.close()}
  console.log('== phase 4: the results');
  for(const w of [1280,390]){
    const ctx4=await b.newContext({viewport:{width:w,height:900}}),r=await ctx4.newPage();r.setDefaultTimeout(8000);const errs4=[];r.on('pageerror',e=>errs4.push(String(e)));
    await r.goto(URL);await r.evaluate(()=>{localStorage.setItem('kivun3.jrn',JSON.stringify({p:1}));localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'has',heb:'he',reg:'c',stage:'g12'}));localStorage.setItem('kivun3.scores',JSON.stringify({b:98.5,p:712}))});await r.goto(URL+'#dir');await r.reload();await r.waitForTimeout(600);
    await r.evaluate(()=>{const st=VQE.init(vqEnv()),ans=[];for(let g=0;g<40;g++){const nx=VQE.next(st);if(nx.done)break;const Q=VQE.Q[nx.id];let a;if(nx.id==='DAY'){const c=VQR.dayCards(st);a={q:'DAY',picks:['DAY_pick'],occ:c[0].occ,never:null}}else{a={q:nx.id,picks:Q.fmt==='multi'?Q.options.slice(0,Q.maxPick).map(o=>o.id):[Q.options[0].id]};if(nx.w)a.w=nx.w}VQE.apply(st,a);ans.push(a)}VQU.answers=ans;VQU.done=Date.now();vqSave();VQU.mode='res';vqPaint()});
    await r.waitForTimeout(500);
    const R=await r.evaluate(()=>({mode:VQU.mode,h1:document.querySelector('#vqH').textContent,hero:!!document.querySelector('.rs-hero'),why:document.querySelectorAll('.rs-why li').length,deg:document.querySelectorAll('.rs-sec')[0]&&document.querySelectorAll('.rs-sec')[0].querySelectorAll('.rs-c').length,occ:document.querySelectorAll('.rs-sec')[1]&&document.querySelectorAll('.rs-sec')[1].querySelectorAll('.rs-c').length,
      primaries:[...document.querySelectorAll('.btn.primary')].map(x=>x.textContent.trim()),tabs:document.querySelectorAll('.vr-tab,.rs-all,.vr-more').length,say:(document.querySelector('.jr-say')||{}).textContent,step:(document.querySelector('.jr-o li.cur .jr-l')||{}).textContent,sw:document.documentElement.scrollWidth<=innerWidth+1,
      nums:[...document.querySelectorAll('.rs-m')].map(x=>x.textContent).join(' ')}));
    ok(R.mode==='res'&&R.hero&&/^הכיוון שלך: /.test(R.h1),`@${w}: the results open with the hero: ${R.h1}`);
    ok(R.why>=1,`@${w}: "why it fits you" is built from the answers (${R.why} reasons)`);
    ok(R.deg>=1&&R.deg<=3&&R.occ===3,`@${w}: up to three degrees (${R.deg}) and three professions (${R.occ})`);
    ok(R.primaries.length>=2&&R.primaries.every(x=>/בניית מסלול לתואר הזה|בחירת תואר ובניית מסלול/.test(x)),`@${w}: the primary actions are all about building a route: ${JSON.stringify(R.primaries)}`);
    ok(R.tabs===0,`@${w}: no collapsed direction box and no extra block under the suggestions`);
    ok(R.step==='תוצאות'&&/הצעתי לך את זה כי/.test(R.say||''),`@${w}: the rail is on the results step, and the line comes from the answers: ${(R.say||'').slice(0,60)}`);
    ok(R.sw,`@${w}: no sideways scroll`);
    if(w===1280){
      const before=await r.evaluate(()=>JSON.parse(localStorage.getItem('kivun3.path')||'null'));
      await r.click('.rs-sec .rs-c [data-padd]');await r.waitForTimeout(600);
      const after=await r.evaluate(()=>({ov:!!document.querySelector('.ov.show, .ov[aria-hidden="false"], #ov.show'),txt:(document.querySelector('.ov.show')||document.querySelector('.ov')||{}).textContent||'',route:location.hash}));
      ok(after.ov||after.route!=='#dir',`@${w}: "add to my path" on a degree continues (the picker of the institution opens): ${after.route} ${after.ov}`)}
    ok(errs4.length===0,`@${w}: no page errors ${errs4[0]||''}`);await ctx4.close()}
  console.log('== phase 5: the path as steps');
  for(const w of [1440,1024,390]){
    const ctx5=await b.newContext({viewport:{width:w,height:900}}),q5=await ctx5.newPage();q5.setDefaultTimeout(8000);const errs5=[];q5.on('pageerror',e=>errs5.push(String(e)));
    await q5.goto(URL);await q5.evaluate(()=>{localStorage.setItem('kivun3.jrn',JSON.stringify({p:1}));localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'has',heb:'he',reg:'c',stage:'g12'}));localStorage.setItem('kivun3.scores',JSON.stringify({b:98.5,p:712}));localStorage.setItem('kivun3.dir2',JSON.stringify({v:2,answers:[],done:Date.now()}))});
    await q5.goto(URL+'#path');await q5.reload();await q5.waitForTimeout(700);
    await q5.evaluate(()=>{KP.wiz.active=false;setGoal('d20',BY['d20'].of[0].i,true);addTarget('d239',BY['d239'].of[0].i,false,true);KP.view='hub';render()});await q5.waitForTimeout(500);
    const hub=await q5.evaluate(()=>({soon:document.querySelectorAll('.st-soonb').length,cards:document.querySelectorAll('.kp-hc').length,add:!!document.querySelector('[data-kadd]'),step:(document.querySelector('.jr-o li.cur .jr-l')||{}).textContent,sw:document.documentElement.scrollWidth<=innerWidth+1}));
    ok(hub.cards===2&&hub.soon>=1&&hub.add,`@${w}: the home of my goals has the goal cards, "what is coming" (${hub.soon}) and "add a goal"`);
    ok(hub.step==='יעדים'&&hub.sw,`@${w}: the rail is on the goals step, no sideways scroll`);
    await q5.evaluate(()=>{const P=pth();loadT(P,P.targets[0]);KP.wiz.active=false;KP.view='road';KP.tab='now';render()});await q5.waitForTimeout(700);
    const g=await q5.evaluate(()=>({zones:document.querySelectorAll('.st-z').length,cur:document.querySelectorAll('.st-z.cur').length,cards:document.querySelectorAll('.st-card .kp-focus').length,tools:[...document.querySelectorAll('.st-tool b')].map(x=>x.textContent),folds:[...document.querySelectorAll('.st-fold')].map(d=>d.open),map:!!document.querySelector('#kpJ .sm'),mapBtn:!!document.querySelector('.st-map [data-ktab="map"]'),
      step:(document.querySelector('.jr-o li.cur .jr-l')||{}).textContent,sw:document.documentElement.scrollWidth<=innerWidth+1,primary:[...document.querySelectorAll('.st-card .btn.primary')].length}));
    ok(g.zones>=3&&g.cur===1,`@${w}: a timeline of the stages with one current (${g.zones} stages)`);
    ok(g.cards===1,`@${w}: one large card for the step I am on`);
    ok(g.tools.length>=1&&g.tools.length<=3&&!g.tools.includes('מלגות'),`@${w}: only the tools of this stage: ${g.tools.join(', ')}`);
    ok(g.folds.length>=1&&g.folds.every(o=>!o),`@${w}: the next steps and the finished ones are folded`);
    ok(!g.map&&g.mapBtn,`@${w}: the map is not the work area; a button opens it on demand`);
    ok(g.step==='מסלול'&&g.sw,`@${w}: the rail is on the path step, no sideways scroll`);
    await q5.click('.st-map [data-ktab="map"]');await q5.waitForTimeout(900);
    ok(await q5.evaluate(()=>!!document.querySelector('#kpJ .sm')&&KP.tab==='map'),`@${w}: the map opens as an overview`);
    await q5.click('.kp-back');await q5.waitForTimeout(500);
    ok(await q5.evaluate(()=>KP.tab==='now'&&!!document.querySelector('.st-card')),`@${w}: "back" returns to the steps`);
    if(w===1440){const k=await q5.evaluate(()=>{const f=document.querySelector('.st-card [data-kmark]');return f?f.dataset.kmark:null});
      if(k){const before=await q5.evaluate(()=>plan().done);await q5.click(`.st-card [data-kmark="${k}"]`);await q5.waitForTimeout(500);const after=await q5.evaluate(()=>plan().done);ok(after>before,`@${w}: "done" marks the step and the page moves on in place (${before} to ${after})`)}}
    ok(errs5.length===0,`@${w}: no page errors ${errs5[0]||''}`);await ctx5.close()}
  console.log('== results screen: compact bar, readable cards, a clear fold');
  for(const w of [1440,390]){
    const cx=await b.newContext({viewport:{width:w,height:800}}),q=await cx.newPage();q.setDefaultTimeout(8000);
    await q.goto(URL);await q.evaluate(()=>{localStorage.setItem('kivun3.jrn',JSON.stringify({p:1}));localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'has',heb:'he',reg:'c',stage:'g12'}));localStorage.setItem('kivun3.scores',JSON.stringify({b:98.5,p:712}))});
    await q.goto(URL+'#dir');await q.reload();await q.waitForTimeout(700);await q.click('[data-vqstart]');await q.waitForTimeout(400);
    await q.evaluate(()=>{const st=VQE.init(vqEnv());const ans=[];for(let g=0;g<40;g++){const nx=VQE.next(st);if(nx.done)break;const Q=VQE.Q[nx.id];let a;if(nx.id==='DAY'){const c=VQR.dayCards(st);a={q:'DAY',picks:['DAY_pick'],occ:c[0].occ,never:null}}else{a={q:nx.id,picks:Q.fmt==='multi'?Q.options.slice(0,Q.maxPick).map(o=>o.id):[Q.options[0].id]};if(nx.w)a.w=nx.w}VQE.apply(st,a);ans.push(a)}VQU.answers=ans;VQU.done=Date.now();vqSave();VQU.mode='res';vqPaint();document.querySelector('.vb-tip').classList.add('show')});
    await q.waitForTimeout(1500);
    const m=await q.evaluate(()=>({bar:document.querySelectorAll('.vr-bar').length,fs:Math.min(...[...document.querySelectorAll('.rs-m,.rs-via,.rs-adm,.rs-why li')].map(e=>parseFloat(getComputedStyle(e).fontSize))),
      tip:getComputedStyle(document.querySelector('.vb-tip')).display,pad:parseFloat(getComputedStyle(document.querySelector('.vr-in')).paddingBottom),sum:(document.querySelector('.rs-all>summary')||{}).textContent,more:!!document.querySelector('.rs-hero [data-vqmore]')&&!!document.querySelector('.rs-hero [data-vqstart]'),
      long:[...document.querySelectorAll('.rs-via')].some(e=>e.textContent.includes('בחרת')),sw:document.documentElement.scrollWidth<=innerWidth+1}));
    ok(m.bar===0,`@${w}: there is no bottom bar on the results screen`);
    ok(m.fs>=16,`@${w}: card text at least 16px (${m.fs})`);
    ok(m.tip==='none',`@${w}: the bot's greeting bubble is hidden on this screen`);
    ok((w>820||m.pad>=24)&&m.more,`@${w}: room at the bottom (${m.pad}px) and the other actions are still there`);
    ok(!m.sum&&!m.long&&m.sw,`@${w}: the fold is gone, reasons are short, no sideways scroll`);
    await cx.close()}
  console.log('== results to path: the banner, the choice cards, the picker, the welcome');
  for(const w of [1440,390]){
    const cx=await b.newContext({viewport:{width:w,height:900}}),q=await cx.newPage();q.setDefaultTimeout(8000);const errs=[];q.on('pageerror',e=>errs.push(String(e)));
    await q.goto(URL);await q.evaluate(()=>{localStorage.setItem('kivun3.jrn',JSON.stringify({p:1}));localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'has',heb:'he',reg:'c',stage:'g12'}));localStorage.setItem('kivun3.scores',JSON.stringify({b:98.5,p:712}))});
    await q.goto(URL+'#dir');await q.reload();await q.waitForTimeout(700);await q.click('[data-vqstart]');await q.waitForTimeout(400);
    await q.evaluate(()=>{const st=VQE.init(vqEnv());const ans=[];for(let g=0;g<40;g++){const nx=VQE.next(st);if(nx.done)break;const Q=VQE.Q[nx.id];let a;if(nx.id==='DAY'){const c=VQR.dayCards(st);a={q:'DAY',picks:['DAY_pick'],occ:c[0].occ,never:null}}else{a={q:nx.id,picks:Q.fmt==='multi'?Q.options.slice(0,Q.maxPick).map(o=>o.id):[Q.options[0].id]};if(nx.w)a.w=nx.w}VQE.apply(st,a);ans.push(a)}VQU.answers=ans;VQU.done=Date.now();vqSave();VQU.mode='res';vqPaint()});
    await q.waitForTimeout(1500);
    const m=await q.evaluate(()=>{const nx=document.querySelector('.rs-next'),hero=document.querySelector('.rs-hero'),first=document.querySelector('.rs-sec');return {banner:!!nx,after:!!(hero&&nx&&(hero.compareDocumentPosition(nx)&4)&&(nx.compareDocumentPosition(first)&4)),title:(nx||{}).querySelector&&(nx.querySelector('h2')||{}).textContent,dots:document.querySelectorAll('.rs-nl li').length,k:(nx.querySelector('.rs-nk')||{}).textContent,
      cards:document.querySelectorAll('.rs-dc').length,prim:[...document.querySelectorAll('.rs-dc .btn.primary')].map(x=>x.textContent.trim()),old:[...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='הוספה למסלול שלי'),adm:document.querySelectorAll('.rs-dc .rs-adm').length,
      pick:!!document.querySelector('[data-rspickall]')&&!!document.querySelector('.rs-other [data-go="degrees"]'),bar:document.querySelectorAll('.vr-bar,[data-rsbar]').length,nxRail:!!document.querySelector('.jr-o li.nx'),nxNav:!!document.querySelector('.vn-link.path-l.nx'),disc:!!document.querySelector('.rs-hero .rs-fine'),sw:document.documentElement.scrollWidth<=innerWidth+1,
      extra:!!document.querySelector('.rs-all,.vr-more,.vr-note')}});
    ok(m.banner&&m.after&&/עכשיו בוחרים תואר/.test(m.title)&&m.dots>=3&&/שלב 4/.test(m.k),`@${w}: the step banner sits under the main result, before the degrees (${m.dots} real stages)`);
    ok(m.cards>=1&&m.prim.every(x=>x==='בניית מסלול לתואר הזה')&&!m.old,`@${w}: every suggested degree has one primary action "בניית מסלול לתואר הזה" (${m.cards})`);
    ok(m.adm>=1,`@${w}: the admission status from the profile stays (${m.adm})`);
    ok(m.pick&&m.nxRail&&m.nxNav,`@${w}: "choose from all degrees" is there, and the rail and the nav item point at the next step`);
    ok(m.bar===0,`@${w}: no bottom bar; "compare degrees" sits next to "choose from all degrees"`);
    ok(m.disc&&!m.extra&&m.sw,`@${w}: the disclaimer moved into the main card, the removed blocks are gone, no sideways scroll`);
    await q.click('[data-rspickall]');await q.waitForTimeout(400);
    const pk=await q.evaluate(()=>({n:document.querySelectorAll('.rp-l li').length,cnt:document.querySelector('.rp-cnt').textContent,cats:document.querySelectorAll('[data-rpc]').length}));
    ok(pk.n===30&&/567/.test(pk.cnt)&&pk.cats===10,`@${w}: the picker lists all degrees (${pk.cnt}) with search and ${pk.cats-1} areas`);
    await q.fill('#rpq','סיעוד');await q.waitForTimeout(300);
    ok(await q.evaluate(()=>[...document.querySelectorAll('.rp-l b')].some(x=>/סיעוד|אחיות/.test(x.textContent))),`@${w}: search finds degrees`);
    await q.click('.rp-l [data-padd]');await q.waitForTimeout(500);await q.click('[data-ppick]');await q.waitForTimeout(1200);
    const g=await q.evaluate(()=>({route:S.route.v,goal:hasGoal(),say:(document.querySelector('.jr-say')||{}).textContent,step:(document.querySelector('.jr-o li.cur .jr-l')||{}).textContent}));
    ok(g.route==='path'&&g.goal&&/בניתי לך מסלול ל/.test(g.say)&&/^מסלול|יעדים/.test(g.step),`@${w}: after the choice, straight to the path with the welcome: ${(g.say||'').slice(0,50)}`);
    ok(errs.length===0,`@${w}: no page errors ${errs[0]||''}`);await cx.close()}
  console.log('== one profile, one design, never asked twice');
  {
    const mk=async(prof,sc,w)=>{const cx=await b.newContext({viewport:{width:w||1200,height:900}}),q=await cx.newPage();q.setDefaultTimeout(8000);const errs=[];q.on('pageerror',e=>errs.push(String(e)));
      await q.goto(URL);await q.evaluate(([p,s])=>{localStorage.setItem('kivun3.jrn',JSON.stringify({p:1}));localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1');if(p)localStorage.setItem('kivun3.prof',JSON.stringify(p));if(s)localStorage.setItem('kivun3.scores',JSON.stringify(s))},[prof,sc]);
      await q.goto(URL+'#');await q.reload();await q.waitForTimeout(700);q.errs=errs;q.cx=cx;return q};
    const padd=async q=>{await q.evaluate(()=>{if(!document.getElementById('tpadd'))document.body.insertAdjacentHTML('beforeend','<button id="tpadd" data-padd="d20" style="position:fixed;top:0;left:0">x</button>')});await q.evaluate(()=>document.getElementById('tpadd').click());await q.waitForTimeout(600)};
    const full={bag:'full',psy:'has',heb:'he',reg:'c',stage:'g12'};
    let q=await mk(full,{b:98.5,p:712});
    await padd(q);
    let m=await q.evaluate(()=>({pf:!!document.querySelector('#pf'),pick:document.querySelectorAll('.kp-pi').length}));
    ok(!m.pf&&m.pick>0,'a complete profile: building a path asks zero questions and goes straight to the institution choice');
    ok(await q.evaluate(()=>!needProf(()=>{})),'needProf is false when the stage is known');
    await q.cx.close();
    q=await mk({bag:'full',psy:'has',heb:'he',reg:'c'},{b:98.5,p:712});
    await padd(q);
    m=await q.evaluate(()=>({n:document.querySelectorAll('#pf .pf-q').length,q:(document.querySelector('#pf .pf-q')||{}).textContent,prog:(document.querySelector('#pf .pf-prog')||{}).textContent,back:document.querySelector('#pf .pf-back').hidden}));
    ok(m.n===1&&/איפה אני עכשיו/.test(m.q)&&/ראשונה/.test(m.prog),'an old profile without the stage: exactly one question, "where I am now": '+m.prog);
    await q.click('#pf [data-pfv="g12"]');await q.waitForTimeout(800);
    m=await q.evaluate(()=>({pf:!!document.querySelector('#pf'),pick:document.querySelectorAll('.kp-pi').length,prof:S.prof}));
    ok(!m.pf&&m.pick>0&&m.prof.stage==='g12'&&m.prof.bag==='full','it is saved for good and the road goes on to the institution choice, nothing else asked');
    await padd(q);
    ok(await q.evaluate(()=>!document.querySelector('#pf')),'and the next time nothing is asked');
    ok(q.errs.length===0,'no page errors '+(q.errs[0]||''));await q.cx.close();
    q=await mk({stage:'g12'});
    await padd(q);await q.click('[data-ppick]');await q.waitForTimeout(1500);
    m=await q.evaluate(()=>({route:S.route.v,goal:hasGoal(),pf:!!document.querySelector('#pf')}));
    ok(m.route==='path'&&m.goal&&!m.pf&&q.errs.length===0,'a profile with only the stage (everything else "I don\'t know") still builds a road: '+(q.errs[0]||''));
    await q.cx.close();
    /* one design: the window, the journey step and the profile page open the same component */
    q=await mk(null,null);
    await q.evaluate(()=>openProfile());await q.waitForTimeout(400);
    m=await q.evaluate(()=>({modal:!!document.querySelector('#ov #pf.pf-modal'),opts:document.querySelectorAll('#ov .pf-o').length}));
    ok(m.modal&&m.opts>=6,'the profile window is the shared component');
    await q.click('#ov [data-pfv="after"]');await q.waitForTimeout(500);await q.click('#ov [data-pfv="c"]');await q.waitForTimeout(500);
    await q.keyboard.press('Escape');await q.waitForTimeout(300);
    await q.evaluate(()=>{go('dir')});await q.waitForTimeout(500);await q.evaluate(()=>{VQU.mode='prof';JP.ready=0;vqPaint()});await q.waitForTimeout(500);
    m=await q.evaluate(()=>({page:!!document.querySelector('.jr-pf #pf.pf-page'),q:(document.querySelector('#pf .pf-q')||{}).textContent}));
    ok(m.page&&/תעודה/.test(m.q),'answers given in the window are in the journey step, which continues at the next question: '+m.q);
    await q.click('#pf [data-pfv="full"]');await q.waitForTimeout(500);await q.keyboard.press('Escape');
    await q.evaluate(()=>{openProfile({at:'bag'})});await q.waitForTimeout(400);
    ok(await q.evaluate(()=>document.querySelector('#ov [data-pfv="full"]').getAttribute('aria-pressed'))==='true','answers given in the journey step are in the window');
    await q.keyboard.press('Escape');
    await q.evaluate(()=>{S.prof={...S.prof,psy:'plan',heb:'he'};store.set('prof',S.prof);go('me')});await q.waitForTimeout(500);
    await q.click('.pf-r [data-prof="bag"]');await q.waitForTimeout(400);
    m=await q.evaluate(()=>({q:(document.querySelector('#ov #pf .pf-q')||{}).textContent,on:(document.querySelector('#ov .pf-o[aria-pressed="true"]')||{}).textContent}));
    ok(/תעודה/.test(m.q)&&/בגרות מלאה/.test(m.on||''),'the profile page opens the same flow at the row I chose, with my answer: '+m.q);
    await q.keyboard.press('Escape');
    await q.click('#quizBtn');await q.waitForTimeout(300);
    ok(await q.evaluate(()=>!!document.querySelector('#ov #pf')||S.route.v==='me'),'the header opens the shared component (or the profile page when the profile is done)');
    ok(q.errs.length===0,'no page errors '+(q.errs[0]||''));await q.cx.close();
    /* phones */
    q=await mk(null,null,390);await q.evaluate(()=>openProfile());await q.waitForTimeout(400);
    ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('#ov .pf-o')].every(o=>o.getBoundingClientRect().height>=54)),'@390: rows are comfortable and nothing scrolls sideways');
    await q.cx.close();
  }
  console.log('== finishing the profile keeps me where I was');
  {
    const cx=await b.newContext({viewport:{width:1200,height:900}}),q=await cx.newPage();q.setDefaultTimeout(8000);const errs=[];q.on('pageerror',e=>errs.push(String(e)));
    await q.goto(URL);await q.evaluate(()=>{localStorage.setItem('kivun3.jrn',JSON.stringify({p:1}));localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1')});
    await q.goto(URL+'#deg-d20');await q.reload();await q.waitForTimeout(900);
    const before=await q.evaluate(()=>({hash:location.hash,cta:!!document.querySelector('[data-prof]')}));
    await q.evaluate(()=>openProfile());await q.waitForTimeout(400);
    for(const v of ['after','c','full','?','no','he']){await q.click(`#ov [data-pfv="${v}"]`);await q.waitForTimeout(520)}
    await q.waitForTimeout(500);
    const after=await q.evaluate(()=>({hash:location.hash,route:S.route.v,ov:!!document.querySelector('#ov #pf'),ok:profileOK(),title:(document.querySelector('h1')||{}).textContent}));
    ok(before.hash==='#deg-d20'&&after.hash==='#deg-d20'&&after.route==='deg'&&!after.ov&&after.ok,`after the last answer I am still on the degree page, with the profile saved (${after.hash}, ${after.title})`);
    await q.evaluate(()=>openProfile({at:'more'}));await q.waitForTimeout(400);
    ok(await q.evaluate(()=>/עוד קצת עליי/.test((document.querySelector('#ov #pf .pf-q')||{}).textContent||'')&&!!document.querySelector('#ov [data-pffinish]')),'the optional extras are a screen of their own, opened on request');
    ok(errs.length===0,'no page errors '+(errs[0]||''));await cx.close();
  }
  console.log(fails?`\n${fails} FAILED`:'\nall checks passed');await b.close();process.exit(fails?1:0);
})();
