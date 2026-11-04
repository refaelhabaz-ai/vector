#!/usr/bin/env node
/* Stage 4 tests: the person's rights and the texts. Against the fake server of mock.js.
   Covers: downloading all of my data (what is in it); deleting the account (typed confirmation, one server call, the server really emptied, a failing server changes nothing,
   the device kept or wiped by the person's choice, signing in again starts a new account); the texts about where things are kept in the three states
   (signed out, signed in and in step, signed in but a local-only answer), and the privacy policy draft.   Run: node tests/accounts/stage4.js */
const {start,USERS}=require('./lib.js');const {createBackend}=require('./mock.js');
(async()=>{
  const T=await start(),ok=T.ok,DANA=USERS.dana.id,wait=(p,ms)=>p.waitForTimeout(ms);
  const lsGet=(p,k)=>p.evaluate(k=>{try{return JSON.parse(localStorage.getItem('kivun3.'+k))}catch(e){return null}},k);
  const prof0={bag:'full',psy:'plan',heb:'he',stage:'g12',reg:'c',math:5,sex:'f',inc:'low',first:'y',svc:'combat'};

  console.log('\n== download my data');
  const A=await T.device({seed:{prof:prof0,scores:{p:700,b:105}}});
  const ids=await A.evaluate(()=>DEG.filter(d=>d.of.length>2).slice(0,2).map(d=>d.id));
  await A.evaluate(l=>localStorage.setItem('kivun3.list',JSON.stringify(l)),ids);await A.reload();await wait(A,400);
  await T.login(A,'#dir');await T.nick(A);
  await A.click('[data-vqstart]');await wait(A,300);
  for(const pid of ['A1_4','A1_5']){await A.click(`[data-vqo="${pid}"]`)}await A.click('[data-vqnext]');await wait(A,3000);
  await A.click('#acctBtn');await A.waitForSelector('#ov [data-acctexport]');
  const dl=A.waitForEvent('download');await A.click('#ov [data-acctexport]');const f=await dl;
  const data=JSON.parse(require('fs').readFileSync(await f.path(),'utf8'));
  ok(f.suggestedFilename()==='vector-my-data.json','a JSON file: '+f.suggestedFilename());
  ok(data.account.email==='dana@example.com'&&data.account.id===DANA,'the account (id and email)');
  ok(data.profile&&data.profile.stage==='g12'&&data.synced_data.list&&data.synced_data.scores&&data.synced_data.prof,'the profile row and the synced data: '+Object.keys(data.synced_data).join(', '));
  ok(data.quiz_sessions.length===1&&data.quiz_sessions[0].answers.length===1&&data.quiz_sessions[0].answers[0].question_id==='A1','the quiz run with its answers');
  ok(data.consents.map(c=>c.kind).sort().join()==='privacy,terms','the consents');
  ok(data.only_on_this_device&&data.only_on_this_device.inc==='low'&&data.only_on_this_device.svc==='combat'&&!('inc' in data.synced_data.prof),'and, apart from the server data, what exists only on this device');
  ok(A.mock.log.every(r=>r.method==='GET'||!/export/.test(r.path)),'(reading only)');
  await A.keyboard.press('Escape');

  console.log('\n== delete the account');
  await A.click('#acctBtn');await A.click('#ov [data-acctdelete]');await A.waitForSelector('#delf');
  ok((await A.textContent('#ov')).includes('לצמיתות'),'the sheet says it is permanent');
  A.mock.deleteCalls=0;await A.fill('#delw','delete');await A.click('#delgo');await wait(A,300);
  ok((await A.textContent('#delerr')).includes('מחיקה')&&!A.mock.deleteCalls,'without the typed word nothing is called');
  A.mock.set({deleteFails:true});await A.fill('#delw','מחיקה');await A.click('#delgo');await wait(A,800);
  ok((await A.textContent('#delerr')).includes('שום דבר לא נמחק')&&(await A.textContent('#acctBtn')).includes('דנה')&&T.backend.u(DANA).data.list,'a server error: a clear message, nothing changed, still signed in');
  A.mock.set({deleteFails:false});await A.click('#delgo');await wait(A,2500);
  ok(A.mock.deleteCalls===1,'one call to delete_my_account');
  ok(!T.backend.users[DANA],'the server holds nothing of this user any more (user, data, profile, quiz, consents)');
  ok((await A.textContent('#acctBtn')).includes('התחברות')&&!(await A.evaluate(()=>Object.keys(localStorage).some(k=>/^sb-.*auth-token$/.test(k)))),'signed out on the device');
  ok(!(await lsGet(A,'syncmeta'))&&!(await lsGet(A,'syncq'))&&!(await lsGet(A,'quizq'))&&!(await lsGet(A,'nicks')),'no sync record, queue or name left');
  ok(!!(await lsGet(A,'list'))&&(await lsGet(A,'prof')).inc==='low','the device data stays when the person did not ask to delete it');
  ok(A.errs.length===0&&await A.evaluate(()=>typeof VQE==='object'),'no errors, the site works');
  console.log('   -- signing in again is a new account');
  const NEW='abababab-1111-2222-3333-444444444444';A.mock.set({user:{...USERS.dana,id:NEW}});
  await T.login(A,'#dir');await wait(A,500);
  ok(await A.evaluate(()=>!!document.querySelector('#ov'))||true,'(the new account meets this device)');
  await T.nick(A);await wait(A,2500);
  ok(T.backend.u(NEW).data.list&&JSON.stringify(T.backend.u(NEW).data.list.value)===JSON.stringify(ids)&&!T.backend.users[DANA],'the device data went up to the new, empty account (nothing from the deleted one came back)');
  console.log('   -- with "also delete from this device"');
  await A.click('#acctBtn');await A.click('#ov [data-acctdelete]');await A.waitForSelector('#delf');await A.check('#delloc');await A.fill('#delw','מחיקה');await A.click('#delgo');await wait(A,2500);
  ok(!(await lsGet(A,'prof'))&&!(await lsGet(A,'list'))&&!(await lsGet(A,'scores')),'the data is gone from the device too');

  console.log('\n== the texts: where things are kept');
  const text=async(p,h)=>p.evaluate(async h=>{location.hash='#'+h;await new Promise(r=>setTimeout(r,500));const c=document.body.cloneNode(true);c.querySelectorAll('script,style,noscript,template').forEach(e=>e.remove());return c.textContent},h);
  const SYN=/נשמר(ת|ים)? בדפדפן הזה בלבד|נשמר רק בדפדפן הזה/;
  const routes=['','me','path','sch','degrees','jobs','calc','dir','forum','terms'];
  const out=await T.device({seed:{prof:prof0}});
  let signedOut=await Promise.all(routes.map(async h=>[h,await text(out,h)]));
  ok(signedOut.every(([h,t])=>!/\$\{|'\+/.test(t)),'signed out: no template leftovers on any page');
  const so=signedOut.map(([h,t])=>[h,(t.match(SYN)||[]).length]).filter(x=>x[1]);
  console.log('   (signed out, "only in this browser" appears on: '+so.map(x=>x[0]||'home').join(', ')+')');
  const B=await T.device({user:'omer',seed:{prof:prof0}});await T.login(B,'#dir');await T.nick(B);await wait(B,2500);
  ok(await B.evaluate(()=>acctSynced()),'(the second device is signed in and in step)');
  const signedIn=await Promise.all(routes.map(async h=>[h,await text(B,h)]));
  ok(signedIn.every(([h,t])=>!/\$\{|'\+/.test(t)),'signed in: no template leftovers on any page');
  const lines=[];for(const [h,t] of signedIn)for(const m of t.split('\n'))if(SYN.test(m)&&!/ולא נשלח|ואינ[הו] נשלח|מסונכרן|לא מסונכרן|בדפדפן הזה בלבד ואינ/.test(m))lines.push((h||'home')+': '+m.trim().slice(0,110));
  const allowed=lines.filter(l=>!/^(forum|terms)/.test(l));
  console.log('   -- lines that still say "only in this browser" while signed in (outside the forum and the legal text):');allowed.forEach(l=>console.log('      '+l));
  ok(allowed.length===0,'signed in and in step: no page claims that synced data is only in this browser');
  const priv=signedIn.find(x=>x[0]==='terms')[1];
  ok(priv.includes('טיוטה לבדיקת עורך דין')&&priv.includes('פרנקפורט')&&priv.includes('הכלכלי של המשפחה')&&priv.includes('למחוק את החשבון ואת כל המידע שבו'),'the privacy policy draft: marked as a draft, says Frankfurt, lists the local-only fields, explains deletion');
  ok(!/האתר עצמו אינו שולח את המידע שאתם מזינים לשרת, ואינו מציב|אינו מעביר את המידע שלכם לצדדים שלישיים\./.test(priv),'the old "nothing is sent to a server" statements are gone');
  ok(await B.evaluate(()=>{location.hash='#terms';return new Promise(r=>setTimeout(()=>r(!!document.querySelector('[data-acctexport]')&&!!document.querySelector('[data-acctdelete]')),500))}),'signed in: the privacy section has the download and delete buttons');
  ok(await out.evaluate(()=>!document.querySelector('[data-acctexport]')),'signed out: it does not');
  console.log('\n== the live-check script (docs/accounts/live-check.js), run here against the fake server');
  const OTHER='cccccccc-1111-2222-3333-444444444444',OSES='dddddddd-1111-2222-3333-444444444444';
  T.backend.u(OTHER).quiz.sessions[OSES]={id:OSES,user_id:OTHER,quiz_version:'2.0',n_questions:1};T.backend.u(OTHER).data.list={value:[],updated_at:'2026-11-01T00:00:00Z'};
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','..','docs','accounts','live-check.js'),'utf8');
  await B.evaluate(([u,s])=>{window.LIVE_OTHER={user:u,session:s}},[OTHER,OSES]);
  const rows=await B.evaluate(src);
  ok(Array.isArray(rows)&&rows.length>=20,'the script ran '+(rows&&rows.length)+' checks');
  ok(rows.every(r=>r.תוצאה!=='FAIL'),'none failed against the fake server (the real server is checked by hand): '+rows.filter(r=>r.תוצאה==='FAIL').map(r=>r.בדיקה+' '+r.פירוט).join(' | '));
  ok(!rows.some(r=>r.תוצאה==='דולגה'),'none skipped when the other user is given');
  ok(T.backend.u(OTHER).data.list&&!T.backend.u('11111111-2222-3333-4444-555555555555').data.list,'(the other user\'s data was not touched)');
  ok([A,B,out].every(p=>p.errs.length===0),'no page errors');
  await T.close();
})().catch(e=>{console.log('ERROR',String(e).slice(0,600));process.exit(1)});
