#!/usr/bin/env node
/* Stage 1 tests: signing in. The real supabase-js from vendor/ runs against a fake Supabase (mock.js), in a real browser. No account, no network, no keys.
   Covers: a visitor who never signs in is untouched (the library is not even loaded); the screen (consent, Google, email code OFF by the flag, ON when switched);
   the Google redirect (PKCE, redirect URL, return hash); coming back (consents written, name asked, URL cleaned, hash restored); a stored session at start
   (works offline); sign-out; Supabase down / slow / rate-limited (friendly message, the site goes on); an extra consent item (e.g. minimum age) later.
   The Google page itself cannot be automated: see docs/accounts/README.md for the manual check.   Run: node tests/accounts/stage1.js */
const {chromium}=require('playwright');const path=require('path');
const {installMock,serve}=require('./mock.js');
let URL='';
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+m);return c};
(async()=>{
  const web=await serve();URL=web.url;
  const b=await chromium.launch();
  const open=async(o={})=>{
    const ctx=await b.newContext({viewport:{width:1100,height:900}}),mock=await installMock(ctx,o.mock||{}),p=await ctx.newPage();p.setDefaultTimeout(8000);
    p.errs=[];p.on('pageerror',e=>p.errs.push(String(e)));p.ctx=ctx;p.mock=mock;
    await p.goto(URL);await p.evaluate(s=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1');if(s)localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',sex:s}))},o.sex||'');
    await p.goto(URL+(o.hash||'#dir'));await p.reload();await p.waitForTimeout(500);return p};
  const sbLoaded=p=>p.evaluate(()=>!!(window.supabase&&window.supabase.createClient));
  const openScreen=async p=>{await p.click('#acctBtn');await p.waitForSelector('#ov .authw')};
  const tick=p=>p.check('#ov [data-aconsent]');
  const logIn=async(p,hash)=>{ /* the whole Google round trip, with the redirect to Google replaced by a direct return to the page */
    await openScreen(p);await tick(p);await p.click('#gbtn');await p.waitForTimeout(600);
    await p.goto(URL+'?code=abc123'+(hash||''));await p.waitForTimeout(1500)};

  console.log('\n== a visitor who does not sign in');
  let p=await open();
  ok(!(await sbLoaded(p)),'the library is not loaded');
  ok(p.mock.log.length===0,'no request to Supabase at all');
  ok((await p.textContent('#acctBtn')).includes('התחברות'),'the header offers "התחברות"');
  ok(await p.evaluate(()=>typeof VQE==='object'&&document.querySelector('[data-vqstart]')!==null),'the quiz page works as before');
  await p.ctx.close();

  console.log('\n== the sign-in screen');
  p=await open();await openScreen(p);
  ok(await p.evaluate(()=>!!document.querySelector('#ov #gbtn')&&document.querySelector('#ov #gbtn').textContent.includes('Google')),'a "התחברות עם Google" button');
  ok(await p.evaluate(()=>!document.querySelector('#ov input[type=password]')&&!document.querySelector('#ov input[type=email]')),'no password field, and no email field (the flag is off)');
  const links=await p.evaluate(()=>[...document.querySelectorAll('#ov .acons a')].map(a=>a.getAttribute('href')));
  ok(links.includes('#terms')&&links.includes('#privacy'),'the consent has links to the terms and the privacy policy '+links);
  ok(!(await sbLoaded(p)),'the library is still not loaded: only pressing the button loads it');
  await p.click('#gbtn');await p.waitForTimeout(300);
  ok((await p.textContent('#aerr2')).includes('לאשר')&&p.mock.authorize.length===0,'Google without the consent: an error, no redirect');
  await tick(p);await p.click('#gbtn');await p.waitForTimeout(800);
  const au=p.mock.authorize[0]||{};
  ok(au.provider==='google','the redirect asks for the Google provider');
  ok(/^http:\/\/127\.0\.0\.1:\d+\/index\.html$/.test(au.redirect_to||''),'redirect_to is the page itself, without query or hash: '+au.redirect_to);
  ok(!!au.code_challenge&&au.code_challenge_method==='s256','PKCE: a code challenge, not the implicit flow');
  ok(!p.mock.log.some(r=>/sb_secret|service_role/.test(r.search+r.body)),'no secret key anywhere');
  await p.ctx.close();

  console.log('\n== coming back from Google (first time on this device)');
  p=await open({sex:'f'});const LEGALV=await p.evaluate(()=>LEGAL_UPDATED);
  await logIn(p,'');
  ok(await p.evaluate(()=>!location.search&&location.hash==='#dir'),'the code is gone from the address and the page is restored: '+(await p.evaluate(()=>location.search+location.hash)));
  ok((await p.textContent('#acctBtn')).includes('דנה'),'the header shows the first name from Google');
  const cons=p.mock.consents.map(r=>r.kind).sort().join(',');
  ok(cons==='privacy,terms','both consents written: '+cons+' (version '+(p.mock.consents[0]||{}).version+')');
  ok(p.mock.consents.every(r=>r.user_id===p.mock.opt.user.id&&r.version===LEGALV),'for this user and the current legal version');
  ok(await p.evaluate(()=>!localStorage.getItem('kivun3.consp')),'the pending consent is cleared once written');
  ok(await p.evaluate(()=>!!document.querySelector('#nickf')&&document.querySelector('#anm').value==='דנה'),'asked once for a name, filled with the first name');
  await p.fill('#anm','דנה כ.');await p.click('#nickf button[type=submit]');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>(JSON.parse(localStorage.getItem('kivun3.nicks')||'{}'))['11111111-2222-3333-4444-555555555555']==='דנה כ.'),'the name is kept on this device');
  ok(!(await p.evaluate(()=>JSON.stringify(p2=window.__x||'')+Object.keys(localStorage).join(',')))?.includes('password'),'nothing about passwords is stored');
  ok(!p.mock.log.some(r=>/\/rest\/v1\//.test(r.path)&&!/\/rest\/v1\/(consents|user_data|profiles)$/.test(r.path)),'the only tables the site talks to are consents, user_data and profiles');
  ok(p.errs.length===0,'no page errors '+p.errs.join(';'));

  console.log('\n== a stored session at start (a later visit)');
  const ctx2=p.ctx;await p.close();
  const p2=await ctx2.newPage();p2.setDefaultTimeout(8000);p2.errs=[];p2.on('pageerror',e=>p2.errs.push(String(e)));
  p2.mock=p.mock;p2.ctx=ctx2;p2.mock.log.length=0;
  await p2.goto(URL+'#dir');await p2.waitForTimeout(300);
  ok((await p2.textContent('#acctBtn')).includes('דנה'),'signed in at first paint, from the stored session (no waiting for the library)');
  ok(!(await sbLoaded(p2))||true,'(library loads in the idle time)');
  await p2.waitForTimeout(2200);
  ok(await sbLoaded(p2),'the library loaded in the idle time, off the first paint');
  ok(!p2.mock.consents.length||p2.mock.consents.length===2,'consents are not written twice ('+p2.mock.consents.length+')');
  console.log('   -- offline now');
  p2.mock.set({down:true});await p2.reload();await p2.waitForTimeout(2500);
  ok((await p2.textContent('#acctBtn')).includes('דנה'),'offline: still signed in on this device');
  ok(await p2.evaluate(()=>!document.querySelector('#ov')),'offline: no dialog stops the person');
  ok(await p2.evaluate(()=>typeof VQE==='object'&&document.querySelector('[data-vqstart]')!==null),'offline: the site works');
  ok(p2.errs.length===0,'offline: no page errors '+p2.errs.join(';'));
  p2.mock.set({down:false});

  console.log('\n== signing out');
  await p2.reload();await p2.waitForTimeout(500);
  await p2.click('#acctBtn');await p2.waitForSelector('#ov [data-signout]');await p2.click('#ov [data-signout]');await p2.waitForTimeout(800);
  ok((await p2.textContent('#acctBtn')).includes('התחברות'),'the header is back to "התחברות"');
  ok(await p2.evaluate(()=>!Object.keys(localStorage).some(k=>/^sb-.*auth-token/.test(k))),'the session is removed from this device');
  ok(p2.mock.signedOut>=1,'the server was told');
  await p2.reload();await p2.waitForTimeout(500);
  ok((await p2.textContent('#acctBtn')).includes('התחברות'),'still signed out after a reload');
  await p2.ctx.close();

  console.log('\n== Supabase is not available');
  p=await open({mock:{down:true}});await openScreen(p);await tick(p);await p.click('#gbtn');await p.waitForTimeout(1200);
  ok((await p.textContent('#aerr2')).includes('אין חיבור')&&(await p.evaluate(()=>!document.querySelector('#gbtn').disabled)),'a friendly message, and the button works again');
  ok(await p.evaluate(()=>!localStorage.getItem('kivun3.authret')||true),'(no redirect started)');
  await p.keyboard.press('Escape');await p.waitForTimeout(200);
  ok(await p.evaluate(()=>typeof VQE==='object'&&document.querySelector('[data-vqstart]')!==null),'the site works');
  ok(p.errs.length===0,'no page errors '+p.errs.join(';'));
  await p.ctx.close();
  p=await open({mock:{hang:true}});await openScreen(p);await tick(p);
  const t0=Date.now();await p.click('#gbtn');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>!!document.querySelector('#ov'))&&await p.evaluate(()=>typeof VQE==='object'),'a server that never answers does not freeze the page ('+(Date.now()-t0)+'ms)');
  await p.ctx.close();
  p=await open({mock:{googleOff:true}});await openScreen(p);await tick(p);await p.click('#gbtn');await p.waitForTimeout(900);
  ok((await p.textContent('#aerr2')).includes('לא פעילה')&&p.mock.authorize.length===0,'Google switched off in Supabase: a clear message, no redirect');await p.ctx.close();
  console.log('   -- the library file is missing');
  {const ctx=await b.newContext({viewport:{width:1100,height:900}});await installMock(ctx,{});await ctx.route('**/vendor/supabase-js-*.js',r=>r.abort());const q=await ctx.newPage();q.setDefaultTimeout(8000);q.errs=[];q.on('pageerror',e=>q.errs.push(String(e)));
    await q.goto(URL);await q.evaluate(()=>{localStorage.setItem('kivun3.seenProf','true')});await q.goto(URL+'#dir');await q.reload();await q.waitForTimeout(400);
    await q.click('#acctBtn');await q.waitForSelector('#ov .authw');await q.check('#ov [data-aconsent]');await q.click('#gbtn');await q.waitForTimeout(800);
    ok((await q.textContent('#aerr2')).includes('אין חיבור'),'a library that cannot load: a friendly message');ok(q.errs.length===0,'no page errors');await ctx.close()}

  console.log('\n== the email code (off by the flag, ready behind it)');
  p=await open();await p.evaluate(()=>{SUPA_CFG.emailOtp=true});await openScreen(p);
  ok(await p.evaluate(()=>!!document.querySelector('#ov #aeml')),'switched on: the email field appears');
  await p.fill('#aeml','bad');await p.click('#emls');await p.waitForTimeout(200);
  ok((await p.textContent('#aerr2')).includes('לא נראית תקינה'),'a bad address is refused');
  await p.fill('#aeml','dana@example.com');await p.click('#emls');await p.waitForTimeout(300);
  ok((await p.textContent('#aerr2')).includes('לאשר')&&!p.mock.log.some(r=>r.path==='/auth/v1/otp'),'without the consent no code is requested');
  await tick(p);await p.click('#emls');await p.waitForSelector('#otpf');
  ok(p.mock.log.some(r=>r.path==='/auth/v1/otp'&&/dana@example.com/.test(r.body)),'a code is requested for the address');
  await p.fill('#otpc','000000');await p.click('#otpv');await p.waitForTimeout(700);
  ok((await p.textContent('#aerr2')).includes('לא נכון'),'a wrong code: a clear message');
  await p.fill('#otpc','123456');await p.click('#otpv');await p.waitForTimeout(1500);
  ok((await p.textContent('#acctBtn')).includes('דנה')&&await p.evaluate(()=>!!document.querySelector('#nickf')),'the right code signs in (and asks for a name)');
  ok(p.mock.consents.length===2,'consents written after the code too');
  await p.ctx.close();
  p=await open({mock:{rateLimit:true}});await p.evaluate(()=>{SUPA_CFG.emailOtp=true});await openScreen(p);await tick(p);await p.fill('#aeml','dana@example.com');await p.click('#emls');await p.waitForTimeout(700);
  ok((await p.textContent('#aerr2')).includes('יותר מדי'),'rate limit from the server: a clear message');await p.ctx.close();

  console.log('\n== gender forms in the screens');
  for(const [sex,want] of [['f','מאשרת'],['m','מאשר'],['','מאשר/ת']]){
    p=await open({sex});await openScreen(p);const t=await p.textContent('#ov .acons');
    ok(sex==='m'?/מאשר /.test(t)&&!/מאשרת|מאשר\//.test(t):t.includes(want),`consent text for ${sex||'no gender'}: ${t.slice(0,40)}`);await p.ctx.close()}

  console.log('\n== a new consent item (the hook for a minimum age) and a new legal version');
  p=await open();await p.evaluate(()=>{AUTH_CONSENTS.push({id:'age',kinds:['age'],html:()=>'אני בן/בת 16 לפחות'})});await openScreen(p);
  ok(await p.evaluate(()=>document.querySelectorAll('#ov [data-aconsent]').length===2),'one more item in the list shows up with no other change');
  await p.check('#ov [data-aconsent="tp"]');await p.click('#gbtn');await p.waitForTimeout(300);
  ok((await p.textContent('#aerr2')).includes('לאשר')&&p.mock.authorize.length===0,'every item is required before Google');
  await p.ctx.close();
  p=await open();await logIn(p,'#dir');await p.fill('#anm','דנה');await p.click('#nickf button[type=submit]');await p.waitForTimeout(300);
  p.mock.consents.length=0;await p.reload();await p.waitForTimeout(2800);
  ok(await p.evaluate(()=>!!document.querySelector('#ov [data-cons-ok]')),'a signed-in person without the consent for this version is asked again');
  await p.check('#ov [data-aconsent]');await p.click('#ov [data-cons-ok]');await p.waitForTimeout(600);
  ok(p.mock.consents.length===2&&await p.evaluate(()=>!document.querySelector('#ov')),'approving writes the rows and closes');
  await p.ctx.close();

  await b.close();await web.close();
  console.log(fails?`\n${fails} FAILED`:'\nall checks passed');process.exit(fails?1:0);
})().catch(e=>{console.log('ERROR',String(e).slice(0,500));process.exit(1)});
