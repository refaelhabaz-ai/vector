#!/usr/bin/env node
/* Screenshots of the account screens (docs/accounts/screens/, 360 wide) against the fake Supabase. Run: node tests/accounts/screens.js */
const {chromium}=require('playwright');const path=require('path'),fs=require('fs');const {installMock,serve}=require('./mock.js');
const OUT=path.join(__dirname,'..','..','docs','accounts','screens');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const web=await serve(),b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:360,height:740},deviceScaleFactor:2}),m=await installMock(ctx),p=await ctx.newPage();p.setDefaultTimeout(8000);
  await p.goto(web.url);await p.evaluate(()=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1');localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',sex:'f'}))});
  await p.goto(web.url+'#dir');await p.reload();await p.waitForTimeout(600);
  const shot=async n=>{await p.waitForTimeout(450);await p.locator('#ov .sheet').screenshot({path:path.join(OUT,n+'.png')});console.log('saved '+n)};
  await p.click('#acctBtn');await p.waitForSelector('#ov .authw');await shot('1-login');
  await p.evaluate(()=>{SUPA_CFG.emailOtp=true;openAuth({})});await shot('2-login-with-email-code-flag-on');
  await p.evaluate(()=>{SUPA_CFG.emailOtp=false;openAuth({})});
  await (async()=>{for(const c of await p.locator('#ov [data-aconsent]').all())await c.check()})();await p.click('#gbtn');await p.waitForTimeout(500);
  await p.goto(web.url+'?code=abc#dir');await p.waitForSelector('#nickf');await shot('3-name');
  await p.click('#nickf button[type=submit]');await p.waitForTimeout(400);
  await p.click('#acctBtn');await p.waitForSelector('#ov [data-signout]');await shot('4-account');
  await p.keyboard.press('Escape');
  await p.evaluate(()=>{openConsent(['terms','privacy','age'])});await shot('5-consent-again');
  await b.close();await web.close()})().catch(e=>{console.log('ERROR',String(e).slice(0,300));process.exit(1)});
