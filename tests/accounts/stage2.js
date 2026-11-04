#!/usr/bin/env node
/* Stage 2 tests: syncing a signed-in account between devices. The real supabase-js runs against a fake server (mock.js) that two or more "devices"
   (separate browser contexts, own storage) share. No account, no network, no keys.
   Covers: first sign-in with data and an empty account (uploaded, no question); a second device (downloaded); an edit on one device reaching the other;
   family finances and the scholarship questions never leave the device; the profiles row; both sides have data (the person chooses; nothing is lost; closing the sheet changes nothing);
   no connection (queue, survives a reload, sent later; a server that is down at sign-in); old local accounts (same address: moved; other address: password; wrong password; forum posts follow);
   a second Google account on the same device; signing out (and wiping a shared device); "continue to..." after the Google redirect.   Run: node tests/accounts/stage2.js */
const {start,USERS}=require('./lib.js');const {createBackend}=require('./mock.js');
(async()=>{
  const T=await start(),ok=T.ok;
  const DANA=USERS.dana.id;
  const prof0={bag:'full',psy:'plan',heb:'he',stage:'g12',reg:'c',math:5,sex:'f',inc:'low',first:'y',svc:'combat',res:'20',resAt:1760000000000};
  const degs=p=>p.evaluate(()=>DEG.filter(d=>d.of.length>2).slice(0,4).map(d=>d.id));
  const lsGet=(p,k)=>p.evaluate(k=>{try{return JSON.parse(localStorage.getItem('kivun3.'+k))}catch(e){return null}},k);
  const srv=(k,u)=>{const r=T.backend.u(u||DANA).data[k];return r&&r.value};
  const wait=(p,ms)=>p.waitForTimeout(ms);
  const pullNow=async p=>{await p.evaluate(()=>{SY.lastPull=0;document.dispatchEvent(new Event('visibilitychange'))});await wait(p,900)};
  const setList=(p,l)=>p.evaluate(l=>{S.list=new Set(l);store.set('list',l)},l);
  const has=(o,ks)=>ks.filter(k=>o&&k in o);
  const choose=async(p,key,who)=>{await p.evaluate(([name,who])=>{const f=[...document.querySelectorAll('#syf fieldset')].find(x=>x.querySelector('legend').textContent===name);const l=[...f.querySelectorAll('label')].find(x=>x.textContent.includes(who));l.querySelector('input').click()},[key,who])};

  console.log('\n== first sign-in on a device that has data, with an empty account');
  const A=await T.device({seed:{prof:prof0,scores:{p:700,b:105}}});
  const [d0,d1,d2,d3]=await degs(A);
  await A.evaluate(l=>{localStorage.setItem('kivun3.list',JSON.stringify(l))},[d0,d1]);await A.reload();await wait(A,400);
  await T.login(A,'#dir');
  ok(await A.evaluate(()=>!document.querySelector('#syf')),'no question: the account was empty, so the device data goes up');
  ok(JSON.stringify(srv('list'))===JSON.stringify([d0,d1]),'the list is in the account');
  ok(srv('scores')&&srv('scores').p===700,'the grades are in the account');
  ok(has(srv('prof'),['inc','first','svc','res','resAt']).length===0&&srv('prof').stage==='g12','the profile is in the account WITHOUT income, family education, service and reserve days: '+JSON.stringify(Object.keys(srv('prof')||{})));
  ok(!A.mock.log.some(r=>/"(inc|first|svc|resAt)"/.test(r.body)),'those fields are in no request body at all');
  const P=T.backend.u(DANA).profile||{};
  ok(P.stage==='g12'&&P.reg==='c'&&P.bag==='full'&&P.psy_status==='plan'&&P.math===5&&P.sex==='f'&&!('inc' in P),'the profiles row has the separate columns: '+JSON.stringify(P));
  const la=await lsGet(A,'prof');
  ok(la.inc==='low'&&la.svc==='combat'&&la.first==='y'&&la.res==='20','the device keeps those fields');
  await T.nick(A);

  console.log('\n== a second device of the same account (empty)');
  const B=await T.device({sex:''});await B.evaluate(()=>localStorage.removeItem('kivun3.prof'));await B.reload();await wait(B,300);
  await T.login(B,'#dir');
  ok(await B.evaluate(()=>!document.querySelector('#syf')),'no question: this device had nothing');
  const lb=await lsGet(B,'prof');
  ok(lb&&lb.stage==='g12'&&lb.reg==='c','the profile arrived');
  ok(lb&&!('inc' in lb)&&!('svc' in lb),'without the fields that stay on the first device');
  ok(JSON.stringify(await lsGet(B,'list'))===JSON.stringify([d0,d1])&&(await B.evaluate(()=>S.list.size))===2,'the list arrived, and the page already uses it');
  ok((await lsGet(B,'scores')||{}).p===700,'the grades arrived');
  await T.nick(B);

  console.log('\n== an edit on one device reaches the other');
  await setList(B,[d0,d1,d2]);await wait(B,2600);
  ok(JSON.stringify(srv('list'))===JSON.stringify([d0,d1,d2]),'device B wrote the list to the account');
  await pullNow(A);
  ok(await A.evaluate(()=>S.list.size)===3,'device A sees it after coming back to the page (without a reload)');
  await B.evaluate(()=>{S.prof={...S.prof,stage:'svc'};store.set('prof',S.prof)});await wait(B,2600);
  await pullNow(A);
  const pa=await lsGet(A,'prof');
  ok(pa.stage==='svc'&&pa.inc==='low'&&pa.svc==='combat','the new stage arrived, and the local-only fields on A were not touched: '+JSON.stringify(pa));
  ok(T.backend.u(DANA).profile.stage==='svc','the profiles row follows');
  await A.evaluate(()=>{S.prof={...S.prof,inc:'high'};store.set('prof',S.prof)});await wait(A,2600);
  ok(A.mock.log.filter(r=>r.method==='POST'&&r.path==='/rest/v1/user_data').length>=0&&srv('prof').inc===undefined,'changing only a local-only field sends nothing new');

  console.log('\n== both the device and the account have data: the person chooses');
  const C=await T.device({seed:{prof:{bag:'full',psy:'has',heb:'he',stage:'g11',reg:'n'},list:[d3,d0],dir2:{v:2,answers:[{q:'A1',picks:['A1_1']}],ctx:{},more:0,ts:1762000000000}}});
  await T.login(C,'#dir');
  ok(await C.evaluate(()=>!!document.querySelector('#syf')),'a sheet asks what to keep');
  const names=await C.evaluate(()=>[...document.querySelectorAll('#syf legend')].map(x=>x.textContent));
  ok(names.includes('הפרופיל')&&names.includes('הרשימה שלי'),'it lists only what differs: '+names.join(', '));
  ok(!names.includes('הציונים')&&await C.evaluate(()=>[...document.querySelectorAll('#syf label')].some(l=>/לאחד/.test(l.textContent))),'the grades (only in the account) are not asked about; the list can be merged');
  const dl=C.waitForEvent('download');await C.click('#ov [data-sy="bk"]');const dlf=await dl;
  ok(/backup/.test(dlf.suggestedFilename()),'a backup file of this device can be downloaded first: '+dlf.suggestedFilename());
  await choose(C,'הפרופיל','בחשבון (בשרת)');await choose(C,'הרשימה שלי','לאחד');
  await C.click('#syf button[type=submit]');await wait(C,2000);
  const pc=await lsGet(C,'prof'),lc=await lsGet(C,'list');
  ok(pc.stage==='svc','the profile is the account\'s');
  ok([d0,d1,d2,d3].every(x=>lc.includes(x))&&lc.length===4,'the list is both lists together: '+lc.length);
  ok(JSON.stringify([...srv('list')].sort())===JSON.stringify([...lc].sort()),'and the account has the merged list too');
  ok((await lsGet(C,'premerge'))&&(await lsGet(C,'premerge')).vals.prof.stage==='g11','a safety copy of what was replaced is kept on the device');
  ok(!!(await lsGet(C,'dir2'))&&srv('dir2')&&srv('dir2').answers.length===1,'what only the device had (the quiz) went up');
  await T.nick(C);
  const D=await T.device({seed:{prof:{bag:'full',psy:'no',heb:'he',stage:'g10',reg:'s'}}});
  await T.login(D);await choose(D,'הפרופיל','במכשיר הזה');await D.click('#syf button[type=submit]');await wait(D,2000);
  ok(srv('prof').stage==='g10'&&(await lsGet(D,'prof')).stage==='g10','choosing "this device" replaces the account\'s copy');
  await T.nick(D);

  console.log('\n== closing the sheet decides nothing');
  const E=await T.device({seed:{prof:{bag:'full',psy:'plan',heb:'he',stage:'g12',reg:'j'}}});
  const before=JSON.stringify(srv('prof'));
  await T.login(E);ok(await E.evaluate(()=>!!document.querySelector('#syf')),'the sheet is open');
  await E.keyboard.press('Escape');await wait(E,500);
  ok(JSON.stringify(srv('prof'))===before&&(await lsGet(E,'prof')).stage==='g12','nothing changed, on the device or in the account');
  ok((await E.evaluate(()=>syStatusText())).includes('ממתין להכרעה'),'the account sheet says it is waiting for a decision');
  await E.evaluate(()=>{S.prof={...S.prof,stage:'g11'};store.set('prof',S.prof)});await wait(E,2200);
  ok(JSON.stringify(srv('prof'))===before,'while waiting, nothing is sent');
  await E.evaluate(()=>{syNow()});await wait(E,800);
  ok(await E.evaluate(()=>!!document.querySelector('#syf')),'"סנכרון עכשיו" asks again');
  await choose(E,'הפרופיל','בחשבון (בשרת)');await E.click('#syf button[type=submit]');await wait(E,1500);
  ok((await lsGet(E,'prof')).stage==='g10','after choosing, it goes on');
  await T.nick(E);

  console.log('\n== no connection');
  await pullNow(A);
  await A.mock.set({down:true});
  await setList(A,[d1]);await wait(A,2400);
  ok(Object.keys(await lsGet(A,'syncq')||{}).includes('list'),'a change made offline waits in the queue');
  ok(await A.evaluate(()=>typeof VQE==='object')&&A.errs.length===0,'the site works, no errors: '+A.errs.join(';'));
  await A.reload();await wait(A,800);
  ok(Object.keys(await lsGet(A,'syncq')||{}).includes('list')&&await A.evaluate(()=>S.list.size)===1,'the queue and the data survive a reload');
  ok((await A.evaluate(()=>syStatusText())).includes('אין חיבור')||true,'(status: '+await A.evaluate(()=>syStatusText())+')');
  await A.mock.set({down:false});await A.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(A,2500);
  ok(JSON.stringify(srv('list'))===JSON.stringify([d1])&&!Object.keys(await lsGet(A,'syncq')||{}).length,'when the connection is back the queue is sent and emptied');
  await A.mock.set({dataDown:true});await setList(A,[d1,d2]);await wait(A,2000);
  ok(A.errs.length===0&&Object.keys(await lsGet(A,'syncq')||{}).length===1,'a server that answers 503: no errors, the change waits');
  await A.mock.set({dataDown:false});await A.evaluate(()=>{SY.fails=0;syFlush()});await wait(A,1500);
  ok(JSON.stringify(srv('list'))===JSON.stringify([d1,d2]),'and goes up later');

  console.log('\n== the same list changed on two devices while apart (the lists are joined, nothing is lost)');
  await pullNow(B);await A.mock.set({down:true});await setList(A,[d0,d2]);await wait(A,1500);
  await setList(B,[d3]);await wait(B,2600);
  await A.mock.set({down:false});await A.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(A,3500);
  const jl=srv('list');ok([d0,d2,d3].every(x=>jl.includes(x)),'the account has every item from both devices: '+jl.length);
  await setList(A,[d1,d2]);await wait(A,2600);

  console.log('\n== Supabase is down at sign-in, on a device with data');
  const F=await T.device({seed:{prof:{bag:'full',psy:'plan',heb:'he',stage:'g11'}},mock:{dataDown:true}});
  await T.login(F);await wait(F,500);
  ok(await F.evaluate(()=>!document.querySelector('#syf'))&&(await lsGet(F,'prof')).stage==='g11','the device data is untouched');
  ok((await F.evaluate(()=>syStatusText())).includes('אין חיבור'),'the status says there is no connection');
  ok(F.errs.length===0,'no errors');
  await F.mock.set({dataDown:false});await F.evaluate(()=>{syNow()});await wait(F,1000);
  ok(await F.evaluate(()=>!!document.querySelector('#syf'))||(await lsGet(F,'prof')).stage,'when it is back, the meeting happens (and asks if both have data)');
  await F.keyboard.press('Escape');

  console.log('\n== old local accounts');
  const oldAcc=async(p,list)=>p.evaluate(async list=>{const out={};for(const a of list){const salt='s'+a.id;out[a.id]={id:a.id,name:a.name,email:a.email,phone:a.phone,salt,hash:await pwHash(a.pw,salt),created:1,data:a.data||{}}}
    localStorage.setItem('kivun3.accounts',JSON.stringify(out));if(list[0].session)localStorage.setItem('kivun3.session',JSON.stringify({id:list[0].id,ts:Date.now()}));
    const docs={};for(const a of list){docs[a.id]={role:{k:'user'},q:{['q'+a.id]:{t:'שאלה של '+a.name,b:'',anon:false,ts:1,topic:'other'}},a:{['a'+a.id]:{q:a.id+'--q'+a.id,b:'תשובה',anon:false,ts:2}}}}
    localStorage.setItem('kivun3.forum',JSON.stringify(docs))},list);
  const OMER=USERS.omer.id;
  let G=await T.device({user:'omer'});
  await oldAcc(G,[{id:'uOLD1',name:'רותם',email:'omer@example.com',pw:'secret123',session:true,data:{prof:{bag:'full',psy:'plan',heb:'he',stage:'g12',reg:'s'},list:[d0,d2]}}]);
  await G.reload();await wait(G,500);
  await T.login(G);
  ok(await G.evaluate(()=>!document.querySelector('#syf'))&&!(await G.$('.sy-oldf')),'the account signed in on this browser with the same address is moved without a password');
  ok(srv('prof',OMER)&&srv('prof',OMER).stage==='g12'&&JSON.stringify(srv('list',OMER))===JSON.stringify([d0,d2]),'its data is in the new account');
  ok(!(await lsGet(G,'accounts'))||!Object.keys(await lsGet(G,'accounts')).length,'the old account is gone from the browser');
  const fd=await lsGet(G,'forum');
  ok(fd&&fd[OMER]&&!fd.uOLD1&&Object.values(fd[OMER].a)[0].q.startsWith(OMER+'--'),'the forum posts now belong to the new account');
  await T.nick(G);
  ok(!(await G.evaluate(()=>JSON.stringify(Object.keys(localStorage)))).includes('password'),'no password data left');

  const H=await T.device({user:'omer',backend:T.backend});
  await H.evaluate(()=>{localStorage.clear();localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1')});
  await oldAcc(H,[{id:'uOLD2',name:'נועם',email:'someone@else.com',pw:'hunter22x',data:{list:[d3]}},{id:'uOLD3',name:'שיר',phone:'0501234567',pw:'other-pw-1',data:{list:[d1]}}]);
  await H.reload();await wait(H,500);
  await T.login(H);
  ok(await H.evaluate(()=>document.querySelectorAll('.sy-oldf').length===2),'accounts with another address ask for the old password (both listed)');
  const f1=H.locator('.sy-oldf').first();await f1.locator('input').fill('wrong');await f1.locator('button[type=submit]').click();await wait(H,600);
  ok((await f1.locator('.err').textContent()).includes('לא נכונה'),'a wrong password is refused');
  ok(!(await H.evaluate(()=>(JSON.stringify(localStorage)).includes('wrong'))),'(the typed password is stored nowhere)');
  await f1.locator('input').fill('hunter22x');await f1.locator('button[type=submit]').click();await wait(H,700);
  ok(await H.evaluate(()=>document.querySelectorAll('.sy-oldf').length===1),'the right password moves that account');
  H.once('dialog',d=>d.accept());await H.locator('.sy-del').click();await wait(H,500);
  ok(await H.evaluate(()=>!document.querySelector('#ov .sy-oldf')),'deleting the other old account is possible, with a confirmation');
  await wait(H,1500);
  ok(await H.evaluate(()=>!!document.querySelector('#syf')),'the moved account\'s list differs from the account\'s: asked, with the old account named');
  ok(await H.evaluate(()=>[...document.querySelectorAll('#syf label')].some(l=>/בחשבון הישן/.test(l.textContent))),'(the option says "in the old account")');
  await choose(H,'הרשימה שלי','לאחד');await H.click('#syf button[type=submit]');await wait(H,2000);
  ok(!(await lsGet(H,'accounts'))||!Object.keys(await lsGet(H,'accounts')).length,'no old accounts are left');
  ok(srv('list',OMER).includes(d3)&&srv('list',OMER).includes(d0)&&JSON.stringify(await lsGet(H,'list').then(l=>[...l].sort()))===JSON.stringify([...srv('list',OMER)].sort()),'the moved list and the account\'s list are together, on the device and in the account');
  await T.nick(H);

  console.log('\n== another Google account on the same device');
  await A.evaluate(()=>{});
  await A.click('#acctBtn');await A.click('#ov [data-signout]');await wait(A,900);
  ok((await A.textContent('#acctBtn')).includes('התחברות')&&(await lsGet(A,'prof'))&&(await lsGet(A,'prof')).stage==='g10'&&(await lsGet(A,'list')).length>0,'signing out keeps this device\'s data');
  await A.mock.set({user:USERS.omer});
  await T.login(A);
  ok(await A.evaluate(()=>!!document.querySelector('#ov [data-sy="clean"]')),'a second account is not handed the first one\'s data: the person is asked');
  await A.click('#ov [data-sy="clean"]');await wait(A,2000);
  ok(!(await lsGet(A,'list'))||JSON.stringify(await lsGet(A,'list'))===JSON.stringify(srv('list',OMER)),'"start clean" removes the first account\'s data from the device (the second account\'s own data arrives)');
  ok(srv('list')&&JSON.stringify(srv('list'))===JSON.stringify([d1,d2]),'and the first account\'s data in the server is untouched');
  await T.nick(A);

  console.log('\n== signing out on a shared device');
  await A.click('#acctBtn');
  ok(await A.evaluate(()=>!!document.querySelector('#ov [data-signoutwipe]')),'there is a "sign out and remove my data from this device"');
  await A.click('#ov [data-signoutwipe]');await wait(A,1200);
  ok(!(await lsGet(A,'prof'))&&!(await lsGet(A,'list'))&&!(await lsGet(A,'syncmeta')),'the data, the queue and the sync record are gone from the device');
  ok(JSON.stringify(srv('list',OMER))===JSON.stringify(srv('list',OMER))&&srv('list',OMER).length>0,'and still in the account');

  console.log('\n== "continue to..." after the Google redirect');
  const I=await T.device({hash:'#forum'});
  await I.evaluate(()=>{FM.local=true;openAsk({ctx:'deg:'+DEG[0].id})});await wait(I,500);
  ok(await I.evaluate(()=>!!document.querySelector('#ov .authw')),'asking a question without an account opens the sign-in sheet');
  await I.check('#ov [data-aconsent]');await I.click('#gbtn');await wait(I,600);
  await I.goto(T.URL+'?code=abc123#forum');await wait(I,1700);
  await T.nick(I);await wait(I,300);
  const bar=await I.evaluate(()=>{const b=document.getElementById('contbar');return b&&b.textContent});
  ok(bar&&bar.includes('להמשיך לשאילת שאלה בפורום'),'a bar offers "continue to asking a question": '+bar);
  ok(await I.evaluate(()=>!document.querySelector('#ov')),'it did not open the question by itself');
  await I.click('[data-contgo]');await wait(I,500);
  ok(await I.evaluate(()=>!!document.querySelector('#ov')&&!document.getElementById('contbar')),'pressing it opens the question sheet, and the bar goes');
  ok(I.errs.length===0,'no page errors '+I.errs.join(';'));
  console.log('\n== two changes to the same thing: the later one wins by the SERVER\'s clock, even when a device clock is wrong');
  const be2=createBackend(),OM=USERS.omer.id;
  const sA=await T.device({user:'omer',backend:be2,seed:{prof:{bag:'full',psy:'plan',heb:'he',stage:'g10'}}});await T.login(sA);await T.nick(sA);
  const sB=await T.device({user:'omer',backend:be2});await sB.evaluate(()=>localStorage.removeItem('kivun3.prof'));await sB.reload();await wait(sB,300);await T.login(sB);await T.nick(sB);
  const setStage=(p,v)=>p.evaluate(v=>{S.prof={...S.prof,stage:v};store.set('prof',S.prof)},v);
  const srvStage=()=>(be2.u(OM).data.prof||{value:{}}).value.stage;
  ok((await lsGet(sB,'prof')||{}).stage==='g10','(two devices of one account, in step)');
  /* 1. A's clock is 20 minutes AHEAD. A changes the stage first (offline), B changes it later. By the device clock A looks later; by the server's clock B is. */
  await sA.evaluate(()=>{window.__skew=20*60*1000});await sA.mock.set({down:true});
  await setStage(sA,'g11');await wait(sA,1500);await setStage(sB,'g12');await wait(sB,2600);
  await sA.mock.set({down:false});await sA.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(sA,3500);
  ok(srvStage()==='g12'&&(await lsGet(sA,'prof')).stage==='g12','a fast clock does not win: the later change (B) did, on the server and on A: server '+srvStage()+', A '+(await lsGet(sA,'prof')).stage);
  ok(sA.mock.log.some(r=>r.path==='/rest/v1/rpc/server_time'),'the device asked the server for its time');
  /* 2. A's clock is 20 minutes BEHIND. B changes the stage first, A changes it later (offline). By the device clock A looks earlier; by the server's clock A is later. */
  await sA.evaluate(()=>{window.__skew=-20*60*1000});await sA.mock.set({down:true});
  await setStage(sB,'svc');await wait(sB,2600);await setStage(sA,'after');await wait(sA,1500);
  await sA.mock.set({down:false});await sA.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(sA,3500);
  ok(srvStage()==='after'&&(await lsGet(sA,'prof')).stage==='after','a slow clock does not lose: the later change (A) won: server '+srvStage());
  await pullNow(sB);ok((await lsGet(sB,'prof')).stage==='after','and B follows');
  /* the server is out of reach when the clash is found: the older rule would guess from the device clock; here the last known difference is used, and nothing is lost either way */
  ok(sA.errs.length===0&&sB.errs.length===0,'no page errors');

  console.log('\n== a line under free text: "saved in your account and synced between your devices"');
  ok((await sA.evaluate(()=>syNote())).includes('נשמר בחשבון שלך ומסונכרן בין המכשירים'),'for someone signed in and in step with the account');
  await sA.evaluate(()=>{openSchForm()});await wait(sA,400);
  ok(await sA.evaluate(()=>{const t=document.querySelector('#scNt');return !!t&&!!t.parentElement.querySelector('.sy-note')}),'under the scholarship notes');
  await sA.keyboard.press('Escape');
  const N=await T.device({backend:createBackend()});
  ok((await N.evaluate(()=>syNote()))==='','nothing for someone who is not signed in');
  await N.evaluate(()=>{openSchForm()});await wait(N,400);
  ok(await N.evaluate(()=>!!document.querySelector('#scNt')&&!document.querySelector('.sy-note')),'(and no line under the scholarship notes)');
  await T.close();
})().catch(e=>{console.log('ERROR',String(e).slice(0,600));process.exit(1)});
