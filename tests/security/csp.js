#!/usr/bin/env node
/* The Content-Security-Policy and the frame guard.
   1. the policy's hash is the hash of the page script, and the checker (tools/csp-hash.js) fails on a changed script, a second inline script, or a weakened policy;
   2. in a real browser the site runs under the policy with no violation (pages, the questionnaire, sign-in against the fake server, the account sheet),
      and the policy really blocks: an injected inline script, an inline event handler, a request to another site, eval;
   3. another site cannot show this site in a frame (the page stops and shows a link), a direct visit is untouched, and the allow-list accepts only claude.ai.
   Run: node tests/security/csp.js        */
const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),http=require('http');
const {analyse,write}=require('../../tools/csp-hash.js');const {installMock,serve}=require('../accounts/mock.js');
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+m);return c};
(async()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
  console.log('\n== the hash and the checker');
  const a=analyse(html);
  ok(a.problems.length===0,'the policy hash matches the page script'+(a.problems.length?': '+a.problems.join('; '):''));
  ok(analyse(html.replace('const FRAME_OK','const FRAME_OK /* an edit */')).problems.some(p=>/hash in the policy/.test(p)),'a changed script is reported');
  ok(analyse(html.replace('<head>','<head><script>alert(1)</script>')).problems.some(p=>/exactly one inline/.test(p)),'a second inline script is reported');
  ok(analyse(html.replace("object-src 'none'","object-src *")).problems.some(p=>/object-src/.test(p)),'a weakened policy is reported');
  ok(analyse(html.replace("script-src 'self'","script-src 'unsafe-eval' 'self'")).problems.some(p=>/unsafe-eval/.test(p)),"'unsafe-eval' is reported");
  ok(analyse(write(html.replace('const FRAME_OK','const FRAME_OK /* an edit */'),analyse(html.replace('const FRAME_OK','const FRAME_OK /* an edit */')))).problems.length===0,'--write repairs it');

  const web=await serve(),b=await chromium.launch();
  console.log('\n== the site under the policy');
  const ctx=await b.newContext({viewport:{width:1100,height:900}}),mock=await installMock(ctx,{}),p=await ctx.newPage();p.setDefaultTimeout(8000);
  const viol=[];await ctx.addInitScript(()=>{window.__v=[];document.addEventListener('securitypolicyviolation',e=>window.__v.push(e.violatedDirective+' '+(e.blockedURI||'')+' '+(e.sample||'').slice(0,40)))});
  const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,100)));p.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))viol.push(m.text().slice(0,140))});
  await p.goto(web.url);await p.evaluate(()=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1')});
  for(const h of ['','degrees','jobs','forum','me','path','sch','calc','dir','terms','list','deg-d0','occ-1114','tech'])await p.evaluate(h=>{location.hash='#'+h},h),await p.waitForTimeout(250);
  await p.goto(web.url+'#dir');await p.reload();await p.waitForTimeout(500);
  ok(await p.evaluate(()=>typeof VQE==='object'),'the page script runs (the hash is accepted)');
  await p.click('[data-vqstart]');await p.waitForTimeout(300);await p.click('[data-vqo="A1_4"]');await p.click('[data-vqo="A1_5"]');await p.click('[data-vqnext]');await p.waitForTimeout(400);
  await p.click('#acctBtn');await p.check('#ov [data-aconsent]');await p.click('#gbtn');await p.waitForTimeout(600);
  await p.goto(web.url+'?code=abc#dir');await p.waitForTimeout(2200);
  ok(await p.evaluate(()=>!!window.supabase&&!!SUPA.user),'the library loads from the same origin and sign-in works (connect-src allows only the Supabase address)');
  await p.evaluate(()=>{const n=document.querySelector('#nickf');if(n)n.querySelector('button[type=submit]').click()});await p.waitForTimeout(300);
  await p.click('#acctBtn');await p.waitForSelector('#ov [data-signout]');await p.keyboard.press('Escape');await p.waitForTimeout(2500);
  ok(mock.log.some(r=>/save_quiz/.test(r.path)),'the quiz was saved to the account');
  const v=await p.evaluate(()=>window.__v);
  ok(v.length===0&&viol.length===0,'no policy violation anywhere: '+JSON.stringify(v.concat(viol)).slice(0,300));
  ok(errs.length===0,'no page errors '+errs.join(';'));
  console.log('   -- what the policy blocks');
  const blocked=await p.evaluate(async()=>{
    const r={};
    window.__ran=0;
    const s=document.createElement('script');s.textContent='window.__ran=1';document.body.appendChild(s);r.inlineScript=window.__ran===0;
    const i=document.createElement('img');i.src='x:';i.setAttribute('onerror','window.__ran=2');document.body.appendChild(i);await new Promise(x=>setTimeout(x,300));r.inlineHandler=window.__ran===0;
    try{await fetch('https://example.com/');r.otherSite=false}catch(e){r.otherSite=true}
    try{new Function('return 1')();r.eval=false}catch(e){r.eval=e.name==='EvalError'}
    const f=document.createElement('iframe');f.src='https://example.com/';document.body.appendChild(f);await new Promise(x=>setTimeout(x,400));r.frame=true;
    return r});
  ok(blocked.inlineScript,'an injected inline <script> does not run');
  ok(blocked.inlineHandler,'an injected inline event handler (onerror=) does not run');
  ok(blocked.otherSite,'a request to another site is refused');
  ok(blocked.eval,'eval / new Function is refused');
  ok((await p.evaluate(()=>window.__v.filter(x=>/frame-src|default-src/.test(x)).length))>=1,'a frame to another site is refused');
  await ctx.close();

  console.log('\n== the frame guard');
  const host=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(`<html><body><iframe id="f" src="${web.url}" width="800" height="600"></iframe></body></html>`)});
  await new Promise(r=>host.listen(0,'127.0.0.1',r));const hostUrl='http://127.0.0.1:'+host.address().port+'/';
  const c2=await b.newContext(),hp=await c2.newPage();await hp.goto(hostUrl);await hp.waitForTimeout(1500);
  const fr=hp.frames().find(f=>f!==hp.mainFrame());
  const inner=fr?await fr.evaluate(()=>({text:document.body.textContent.trim().slice(0,80),vqe:(()=>{try{return typeof VQE}catch(e){return 'undefined'}})(),link:!!document.querySelector('a[target=_blank][rel=noopener]'),app:!!document.getElementById('app')})):null;
  ok(inner&&inner.vqe==='undefined'&&!inner.app,'another site cannot show the page in a frame: the script stops ('+JSON.stringify(inner)+')');
  ok(inner&&inner.link&&/אבטחה/.test(inner.text),'the frame shows a message and a link that opens the site in its own tab');
  const d=await c2.newPage();await d.goto(web.url);await d.waitForTimeout(600);
  ok(await d.evaluate(()=>typeof VQE==='object'&&!!document.getElementById('app')),'a direct visit is untouched');
  ok(await d.evaluate(()=>frameAllowed(['https://claude.ai'])&&frameAllowed(['https://x.claudeusercontent.com'])&&frameAllowed(['https://a.b.claude.ai'])),'claude.ai and its content domain are allowed as parents');
  ok(await d.evaluate(()=>!frameAllowed(['https://evil.example'])&&!frameAllowed(['https://claude.ai.evil.com'])&&!frameAllowed(['http://claude.ai'])&&!frameAllowed(['https://claude.ai','https://evil.example'])&&!frameAllowed([])),'anyone else is not (also not lookalikes, http, a chain with a stranger in it, or an unknown parent)');
  await b.close();await web.close();host.close();
  console.log(fails?`\n${fails} FAILED`:'\nall checks passed');process.exit(fails?1:0);
})().catch(e=>{console.log('ERROR',String(e).slice(0,600));process.exit(1)});
