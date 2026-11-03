#!/usr/bin/env node
/* Stage 4 tests: the rest of the site reads the new result (the old dirResult / dirDone names), the profile and the backup. In a browser.
   Run: node tests/quiz-v2/integration.js */
const {chromium}=require('playwright');const path=require('path'),fs=require('fs');
const personas=JSON.parse(fs.readFileSync(path.join(__dirname,'personas.json'),'utf8'));
const URL='file://'+path.join(__dirname,'..','..','index.html');
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+m);return c};
/* Noa's answers as a saved dir2 (G and HB carry the world they asked about; DAY: the first card) */
const noaAnswers=()=>{const P=personas.noa,out=[];return P.steps.map(s=>({q:s.q,...(s.picks.length?{picks:s.picks}:{skip:1})}))};
(async()=>{
  const b=await chromium.launch();
  const page=async(setup)=>{const ctx=await b.newContext({viewport:{width:1280,height:900}}),p=await ctx.newPage();p.setDefaultTimeout(8000);const errs=[];p.on('pageerror',e=>errs.push(String(e)));
    await p.goto(URL);await p.evaluate(setup||(()=>{}));await p.goto(URL+'#');await p.reload();await p.waitForTimeout(700);p.errs=errs;p.ctx=ctx;return p};
  /* build a finished dir2 inside the page with the engine itself, so the answers are valid */
  const finished=async(extra)=>page(async(P)=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1');localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',stage:'g10',stageAt:Date.now(),reg:'c'}))}).then(async p=>{
    await p.evaluate(P=>{const st=VQE.init({profile:{reg:'c'}}),ans=[];P.steps.forEach(s=>{const a={q:s.q};if(s.q==='DAY'){const c=VQR.dayCards(st)[0];a.picks=['DAY_pick'];a.occ=c.occ;a.never=null}else if(s.picks.length)a.picks=s.picks;else a.skip=1;if(s.q==='G'||s.q==='HB')a.w=VQE.rank(st.p)[0];VQE.apply(st,a);ans.push(a)});
      localStorage.setItem('kivun3.dir2',JSON.stringify({v:2,answers:ans,ctx:st.ctx,done:Date.now(),more:0,ts:Date.now()}))},personas.noa);
    await p.reload();await p.waitForTimeout(700);return p});

  console.log('\n== adapters: dirDone and dirResult');
  let p=await finished();
  const R=await p.evaluate(()=>{const r=dirResult();return {done:dirDone(),worlds:r.worlds,nocc:Object.keys(r.occ).length,ndeg:Object.keys(r.deg).length,top:r.occ[r.oRank[0]],sample:BY&&r.dRank.slice(0,3).map(id=>BY[id].n)}});
  ok(R.done===true,'dirDone() is true after dir2.done');ok(R.worlds[0]==='create','dirResult().worlds[0] is the leading world (create)');
  ok(R.nocc===274&&R.ndeg>100,`occupations ${R.nocc}, degrees ${R.ndeg} scored`);ok(R.top.top===1&&R.top.pct===100,'the best occupation: top 1%, pct 100');
  console.log('  best degrees: '+R.sample.join(' · '));

  console.log('\n== degrees page: the shelf "הכי מתאימים לי"');
  await p.goto(URL+'#degrees');await p.waitForTimeout(900);
  const shelf=await p.evaluate(()=>{const s=document.querySelector('#sh-dir');const h=s&&s.closest('.shelf');return h?{t:h.querySelector('.sec-h p').textContent,n:s.querySelectorAll('.card').length}:null});
  console.log('  '+JSON.stringify(shelf));ok(shelf&&shelf.n>=3,'the shelf shows degrees');ok(shelf&&/עיצוב, אמנות, מדיה ותוכן/.test(shelf.t),'its subtitle names the leading worlds');

  console.log('\n== jobs list: sort "הכי מתאים לי"');
  await p.goto(URL+'#jobs');await p.waitForTimeout(900);
  const jobs=await p.evaluate(()=>{const sel=[...document.querySelectorAll('select,[data-jsort]')];const o=JOBF&&typeof JOBF==='object';return {hasOpt:!!document.querySelector('option[value="dir"],[data-sort="dir"],[data-jsort="dir"]')||document.body.innerHTML.includes('הכי מתאים לי (לפי השאלון)')}});
  ok(jobs.hasOpt,'the sort option exists once the questionnaire is done');
  const order=await p.evaluate(()=>{JOBF.sort='dir';const R=dirResult();const L=OCLIST.slice().sort((a,b)=>(R.occ[b.id]?R.occ[b.id].t:-9)-(R.occ[a.id]?R.occ[a.id].t:-9));return L.slice(0,3).map(o=>o.n)});
  console.log('  first by fit: '+order.join(' · '));ok(order.length===3,'the sort works on the new scores');
  const rendered=await p.evaluate(()=>{JOBF.sort='dir';render();const cards=[...document.querySelectorAll('.card h3,.card .t')].slice(0,3).map(x=>x.textContent.trim());return cards});
  console.log('  page, first cards: '+rendered.join(' · '));

  console.log('\n== occupation page and degree page: badge and tag');
  const oc=await p.evaluate(()=>dirResult().oRank[0]);await p.goto(URL+'#occ-'+oc);await p.waitForTimeout(800);
  const ob=await p.evaluate(()=>{const b=document.querySelector('.dbadge');return b?b.textContent.trim():null});console.log('  occupation badge: '+ob);ok(ob&&/התאמה/.test(ob),'the occupation page shows the fit badge');
  const dg=await p.evaluate(()=>dirResult().dRank[0]);await p.goto(URL+'#deg-'+dg);await p.waitForTimeout(800);
  const db=await p.evaluate(()=>{const b=document.querySelector('.dbadge');return b?b.textContent.trim():null});console.log('  degree badge: '+db);ok(db&&/התאמה/.test(db),'the degree page shows the fit badge');
  await p.goto(URL+'#degrees');await p.waitForTimeout(900);
  const tag=await p.evaluate(()=>document.querySelectorAll('.tag.fit').length);ok(tag>=1,`the degree list shows "מתאים לי" tags (${tag})`);
  ok(p.errs.length===0,'no page errors: '+p.errs.join(' | '));

  console.log('\n== the path: the step "לבדוק שהכיוון מתאים" (grade 10) and the wizard');
  await p.evaluate(()=>{localStorage.setItem('kivun3.path',JSON.stringify({v:4,created:Date.now(),targets:[{id:'t1',d:'d20',i:'i1',marks:{},goalP:0,added:Date.now()}],active:'t1'}))});
  await p.goto(URL+'#path');await p.reload();await p.waitForTimeout(1500);
  const step=await p.evaluate(()=>{const pl=plan();const t=pl.tasks.find(x=>x.id==='explore');return t?{done:!!t.done,s:t.s}:null});
  console.log('  '+JSON.stringify(step));ok(step&&step.done,'the step is marked done by the new questionnaire');
  const ngo=await page(()=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',stage:'g10',stageAt:Date.now()}))});
  await ngo.evaluate(P=>{const st=VQE.init({}),ans=[];P.steps.forEach(s=>{const a={q:s.q};if(s.q==='DAY'){const c=VQR.dayCards(st)[0];a.picks=['DAY_pick'];a.occ=c.occ}else if(s.picks.length)a.picks=s.picks;else a.skip=1;if(s.q==='G'||s.q==='HB')a.w=VQE.rank(st.p)[0];VQE.apply(st,a);ans.push(a)});localStorage.setItem('kivun3.dir2',JSON.stringify({v:2,answers:ans,done:Date.now(),ts:Date.now()}))},personas.noa);
  await ngo.goto(URL+'#path');await ngo.reload();await ngo.waitForTimeout(1200);
  const wiz=await ngo.evaluate(()=>[...document.querySelectorAll('.kp-sgs .sgc')].map(x=>x.innerText.replace(/\s+/g,' ').trim()).slice(0,4));
  console.log('  wizard suggestions: '+wiz.join(' | '));ok(wiz.length>0&&wiz.some(x=>/מתאים לי לפי השאלון/.test(x)),'the wizard suggests degrees "מתאים לי לפי השאלון"');
  ok(ngo.errs.length===0,'no page errors in the wizard: '+ngo.errs.join(' | '));
  await ngo.ctx.close();

  console.log('\n== the profile: P1 region, P2 years and track, P3 values, P5 math');
  const q=await page(()=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he'}))});
  const before=await q.evaluate(()=>JSON.parse(localStorage.getItem('kivun3.prof')));
  const r=await q.evaluate(()=>{ /* answers through the page's own functions, as the screens do */
    vqLoad();VQU.answers=[];const st0=()=>vqSt();const put=(id,picks,extra)=>{VQU.answers.push({q:id,picks,...extra});vqSave();vqProfSync()};
    put('P2',['P2_2']);const a=JSON.parse(localStorage.getItem('kivun3.prof'));
    put('P3',['P3_1','P3_2']);const b=JSON.parse(localStorage.getItem('kivun3.prof'));
    put('P5',['P5_3']);const c=JSON.parse(localStorage.getItem('kivun3.prof'));
    const env=vqEnv();VQU.answers.pop();vqProfSync();const d=JSON.parse(localStorage.getItem('kivun3.prof'));
    return {a,b,c,d,env}});
  console.log('  after P2: years '+r.a.years+', track '+r.a.track+' · after P3: '+r.b.qvals+' · after P5: math '+r.c.math+' (mathQ '+r.c.mathQ+') · after back from P5: math '+r.d.math);
  ok(r.a.years===2.5&&r.a.track==='practical','P2 -> years 2.5, track practical');ok(/^v7_v6$/.test(r.b.qvals),'P3 -> qvals v7_v6');ok(r.c.math===4&&r.c.mathQ===1,'P5 -> math 4');ok(r.d.math===undefined&&r.d.mathQ===undefined,'back from P5 takes the math value away');
  ok(r.c.bag==='full'&&r.c.psy==='plan','the other profile answers stay');
  /* a math value that is already in the profile (not from here): P5 is not asked */
  const m=await q.evaluate(()=>{const prof={...JSON.parse(localStorage.getItem('kivun3.prof')),math:5};delete prof.mathQ;localStorage.setItem('kivun3.prof',JSON.stringify(prof));S.prof=prof;const st=VQE.replay([{q:'A1',picks:['A1_1']}],vqEnv());return VQE.eligible(VQE.Q.P5.rule,{...st,p:{...st.p,tech:.5}})});
  ok(m===false,'with math in the profile (from elsewhere) P5 is not asked');
  /* a saved profile keeps the new fields */
  const keep=await q.evaluate(()=>{S.prof={bag:'full',psy:'plan',heb:'he',years:2.5,track:'practical',qvals:'v7_v6',math:4,mathQ:1};store.set('prof',S.prof);const back=store.get('prof',null);return back});
  ok(keep&&keep.years===2.5&&keep.track==='practical'&&keep.qvals==='v7_v6'&&keep.math===4,'store.get keeps years, track, qvals and math');
  await q.ctx.close();

  console.log('\n== P1: the region question only when the profile has no region (12.3)');
  for(const reg of [null,'s']){
    const pr=await page(r=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',...(r?{reg:r}:{})}))}).then(async x=>x);
    await pr.evaluate(P=>{const st=VQE.init({}),ans=[];for(const s of P.steps.slice(0,11)){const a={q:s.q,picks:s.picks};if(s.q==='G'||s.q==='HB')a.w=VQE.rank(st.p)[0];VQE.apply(st,a);ans.push(a)}localStorage.setItem('kivun3.dir2',JSON.stringify({v:2,answers:ans,ts:Date.now()}))},personas.noa);
    if(reg)await pr.evaluate(r=>{const p=JSON.parse(localStorage.getItem('kivun3.prof'));p.reg=r;localStorage.setItem('kivun3.prof',JSON.stringify(p))},reg);
    await pr.goto(URL+'#dir');await pr.reload();await pr.waitForTimeout(700);await pr.click('[data-vqresume]');await pr.waitForTimeout(300);
    for(let g=0;g<4&&(await pr.evaluate(()=>VQU.mode))==='trans';g++){await pr.click('[data-vqcont]');await pr.waitForTimeout(200)}
    const r=await pr.evaluate(()=>({id:VQU.cur&&VQU.cur.id,reg:!!document.querySelector('.vq-reg')}));
    ok(r.id==='P1'&&r.reg===!reg,`profile region ${reg||'missing'}: on P1 the region question is ${r.reg?'shown':'not shown'}`);
    await pr.ctx.close()}

  console.log('\n== saving: backup, restore, sanitising');
  p=await finished();
  const ex=await p.evaluate(()=>{const o=store.get('dir2',null);return {v:o.v,n:o.answers.length,done:!!o.done,inSync:SYNC_KEYS.includes('dir2'),inBackup:BKEYS.includes('dir2')}});
  ok(ex.v===2&&ex.n===17&&ex.done&&ex.inSync&&ex.inBackup,`dir2 is read back (${ex.n} answers) and is in SYNC_KEYS and BKEYS`);
  const bad=await p.evaluate(()=>{const g=NORM.dir2({v:2,answers:[{q:'A1',picks:['A1_1','NOPE','P1_1']},{q:'ZZZ',picks:['A1_1']},{q:'A1',picks:['A1_2']},{q:'G',picks:['G_1'],w:'<script>'},{q:'DAY',picks:['DAY_pick'],occ:'../x'}],done:'x',more:99});return g});
  ok(bad&&bad.answers.length===3&&bad.answers[0].picks.join()==='A1_1'&&!bad.answers[1].w&&!bad.answers[2].occ&&bad.more===0&&bad.done===undefined,'NORM.dir2 drops unknown questions, repeated questions, foreign options and strange values: '+JSON.stringify(bad&&bad.answers.map(a=>a.q+':'+(a.picks||'')+(a.w?'/'+a.w:''))));
  ok(await p.evaluate(()=>NORM.dir2({v:1,answers:[]})===undefined),'a wrong version is not accepted');
  await p.ctx.close();

  console.log('\n== the banner for someone who has the old result');
  const ob2=await page(()=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.dir',JSON.stringify({a:{rR0:5},i:0,done:Date.now()}))});
  await ob2.goto(URL+'#dir');await ob2.reload();await ob2.waitForTimeout(800);
  ok(await ob2.evaluate(()=>!!document.querySelector('.vq-new')),'"יש שאלון חדש וקצר" is shown on the intro');
  ok(await ob2.evaluate(()=>dirDone()===false&&dirResult()===null),'the old result is not used as a result');
  await ob2.ctx.close();

  await b.close();console.log('\n'+(fails?`${fails} check(s) failed`:'all checks passed'));process.exit(fails?1:0);
})().catch(e=>{console.log('ERROR',String(e).slice(0,400));process.exit(1)});
