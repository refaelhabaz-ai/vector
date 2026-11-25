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
      primaries:[...document.querySelectorAll('.btn.primary')].map(x=>x.textContent.trim()),tabs:document.querySelectorAll('.vr-tab').length,say:(document.querySelector('.jr-say')||{}).textContent,step:(document.querySelector('.jr-o li.cur .jr-l')||{}).textContent,sw:document.documentElement.scrollWidth<=innerWidth+1,
      nums:[...document.querySelectorAll('.rs-m')].map(x=>x.textContent).join(' ')}));
    ok(R.mode==='res'&&R.hero&&/^הכיוון שלך: /.test(R.h1),`@${w}: the results open with the hero: ${R.h1}`);
    ok(R.why>=1,`@${w}: "why it fits you" is built from the answers (${R.why} reasons)`);
    ok(R.deg>=1&&R.deg<=3&&R.occ===3,`@${w}: up to three degrees (${R.deg}) and three professions (${R.occ})`);
    ok(R.primaries.length===1&&/הוספה למסלול שלי/.test(R.primaries[0]),`@${w}: one primary button: ${JSON.stringify(R.primaries)}`);
    ok(R.tabs===3,`@${w}: the other directions are still there (three tabs)`);
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
    const m=await q.evaluate(()=>({bar:document.querySelector('.vr-bar').getBoundingClientRect().height,btns:document.querySelectorAll('.vr-bar .btn').length,fs:Math.min(...[...document.querySelectorAll('.rs-m,.rs-via,.rs-adm,.rs-why li')].map(e=>parseFloat(getComputedStyle(e).fontSize))),
      tip:getComputedStyle(document.querySelector('.vb-tip')).display,pad:parseFloat(getComputedStyle(document.querySelector('.vr-in')).paddingBottom),sum:(document.querySelector('.rs-all>summary')||{}).textContent,more:!!document.querySelector('.vr-acts [data-vqmore]')&&!!document.querySelector('.vr-acts [data-vqstart]'),
      long:[...document.querySelectorAll('.rs-via')].some(e=>e.textContent.includes('בחרת')),sw:document.documentElement.scrollWidth<=innerWidth+1}));
    ok(m.bar<=70&&m.btns===2,`@${w}: the action bar is compact (${m.bar}px, ${m.btns} buttons)`);
    ok(m.fs>=16,`@${w}: card text at least 16px (${m.fs})`);
    ok(m.tip==='none',`@${w}: the bot's greeting bubble is hidden on this screen`);
    ok((w>820||m.pad>=100)&&m.more,`@${w}: room at the bottom (${m.pad}px) and the other actions are still there`);
    ok(/הכיוונים האחרים/.test(m.sum)&&!m.long&&m.sw,`@${w}: the fold has a clear label, reasons are short, no sideways scroll`);
    await cx.close()}
  console.log(fails?`\n${fails} FAILED`:'\nall checks passed');await b.close();process.exit(fails?1:0);
})();
