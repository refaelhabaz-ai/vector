#!/usr/bin/env node
/* Phase 6: the forum's "my activity" area. A signed-in person sees counts for the questions they asked, answered, follow and saved; each count opens the matching list;
   their own questions are marked in the list; the how-it-works box is folded; nothing leaks sideways at 1440/1024/390.   Run: node tests/quiz-v2/forum.js */
require('./jrn-patch.js');const {chromium}=require('playwright');const path=require('path');
const URL='file://'+path.join(__dirname,'..','..','index.html');
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+m);return c};
(async()=>{
  const b=await chromium.launch();
  for(const w of [1440,1024,390]){
    const cx=await b.newContext({viewport:{width:w,height:900}}),p=await cx.newPage();p.setDefaultTimeout(8000);const errs=[];p.on('pageerror',e=>errs.push(String(e)));
    await p.goto(URL);await p.evaluate(()=>{localStorage.setItem('kivun3.jrn',JSON.stringify({p:1}));localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1')});
    await p.goto(URL+'#forum');await p.reload();await p.waitForTimeout(900);
    await p.evaluate(()=>{FM.local=true;FM.me='me1';FM.can=true;FM.names={...FM.names,me1:'אני',o1:'מישהו'};
      FM.docs={...FM.docs,
        me1:{role:{k:'user'},q:{q1:{t:'השאלה הראשונה שלי על לימודים',b:'',anon:false,ts:Date.now()-5000,topic:'other',ctx:'',inst:'',fb:{},fbTs:{}},q2:{t:'השאלה השנייה שלי בלי תשובה',b:'',anon:false,ts:Date.now()-4000,topic:'other',ctx:'',inst:'',fb:{},fbTs:{}}},a:{a9:{q:'o1--q1',b:'התשובה שלי לשאלה של מישהו אחר',anon:false,ts:Date.now()-3000}}},
        o1:{role:{k:'user'},q:{q1:{t:'שאלה של מישהו אחר',b:'',anon:false,ts:Date.now()-6000,topic:'other',ctx:'',inst:'',fb:{},fbTs:{}}},a:{a1:{q:'me1--q1',b:'תשובה לשאלה שלי',anon:false,ts:Date.now()-2000}}}};
      FM.priv={seen:0,follow:{'o1--q1':1}};FM.idx=null;FM.state='ready';fRefresh()});await p.waitForTimeout(400);
    const m=await p.evaluate(()=>({box:!!document.querySelector('.fm-mine'),rows:[...document.querySelectorAll('.fm-mine .fm-mr')].map(r=>r.dataset.ff+':'+r.querySelector('b').textContent),note:(document.querySelector('.fm-mn')||{}).textContent,
      how:document.querySelector('.fm-side.how').tagName==='DETAILS'&&!document.querySelector('.fm-side.how').open,sw:document.documentElement.scrollWidth<=innerWidth+1}));
    ok(m.box&&m.rows.join(',')==='mine:2,ans:1,follow:1,saved:0',`@${w}: my activity shows the real counts: ${m.rows.join(' ')}`);
    ok(/על 1 מתוך 2/.test(m.note),`@${w}: it says how many of my questions got answers ("${m.note}")`);
    ok(m.how&&m.sw,`@${w}: "how it works" is folded and nothing scrolls sideways`);
    await p.click('.fm-mine [data-ff="mine"]');await p.waitForTimeout(300);
    const L=await p.evaluate(()=>({n:document.querySelectorAll('#fMain .fq2').length,mine:document.querySelectorAll('#fMain .fq2-mine').length,tab:(document.querySelector('.fm-tab[aria-selected="true"]')||{}).textContent}));
    ok(L.n===2&&L.mine===2&&L.tab==='השאלות שלי',`@${w}: "my questions" lists only mine, each marked (${L.n}, ${L.mine})`);
    await p.click('.fm-mine [data-ff="ans"]');await p.waitForTimeout(300);
    const A=await p.evaluate(()=>({n:document.querySelectorAll('#fMain .fq2').length,t:(document.querySelector('#fMain .fq2 h3')||{}).textContent}));
    ok(A.n===1&&/מישהו אחר/.test(A.t),`@${w}: "answered" lists the question I answered`);
    await p.click('.fm-mine [data-ff="follow"]');await p.waitForTimeout(300);
    ok(await p.evaluate(()=>document.querySelectorAll('#fMain .fq2').length)===1,`@${w}: "following" lists what I follow`);
    await p.click('.fm-tab[data-ff="all"]');await p.waitForTimeout(300);
    ok(await p.evaluate(()=>document.querySelectorAll('#fMain .fq2-mine').length)>=2,`@${w}: my questions are marked in the main list too`);
    await p.evaluate(()=>{FM.me=null;fRefresh()});await p.waitForTimeout(300);
    ok(await p.evaluate(()=>!document.querySelector('.fm-mine')&&!document.querySelector('.fq2-mine')),`@${w}: signed out, no activity area and nothing marked as mine`);
    ok(errs.length===0,`@${w}: no page errors ${errs[0]||''}`);await cx.close()}
  console.log(fails?`\n${fails} FAILED`:'\nall checks passed');await b.close();process.exit(fails?1:0)})();
