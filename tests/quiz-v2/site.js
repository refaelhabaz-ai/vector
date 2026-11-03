#!/usr/bin/env node
/* Stage 2, the part that needs the site's own functions (occDegs, degLinks, degAdmit...): runs index.html in a browser. Run: node tests/quiz-v2/site.js */
const {chromium}=require('playwright');const path=require('path'),fs=require('fs');
const personas=JSON.parse(fs.readFileSync(path.join(__dirname,'personas.json'),'utf8'));
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL: '+m)}return c};
(async()=>{
  const b=await chromium.launch(),p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file://'+path.join(__dirname,'..','..','index.html'));await p.waitForTimeout(1500);
  ok(await p.evaluate(()=>typeof VQR==='object'&&typeof vqRoutes==='function'),'the module is not loaded in the page');
  /* the same scores in the page as in Node: the page runs the same code on the site's own data */
  const res=await p.evaluate(P=>{const out={};
    for(const [name,per] of Object.entries(P)){const st=VQE.init({});per.steps.slice(0,-1).forEach(s=>{const a={q:s.q};if(s.picks.length)a.picks=s.picks;if(s.q==='G'||s.q==='HB')a.w=VQE.rank(st.p)[0];VQE.apply(st,a)});
      const R=VQR.results(st);out[name]={dirs:R.dirs.map(d=>d.world+':'+d.occs.map(x=>x.id).join(',')),wild:R.wildcard&&R.wildcard.id}}
    return out},personas);
  console.log('page results: '+JSON.stringify(Object.fromEntries(Object.entries(res).map(([k,v])=>[k,v.dirs[0]]))));
  /* routes: Daniel (region s, reloc 0, years 1, practical), and the same occupation with no profile region */
  const r=await p.evaluate(()=>{
    const st=VQE.init({});const set={reloc:0,years:1,track:'practical'};
    const occ='2263'; /* a health occupation with degrees */ 
    const a=vqRoutes('2131',set,{reg:'s'}),b=vqRoutes('2131',set,{}),c=vqRoutes('2131',{reloc:2,years:8,track:'academic'},{reg:'s'});
    const pack=x=>({first:x.first,n:x.degrees.length,prac:x.practical.length,tags:x.degrees.map(d=>d.tags.map(t=>t.k).join('+')),near:x.degrees.map(d=>d.near+'/'+d.all)});
    return {a:pack(a),b:pack(b),c:pack(c)}});
  console.log('routes, my region only, 1 year: '+JSON.stringify(r.a));console.log('routes, no region in the profile: '+JSON.stringify(r.b));console.log('routes, anywhere, 8 years: '+JSON.stringify(r.c));
  ok(r.b.tags.every(t=>!/move/.test(t)),'with no region nothing may be marked "needs a move"');
  ok(r.c.tags.every(t=>t===''),'anywhere and 8 years: no tag expected');
  ok(r.a.tags.some(t=>/long|move/.test(t)),'region only and 1 year: some degree should carry a tag');
  /* the order: what needs a move goes last, and nothing is removed */
  const o=await p.evaluate(()=>{const x=vqRoutes('2131',{reloc:0,years:1,track:'practical'},{reg:'n'}),y=vqRoutes('2131',{reloc:0,years:1,track:'practical'},{reg:'s'});const idx=a=>a.degrees.findIndex(d=>d.tags.some(t=>t.k==='move'));
    return {n:x.degrees.length===y.degrees.length,sorted:x.degrees.every((d,i,A)=>i===0||!(A[i-1].tags.some(t=>t.k==='move')&&!d.tags.some(t=>t.k==='move')))}});
  ok(o.n&&o.sorted,'filtering must not remove degrees, and those out of reach must come last');
  /* an occupation with practical routes: a practical track puts them first */
  const pr=await p.evaluate(()=>{const id=Object.keys(OC).find(i=>(OC[i].edu||[]).some(e=>e.kind!=='Academic')&&DIRD.occ[i]);const a=vqRoutes(id,{track:'practical'},{}),b=vqRoutes(id,{track:'academic'},{});return {id,a:a.first,b:b.first,n:a.practical.length}});
  console.log('practical routes ('+pr.id+'): '+pr.n+' routes; track practical -> '+pr.a+', academic -> '+pr.b);ok(pr.n>0&&pr.a==='practical'&&pr.b==='academic','practical routes come first only for a practical track');
  /* degree scores through degLinks */
  const g=await p.evaluate(P=>{const per=P.noa,st=VQE.init({});per.steps.slice(0,-1).forEach(s=>{const a={q:s.q};if(s.picks.length)a.picks=s.picks;if(s.q==='G'||s.q==='HB')a.w=VQE.rank(st.p)[0];VQE.apply(st,a)});
    const R=VQR.results(st),D=vqDegScores(R),ids=Object.keys(D).sort((a,b)=>D[b].t-D[a].t);return {n:ids.length,top:ids.slice(0,5).map(id=>BY[id].n),ok:ids.every(id=>isFinite(D[id].t)&&D[id].top>0&&D[id].top<=1)}},personas);
  console.log('degrees scored (Noa): '+g.n+', top: '+g.top.join(' · '));ok(g.ok&&g.n>50,'degree scores');
  ok(errs.length===0,'page errors: '+errs.join(' | '));
  await b.close();console.log('\n'+(fails?`${fails} check(s) failed`:'all checks passed'));process.exit(fails?1:0);
})();
