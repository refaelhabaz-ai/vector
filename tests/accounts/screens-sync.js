#!/usr/bin/env node
/* Screenshots of the stage 2 screens (docs/accounts/screens/, 360 wide) against the fake server. Run: node tests/accounts/screens-sync.js */
const path=require('path'),fs=require('fs');const {start,USERS}=require('./lib.js');
const OUT=path.join(__dirname,'..','..','docs','accounts','screens');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const T=await start(),w=p=>p.waitForTimeout(500);
  const dev=o=>T.device({...o,ctx:undefined});
  const mk=async o=>{const ctx=await T.b.newContext({viewport:{width:360,height:740},deviceScaleFactor:2,acceptDownloads:true});return T.device({...o,ctx})};
  const shot=async(p,n,sel)=>{await w(p);await p.locator(sel||'#ov .sheet').screenshot({path:path.join(OUT,n+'.png')});console.log('saved '+n)};
  const A=await mk({sex:'f',seed:{prof:{bag:'full',psy:'plan',heb:'he',stage:'g12',reg:'c',sex:'f'}}});
  const ids=await A.evaluate(()=>DEG.filter(d=>d.of.length>2).slice(0,3).map(d=>d.id));
  await A.evaluate(l=>localStorage.setItem('kivun3.list',JSON.stringify(l)),[ids[0]]);await A.reload();await w(A);
  await T.login(A);await T.nick(A);
  const C=await mk({sex:'f',seed:{prof:{bag:'full',psy:'has',heb:'he',stage:'g11',reg:'n',sex:'f'},list:[ids[1],ids[2]]}});
  await T.login(C);await shot(C,'6-merge');
  await C.click('#syf button[type=submit]');await w(C);await T.nick(C);await w(C);
  await C.click('#acctBtn');await shot(C,'7-account-synced');
  await C.click('#ov [data-acctdelete]');await C.waitForSelector('#delf');await shot(C,'10-delete-account');await C.keyboard.press('Escape');
  const G=await mk({user:'omer',backend:require('./mock.js').createBackend()});
  await G.evaluate(async()=>{const salt='s1',a={uOLD2:{id:'uOLD2',name:'נועם',email:'someone@else.com',salt,hash:await pwHash('hunter22x',salt),created:1,data:{list:[]}},uOLD3:{id:'uOLD3',name:'שיר',phone:'0501234567',salt,hash:await pwHash('x',salt),created:1,data:{}}};localStorage.setItem('kivun3.accounts',JSON.stringify(a))});
  await G.reload();await w(G);await T.login(G);await shot(G,'8-old-accounts');
  await G.keyboard.press('Escape');
  const I=await mk({hash:'#forum'});
  await I.evaluate(()=>{FM.local=true;openAsk({})});await w(I);await I.check('#ov [data-aconsent]');await I.click('#gbtn');await w(I);
  await I.goto(T.URL+'?code=abc#forum');await I.waitForTimeout(1700);await T.nick(I);await w(I);
  await I.screenshot({path:path.join(OUT,'9-continue-bar.png')});console.log('saved 9-continue-bar');
  await T.close()})().catch(e=>{console.log('ERROR',String(e).slice(0,300));process.exit(1)});
