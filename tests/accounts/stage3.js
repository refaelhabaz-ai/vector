#!/usr/bin/env node
/* Stage 3 tests: the questionnaire in the account (quiz_sessions / quiz_answers / quiz_results through save_quiz), against the fake server of mock.js.
   Covers: nothing is sent without an account; a run left in the middle (finished_at empty) and what it holds (order, picks, skipped = empty picks, G/HB world, DAY cards);
   "back" and "restart"; the finished run (results: 3 worlds, 9 occupations, the surprise; same as the screen); continuing a run on another device; no connection (queue, reload, later);
   a run made before signing in; nothing but quiz data in the requests.   Run: node tests/accounts/stage3.js */
const {start,USERS}=require('./lib.js');const fs=require('fs'),path=require('path');
const personas=JSON.parse(fs.readFileSync(path.join(__dirname,'..','quiz-v2','personas.json'),'utf8'));
(async()=>{
  const T=await start(),ok=T.ok,DANA=USERS.dana.id,wait=(p,ms)=>p.waitForTimeout(ms);
  const steps=Object.fromEntries(personas.noa.steps.map(s=>[s.q,s]));
  const sess=(u)=>Object.values(T.backend.u(u||DANA).quiz.sessions);
  const ans=id=>T.backend.u(DANA).quiz.answers[id]||[];
  const res=id=>T.backend.u(DANA).quiz.results[id]||[];
  /* answers with the persona's choices until `n` answers exist (or the results are shown) */
  const run=async(p,n)=>{
    for(let g=0;g<80;g++){
      const mode=await p.evaluate(()=>VQU.mode);if(mode==='res')return;
      if(n!=null&&(await p.evaluate(()=>VQU.answers.length))>=n)return;
      if(mode==='trans'){await p.click('[data-vqcont]');await wait(p,120);continue}
      const id=await p.evaluate(()=>VQU.cur.id);
      if(id==='G')await wait(p,1300);
      if(id==='DAY'){await p.click('[data-vqday]');await wait(p,150);await p.click('[data-vqnext]');await wait(p,400);continue}
      for(const pid of steps[id].picks){await p.click(`[data-vqo="${pid}"]`);await wait(p,40)}
      const nb=await p.$('[data-vqnext]');if(nb&&!(await nb.isDisabled()))await nb.click();await wait(p,420)}};
  const lsGet=(p,k)=>p.evaluate(k=>{try{return JSON.parse(localStorage.getItem('kivun3.'+k))}catch(e){return null}},k);

  console.log('\n== no account: nothing leaves the device');
  const N=await T.device({});await N.click('[data-vqstart]');await wait(N,300);await run(N,3);await wait(N,2600);
  ok(N.mock.log.length===0,'no request at all while answering');
  ok(!(await lsGet(N,'quizq')),'no queue');
  const d2=await lsGet(N,'dir2');
  ok(d2&&d2.sid&&/^[0-9a-f-]{36}$/.test(d2.sid)&&d2.answers.length===3&&d2.answers.every(a=>a.t>0),'the run still gets an id and a time per answer on the device ('+(d2&&d2.sid)+')');

  console.log('\n== a run left in the middle');
  const A=await T.device({});await T.login(A,'#dir');await T.nick(A);
  await A.click('[data-vqstart]');await wait(A,300);await run(A,3);await wait(A,2800);
  let S=sess();
  ok(S.length===1,'one session in the account');
  const s1=S[0]||{};
  ok(s1.finished_at===null&&s1.n_questions===3&&s1.quiz_version==='2.0'&&s1.user_id===DANA,'unfinished (finished_at empty), 3 questions, version 2.0, this user: '+JSON.stringify({f:s1.finished_at,n:s1.n_questions,v:s1.quiz_version}));
  ok(Array.isArray(s1.top_worlds)&&s1.top_worlds.length===3&&s1.confidence===null,'the three leading worlds so far, no confidence yet: '+JSON.stringify(s1.top_worlds));
  const a1=ans(s1.id);
  ok(a1.length===3&&a1.map(a=>a.question_id).join()===personas.noa.steps.slice(0,3).map(s=>s.q).join(),'the answers are there, in order: '+a1.map(a=>a.question_id));
  ok(JSON.stringify(a1[0].picks)===JSON.stringify(steps.A1.picks)&&a1.every((a,i)=>a.idx===i),'with their picks and positions');
  ok(a1.every(a=>Date.parse(a.answered_at)>=Date.parse(s1.started_at)),'each answer has its own time, after the start');
  ok(res(s1.id).length===0,'no results yet');
  console.log('   -- back, and a skipped question');
  await A.click('[data-vqback]');await wait(A,2800);
  ok(ans(s1.id).length===2&&sess()[0].n_questions===2,'"back" removes the last answer from the account');
  await A.click('[data-vqskip]');await wait(A,2800);
  const a2=ans(s1.id);
  ok(a2.length===3&&a2[2].picks.length===0,'a skipped question is an answer with empty picks');
  await A.click('[data-vqback]');await wait(A,600);   /* take the skip back, to continue with the persona */

  console.log('\n== the finished run');
  await run(A);await wait(A,3000);
  S=sess();const f=S.find(x=>x.id===s1.id);
  ok(S.length===1&&f&&f.finished_at&&Date.parse(f.finished_at)>=Date.parse(f.started_at),'the same session now has finished_at');
  ok(['clear','direction','open'].includes(f.confidence)&&f.n_questions===personas.noa.steps.length,'a confidence, and the number of questions ('+f.n_questions+')');
  const R=res(f.id),W=R.filter(r=>r.kind==='world'),O=R.filter(r=>r.kind==='occupation'),X=R.filter(r=>r.kind==='wildcard');
  ok(W.length===3&&W.map(r=>r.rank).join()==='1,2,3'&&W.every(r=>r.score>0&&r.score<=1),'3 worlds with their probability: '+W.map(r=>r.code+' '+r.score).join(', '));
  ok(O.length===9&&O.map(r=>r.rank).join()==='1,2,3,4,5,6,7,8,9'&&O.every(r=>/^\d{4}$/.test(r.code)&&typeof r.score==='number'),'9 occupations in the order they were shown');
  const shown=await A.evaluate(()=>({w:document.querySelector('h1').textContent,occ:[...document.querySelectorAll('.vq-occ [data-occ]')].map(b=>b.dataset.occ)}));
  ok(JSON.stringify(shown.occ)===JSON.stringify(O.map(r=>r.code)),'the occupations are the ones on the screen: '+shown.occ.join(','));
  ok(JSON.stringify(f.top_worlds)===JSON.stringify(W.map(r=>r.code))&&shown.w.includes(await A.evaluate(c=>VQW[c].n,W[0].code)),'the first world is the one on the screen, and top_worlds agrees');
  ok(X.length<=1,'the surprise ('+(X[0]?X[0].code:'none')+')');
  const af=ans(f.id),g=af.find(a=>a.question_id==='G'),day=af.find(a=>a.question_id==='DAY');
  ok(g&&g.meta&&typeof g.meta.w==='string'&&g.picks.length===1,'G: the answer and the world we asked about: '+JSON.stringify(g&&g.meta));
  ok(day&&day.picks[0]==='DAY_pick'&&day.meta&&day.meta.occ&&day.meta.cards&&day.meta.cards.length===3,'DAY: the chosen card and the three cards: '+JSON.stringify(day&&day.meta));
  ok(af.every(a=>!a.meta||JSON.stringify(a.meta).length<2048),'every meta is small');
  console.log('   -- "back" from the results, and "3 more questions"');
  await A.click('[data-vqmore]');await wait(A,2800);
  ok(sess().length===1&&sess()[0].n_questions>f.n_questions-1,'still one session');
  for(let g=0;g<8&&(await A.evaluate(()=>VQU.mode))!=='res';g++){const m=await A.evaluate(()=>VQU.mode);if(m==='trans')await A.click('[data-vqcont]');else await A.click('[data-vqskip]');await wait(A,350)}
  await wait(A,2800);
  ok(sess().length===1&&sess()[0].finished_at&&sess()[0].n_questions>=f.n_questions+1,'the extra questions are part of the same run, finished again: '+sess()[0].n_questions+' questions');
  console.log('   -- restart');
  await A.click('[data-vqstart]');await wait(A,400);await run(A,2);await wait(A,2800);
  S=sess();
  ok(S.length===2,'a restart is a new session; the old one stays: '+S.length);
  const old=S.find(x=>x.id===f.id);ok(old&&res(old.id).length>0&&!!old.finished_at,'the old run keeps its results and its finish time');
  ok(S.find(x=>x.id!==f.id).finished_at===null&&ans(S.find(x=>x.id!==f.id).id).length===2,'the new run is in the middle, with its 2 answers');

  console.log('\n== continuing a run on another device');
  const cur=await lsGet(A,'dir2');
  const B=await T.device({});await B.evaluate(()=>localStorage.removeItem('kivun3.dir2'));await B.reload();await wait(B,300);await T.login(B,'#dir');await T.nick(B);
  ok((await lsGet(B,'dir2')||{}).sid===cur.sid,'the run id came with the account data');
  await B.click('[data-vqresume]');await wait(B,500);await run(B,3);await wait(B,2800);
  S=sess();const cont=S.find(x=>x.id===cur.sid);
  ok(S.length===2&&cont&&cont.n_questions===3&&ans(cont.id).length===3,'B added to the same session (no new session): '+S.length+' sessions');

  console.log('\n== no connection');
  await A.mock.set({down:true});await A.evaluate(()=>{});
  await A.reload();await wait(A,600);await A.click('[data-vqresume]');await wait(A,400);
  const before=ans(cur.sid).length;await run(A,(await A.evaluate(()=>VQU.answers.length))+2);await wait(A,2600);
  ok(Object.keys(await lsGet(A,'quizq')||{}).length>=1,'while offline the latest state of the run waits in the queue');
  ok(A.errs.length===0,'the questionnaire works, no errors: '+A.errs.join(';'));
  await A.reload();await wait(A,800);
  ok(Object.keys(await lsGet(A,'quizq')||{}).length>=1,'the queue survives a reload');
  await A.mock.set({down:false});await A.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(A,3500);
  ok(Object.keys(await lsGet(A,'quizq')||{}).length===0&&ans(cur.sid).length>before,'when the connection is back it is sent: '+ans(cur.sid).length+' answers');

  console.log('\n== a run made before signing in');
  const be3=require('./mock.js').createBackend();
  const P=await T.device({backend:be3});await P.click('[data-vqstart]');await wait(P,300);await run(P,3);
  const sid=(await lsGet(P,'dir2')).sid;
  ok(!be3.u(DANA).quiz.sessions[sid],'not in the account yet');
  await T.login(P,'#dir');await T.nick(P);await wait(P,3000);
  ok(be3.u(DANA).quiz.sessions[sid]&&be3.u(DANA).quiz.answers[sid].length===3,'after signing in, the run that was already on the device goes up');

  console.log('\n== what is sent');
  const bodies=A.mock.log.filter(r=>/save_quiz/.test(r.path)).map(r=>r.body).join(' ');
  ok(bodies.length>0&&!/dana@example|@/.test(bodies)&&!/"(inc|first|svc|res|resAt|sex|reg|bag|stage)"/.test(bodies),'the quiz requests hold no email and no profile fields');
  ok(A.mock.log.filter(r=>r.method==='POST'&&/save_quiz/.test(r.path)).length<=40,'and not an excessive number of calls: '+A.mock.log.filter(r=>/save_quiz/.test(r.path)).length);
  ok([A,B,P,N].every(x=>x.errs.length===0),'no page errors');
  await T.close();
})().catch(e=>{console.log('ERROR',String(e).slice(0,600));process.exit(1)});
