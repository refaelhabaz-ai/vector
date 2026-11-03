#!/usr/bin/env node
/* First-person masculine forms ("אני יכול להתקבל", "אני עומד בתנאים") anywhere on the site go through gx. For a woman, a man and a profile with no gender,
   it visits the degrees page, "what can I study", jobs, the Q&A, a degree page, an occupation page, the comparison and the terms page, and reads the visible text.
   It also checks that no template placeholder ("${") leaked into a text, and that the page raised no error.   Run: node tests/quiz-v2/gender-site.js */
const {chromium}=require('playwright');const path=require('path');
const URL='file://'+path.join(__dirname,'..','..','index.html');
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+m);return c};
const MASC=/(^|[^א-ת])ש?אני (יכול|עומד)(?![א-ת/])/g, FEM=/(^|[^א-ת])ש?אני (יכולה|עומדת)(?![א-ת])/g, BOTH=/(^|[^א-ת])ש?אני (יכול\/ה|עומד\/ת)/g;
(async()=>{
  const b=await chromium.launch();
  for(const sex of ['f','m','']){
    const ctx=await b.newContext({viewport:{width:1280,height:900}}),p=await ctx.newPage();p.setDefaultTimeout(8000);const errs=[];p.on('pageerror',e=>errs.push(String(e)));
    await p.goto(URL);await p.evaluate(s=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1');localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',...(s?{sex:s}:{})}))},sex);
    await p.goto(URL+'#');await p.reload();await p.waitForTimeout(600);
    const ids=await p.evaluate(()=>({deg:DEG.filter(d=>d.of.length>2)[0].id,occ:OCLIST[0].id}));
    const text=await p.evaluate(async ids=>{
      const out={},grab=()=>(document.body.innerText||'')+' '+[...document.querySelectorAll('[aria-label],[placeholder],[title]')].map(e=>(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('placeholder')||'')+' '+(e.getAttribute('title')||'')).join(' ');
      for(const h of ['','degrees','me','jobs','forum','dir','calc','terms','list','deg-'+ids.deg,'occ-'+ids.occ]){location.hash='#'+h;await new Promise(r=>setTimeout(r,450));out[h||'home']=grab()+' '+document.title}
      S.cmp=DEG.filter(d=>d.of.length>2).slice(0,2).map(d=>d.id);openCmp();await new Promise(r=>setTimeout(r,300));out.compare=grab();
      /* the Q&A answers themselves (written once per gender form) */
      const D=demoDocs();out.faq=Object.values(D).flatMap(x=>[...Object.values(x.q||{}).map(q=>q.t),...Object.values(x.a||{}).map(a=>a.b)]).join(' ');
      return out},ids);
    const all=Object.values(text).join(' \n ');
    const masc=(all.match(MASC)||[]).length,fem=(all.match(FEM)||[]).length,both=(all.match(BOTH)||[]).length;
    const where=Object.entries(text).filter(([k,v])=>MASC.test(v)&&!(MASC.lastIndex=0)).map(x=>x[0]);
    if(sex==='f')ok(masc===0&&fem>0,`female profile: masculine ${masc}, feminine ${fem} (feminine seen in ${Object.entries(text).filter(([k,v])=>(FEM.lastIndex=0,FEM.test(v))).map(x=>x[0]).join(', ')})`);
    if(sex==='m')ok(fem===0&&masc>0,`male profile: feminine ${fem}, masculine ${masc}`);
    if(!sex)ok(masc===0&&fem===0&&both>0,`no gender: both forms written (${both}), masculine-only ${masc}, feminine-only ${fem}`);
    ok(!/\$\{/.test(all)&&!/'\s*\+\s*gx\(/.test(all),`${sex||'none'}: no template placeholder in any text`);
    ok(errs.length===0,`${sex||'none'}: no page errors ${errs.slice(0,2).join(';')}`);
    await ctx.close();
  }
  await b.close();
  console.log(fails?`\n${fails} FAILED`:'\nall checks passed');process.exit(fails?1:0);
})().catch(e=>{console.log('ERROR',String(e).slice(0,400));process.exit(1)});
