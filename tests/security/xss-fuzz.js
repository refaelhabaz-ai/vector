#!/usr/bin/env node
/* Dynamic XSS check: every place where a person's own text can be stored (profile, path notes and story, scholarship tracker, forum, display names, old local accounts,
   the name Google sends, interests, and the address bar) is filled with a payload that runs code if it is ever put into the page unescaped, then every page and sheet
   that can be reached is opened. A payload that runs, an attribute that was broken out of, or a javascript: link is reported with the place it came from.
   It is a review aid with the coverage of what it opens (it cannot prove there is no hole elsewhere).   Run: node tests/security/xss-fuzz.js [--verbose]   */
const {chromium}=require('playwright');const path=require('path');
const {installMock,createBackend,serve}=require('../accounts/mock.js');
const VERBOSE=process.argv.includes('--verbose');
/* the payload: breaks out of a text node, of "..." and '...' attributes, and of a JS string; each place gets its own label */
const P=l=>`'"><img/src=x/onerror=(window.__X=window.__X||[]).push('${l}')><b/data-xssmark=${l}>`;
/* (the payload is kept short: some fields are cut at 100-200 characters) */
const URLP=l=>`javascript:(window.__X=window.__X||[]).push('${l}')`;
(async()=>{
  const web=await serve(),b=await chromium.launch();
  const findings=new Map(),seen=new Set();const add=(where,what,detail)=>{const k=where+'|'+what;if(!findings.has(k))findings.set(k,{where,what,detail})};
  const scan=()=>({x:window.__X||[],
    on:[...document.querySelectorAll('*')].filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name))).map(e=>e.tagName+'['+[...e.attributes].filter(a=>/^on/i.test(a.name)).map(a=>a.name+'='+a.value.slice(0,60)).join(',')+']'),
    bad:[...document.querySelectorAll('[data-xssmark]')].map(e=>e.dataset.xssmark+' <- '+(e.parentElement?e.parentElement.outerHTML.replace(/\s+/g,' ').slice(0,170):'')),
    attrs:[...new Set([...document.querySelectorAll('*')].flatMap(e=>[...e.attributes].map(a=>(a.value.match(/push\('([\w.-]+)'\)/)||[])[1]).filter(Boolean)))],
    seen:[...new Set(((document.body.textContent||'').match(/push\('([\w.-]+)'\)/g)||[]).map(m=>m.slice(6,-2)))],
    js:[...document.querySelectorAll('a[href],iframe[src],form[action],button[formaction]')].filter(e=>/^\s*javascript:/i.test(e.getAttribute('href')||e.getAttribute('src')||e.getAttribute('action')||e.getAttribute('formaction')||'')).map(e=>(e.getAttribute('href')||'').slice(0,60))});
  const ctx=await b.newContext({viewport:{width:1100,height:900}}),mock=await installMock(ctx,{user:{id:'11111111-2222-3333-4444-555555555555',email:'dana@example.com',full_name:P('google-name')}}),p=await ctx.newPage();p.setDefaultTimeout(6000);
  const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,100)));p.on('dialog',d=>d.dismiss());
  await p.goto(web.url);
  /* baseline: attributes on* that the site itself uses */
  await p.evaluate(()=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1')});await p.reload();await p.waitForTimeout(500);
  const base=new Set((await p.evaluate(scan)).on);
  /* ---- fill every place a person's text lives ---- */
  const ids=await p.evaluate(()=>{const d=DEG.find(d=>d.of.length>2);return {deg:d.id,inst:d.of[0].i,occ:OCLIST[0].id,mh:0}});
  await p.evaluate(([ids,Ps])=>{
    const L=(k,v)=>localStorage.setItem('kivun3.'+k,JSON.stringify(v));const P=l=>Ps.P.replace(/LBL/g,l),U=l=>Ps.U.replace(/LBL/g,l);
    const prof={};['bag','y12','age','psy','heb','stage','reg','nat','svc','res','inc','first','house','work','hrs','math','years','track','sex'].forEach(k=>prof[k]=P('prof.'+k));prof.bag='full';prof.psy='plan';prof.heb='he';prof.stage='g12';prof.reg='c';
    L('prof',prof);L('scores',{p:700,b:105});L('list',[ids.deg]);L('uni',ids.inst);
    L('path',{v:4,created:1,story:P('path.story'),active:'t1',targets:[{id:'t1',d:ids.deg,i:ids.inst,added:1}],
      dates:[{id:'d1',t:P('path.date.t'),d:'2026-12-01',kind:'event',note:P('path.date.note'),f:P('path.date.f'),bk:P('path.date.bk'),from:P('path.date.from'),tm:'10:00',len:30},
             {id:'d2',t:P('path.date2.t'),d:'2026-12-02',kind:'task',note:P('path.date2.note')}],pick:[P('path.pick')]});
    L('sch',{v:1,items:[{id:'s1',n:P('sch.n'),u:U('sch.u'),d:'2026-12-01',st:'interested',note:P('sch.note'),rid:P('sch.rid'),ts:1},{id:P('sch.id'),n:'x',u:'https://example.com/?a="'+P('sch.u2'),d:'',st:P('sch.st'),note:'',rid:'',ts:2}],notif:0,seen:0,skip:{},nday:P('sch.nday')});
    L('interests',[P('interests')]);L('techArea',P('techArea'));L('mode',P('mode'));L('nicks',{'11111111-2222-3333-4444-555555555555':P('nick'),u1:P('nick.other')});
    L('accounts',{u1:{id:'u1',name:P('old.name'),email:P('old.email')+'@x.com',phone:P('old.phone'),salt:'s',hash:'h',created:1,data:{prof:{stage:P('old.data')}}}});
    L('forum',{u1:{role:{k:'user',inst:P('forum.role.inst')},q:{q1:{t:P('forum.q.t'),b:P('forum.q.b'),anon:false,ts:1700000000000,topic:P('forum.q.topic'),ctx:P('forum.q.ctx'),inst:P('forum.q.inst'),fb:{},fbTs:{}}},
       a:{a1:{q:'u1--q1',b:P('forum.a.b'),anon:false,ts:1700000001000}}},
      [P('forum.uid')]:{role:{k:'user'},q:{[P('forum.qid')]:{t:'t',b:'b',anon:false,ts:1,topic:'other',ctx:'',inst:'',fb:{},fbTs:{}}},a:{}}});
    L('forumPriv',{u1:{seen:0,follow:{[P('forum.follow')]:1}}});L('a11y',{x:P('a11y')});L('motion',P('motion'));L('pathHelp',P('pathHelp'));L('calcRows',[{n:P('calc.n'),g:P('calc.g'),u:5,s:90}]);
    L('dir2',{v:2,answers:[{q:P('dir2.q'),picks:[P('dir2.pick')]}],ctx:{},more:0,ts:1});L('dir',{a:{[P('dir.k')]:1},i:0});L('session',{id:'u1',ts:1});
  },[ids,{P:P('LBL'),U:URLP('LBL')}]);   /* the payload texts go in with a LBL placeholder; the page puts the place's name in */
  const visit=async(label,fn)=>{try{await Promise.race([fn(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),12000))]);await p.waitForTimeout(350)}catch(e){add(label,'could not be opened',String(e).slice(0,90));return}
    const r=await p.evaluate(scan);
    if(r.x.length)add(label,'PAYLOAD RAN',[...new Set(r.x)].join(', '));
    r.on.filter(o=>!base.has(o)).forEach(o=>add(label,'inline event handler',o));
    [...new Set(r.bad)].forEach(l=>add(label,'markup injected (a tag from the payload exists)',l));
    (r.seen||[]).forEach(l=>seen.add(l));
    (r.attrs||[]).forEach(l=>seen.add(l));
    r.js.forEach(h=>add(label,'javascript: link',h));
    if(VERBOSE)console.log('  visited',label)};
  await p.reload();await p.waitForTimeout(800);
  const routes=['','degrees','jobs','forum','me','path','sch','calc','dir','terms','tech','list','specs','a11y','contact','privacy','src',`deg-${ids.deg}`,`occ-${ids.occ}`,'mh-0','mh-3','sp-'+encodeURIComponent(P('route.sp')),'q-'+encodeURIComponent(P('route.q')),'q-u1--q1','q-'+encodeURIComponent('u1--q1'),encodeURIComponent(P('route.raw')),'deg-'+encodeURIComponent(P('route.deg')),'occ-'+encodeURIComponent(P('route.occ')),'mh-'+encodeURIComponent(P('route.mh'))];
  for(const r of routes)await visit('route #'+r.slice(0,40),async()=>{await p.evaluate(h=>{location.hash='#'+h},r)});
  /* query string reflected? */
  for(const q of ['?code='+encodeURIComponent(P('q.code')),'?error='+encodeURIComponent(P('q.error')),'?q='+encodeURIComponent(P('q.q'))])await visit('query '+q.slice(0,16),async()=>{await p.goto(web.url+q+'#dir');});
  /* sheets and special views (each with payload arguments where they take any) */
  await p.goto(web.url+'#');await p.waitForTimeout(600);
  const call=(label,src)=>visit(label,async()=>{await p.evaluate(`(()=>{try{${src}}catch(e){}})();0`);});   /* no promise comes back: some sheets wait for an answer */
  const PL=l=>P(l);
  const calls={
    'openAsk(payload pre)':`openAsk({ctx:${JSON.stringify(P('ask.ctx'))},inst:${JSON.stringify(P('ask.inst'))},topic:${JSON.stringify(P('ask.topic'))}})`,
    'openAcct':`openAcct()`,'openAuth(reason)':`openAuth({reason:${JSON.stringify(P('auth.reason'))}})`,'openConsent':`openConsent(['terms'],null)`,'openNick':`openNick(true)`,
    'openProfile':`openProfile({})`,'openMe':`openMe&&openMe()`,'openCmp':`S.cmp=[DEG[0].id,DEG[1].id];openCmp()`,'openUni':`openUni()`,'openBell':`openBell()`,'openMore':`openMore()`,
    'openFact(payload)':`openFact(${JSON.stringify(P('fact'))})`,
    'openReport(payload)':`openReport({what:${JSON.stringify(P('report.what'))},val:${JSON.stringify(P('report.val'))},src:${JSON.stringify(P('report.src'))},st:${JSON.stringify(P('report.st'))}})`,
    'openSch(items)':`(schS().items||[]).forEach(i=>{try{openSch(i.id)}catch(e){}});SCH.slice(0,3).forEach(r=>{try{openSch(r.id)}catch(e){}})`,
    'openSchForm(item)':`schS().items.forEach(i=>{try{openSchForm(i.id)}catch(e){}});openSchForm()`,
    'cuOpenSheet(payload)':`cuOpenSheet({id:'x',t:${JSON.stringify(P('cu.t'))},d:'2026-12-03',kind:'event',note:${JSON.stringify(P('cu.note'))}})`,
    'openTargetPick':`openTargetPick&&openTargetPick('t1','add')`,
    'toast(payload)':`toast(${JSON.stringify(P('toast'))})`,'say(payload)':`say(${JSON.stringify(P('say'))})`,
    'pageHead(payload)':`document.getElementById('app').innerHTML=pageHead(${JSON.stringify(P('pagehead.t'))},${JSON.stringify(P('pagehead.s'))})`,
  };
  for(const [k,s] of Object.entries(calls))await call('call '+k,s);
  await p.keyboard.press('Escape');
  /* the path page with the saved goal, its tabs, the scholarships page open items, the forum thread, the signed-in state (Google name) */
  for(const h of ['path','sch','forum','q-u1--q1'])await visit('route again #'+h,async()=>{await p.evaluate(h=>{location.hash='#'+h},h)});
  for(const tab of ['now','prog','cal','opt','more','now'])await visit('path tab '+tab,async()=>{await p.evaluate(()=>{location.hash='#path'});await p.waitForTimeout(300);await p.evaluate(t=>{const e=document.querySelector(`[data-ktab="${t}"]`);if(e)e.click()},tab);await p.waitForTimeout(300)});
  await visit('path: every stop on the road',async()=>{await p.evaluate(()=>{location.hash='#path'});await p.waitForTimeout(400);
    const n=await p.evaluate(()=>document.querySelectorAll('[data-kstop],[data-kgate],[data-ktf],[data-kfsib],[data-kgoto],[data-khub],[data-kme]').length);
    for(let i=0;i<Math.min(n,45);i++){await p.evaluate(i=>{const e=[...document.querySelectorAll('[data-kstop],[data-kgate],[data-ktf],[data-kfsib],[data-kgoto],[data-khub],[data-kme]')][i];if(e)e.click()},i);await p.waitForTimeout(150);
      const r=await p.evaluate(scan);if(r.x.length)add('click #'+i+' on the road','PAYLOAD RAN',[...new Set(r.x)].join(', '));[...new Set(r.bad)].forEach(l=>add('click #'+i+' on the road','markup injected',l));(r.seen||[]).forEach(l=>seen.add(l));(r.attrs||[]).forEach(l=>seen.add(l))}});
  await visit('scholarships: every button',async()=>{await p.evaluate(()=>{location.hash='#sch'});await p.waitForTimeout(500);
    const n=await p.evaluate(()=>document.querySelectorAll('[data-sch]').length);
    for(let i=0;i<Math.min(n,60);i++){await p.evaluate(i=>{const e=[...document.querySelectorAll('[data-sch]')][i];if(e&&!/(sub|del|tdel|reset|seen|notif)/.test(e.getAttribute('data-sch')))e.click()},i);await p.waitForTimeout(120);
      const r=await p.evaluate(scan);if(r.x.length)add('click #'+i+' on scholarships','PAYLOAD RAN',[...new Set(r.x)].join(', '));[...new Set(r.bad)].forEach(l=>add('click #'+i+' on scholarships','markup injected',l));(r.seen||[]).forEach(l=>seen.add(l));(r.attrs||[]).forEach(l=>seen.add(l))}});
  /* a signed-in session whose Google name is the payload */
  await p.evaluate(()=>{localStorage.removeItem('kivun3.accounts');localStorage.removeItem('kivun3.nicks')});await p.goto(web.url+'#');await p.waitForTimeout(400);
  await visit('signed in (Google name = payload)',async()=>{await p.click('#acctBtn');await p.waitForSelector('#ov .authw');await p.check('#ov [data-aconsent]');await p.click('#gbtn');await p.waitForTimeout(500);await p.goto(web.url+'?code=abc#forum');await p.waitForTimeout(2500)});
  console.log('  signed-in state:',await p.evaluate(()=>JSON.stringify({btn:document.querySelector('#acctBtn').textContent.slice(0,40),cur:ACC.cur()&&ACC.cur().name.slice(0,30),ov:!!document.querySelector('#ov'),ovh:document.querySelector('#ov h2')&&document.querySelector('#ov h2').textContent})));
  await visit('account sheet (signed in)',async()=>{await p.evaluate(()=>{const t=document.querySelector('#nickf');if(t)document.querySelector('#nickf button[type=submit]').click()});await p.waitForTimeout(300);await p.click('#acctBtn');await p.waitForSelector('#ov [data-signout]')});
  await visit('forum (signed in)',async()=>{await p.keyboard.press('Escape');await p.evaluate(()=>{location.hash='#forum'})});
  const LABELS=['prof.stage','prof.reg','path.story','path.date.t','path.date.note','path.date.f','path.date.bk','path.date2.t','path.date2.note','sch.n','sch.note','sch.u2','nick','nick.other','old.name','old.email','old.phone','interests','forum.q.t','forum.q.b','forum.a.b','forum.q.topic','forum.q.ctx','forum.q.inst','forum.role.inst','forum.uid','forum.qid','calc.n','google-name','ask.ctx','ask.inst','ask.topic','auth.reason','report.what','report.val','report.src','report.st','cu.t','cu.note','fact','toast','say','route.sp','route.q','route.raw','route.deg','route.occ','route.mh','q.code','q.error'];
  console.log('\ncoverage: payload text that was actually shown somewhere (escaped or not): '+LABELS.filter(l=>seen.has(l)).length+' of '+LABELS.length);
  console.log('  never shown on any page the script reached (sanitized away, or not reachable here): '+LABELS.filter(l=>!seen.has(l)).join(', '));
  console.log(`\nXSS fuzz: ${findings.size} finding(s)  (${errs.length} page error(s))`);
  for(const f of findings.values())console.log(`  - ${f.where}: ${f.what}${f.detail?' ['+f.detail+']':''}`);
  await b.close();await web.close();process.exit(findings.size?1:0);
})().catch(e=>{console.log('ERROR',String(e).slice(0,500));process.exit(2)});
