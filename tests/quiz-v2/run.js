#!/usr/bin/env node
/* Stage 1 tests: the engine. Run: node tests/quiz-v2/run.js [--sim-only|--personas-only] */
const {load}=require('./lib.js');const fs=require('fs'),path=require('path');
const C=load(),{VQ,VQE}=C;const personas=JSON.parse(fs.readFileSync(path.join(__dirname,'personas.json'),'utf8'));
let fails=0,pending=0;const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL: '+m)}return c};
const pct=p=>VQE.rank(p).slice(0,3).map(w=>w+' '+Math.round(p[w]*100)+'%').join(', ');
const eqState=(a,b)=>VQE.W.every(w=>Math.abs(a.p[w]-b.p[w])<1e-12)&&JSON.stringify(a.fx)===JSON.stringify(b.fx)&&JSON.stringify(a.set)===JSON.stringify(b.set)&&JSON.stringify(a.ans)===JSON.stringify(b.ans);
const inv=(st,label)=>{ /* the checks that hold for every path */
  ok(st.asked.length<=20,label+': more than 20 questions ('+st.asked.length+')');
  ok(st.asked.length>=12,label+': fewer than 12 questions ('+st.asked.length+')');
  ok(new Set(st.asked).size===st.asked.length,label+': a question was asked twice');
  ok(st.asked.filter(x=>x==='G').length<=1&&st.asked.filter(x=>x==='HB').length<=1,label+': G or HB asked more than once');
  ok(['P1','P2','P3','P4'].every(x=>st.askedSet.has(x)),label+': one of P1-P4 was not asked');
  ok(st.asked[st.asked.length-1]==='DAY',label+': DAY is not last');
  for(const m of st.mults){if(m&&typeof m==='object'){for(const w of VQE.W)if(!(m[w]>=VQ.engine.clampMin-1e-9&&m[w]<=VQ.engine.clampMax+1e-9)){ok(false,label+': multiplier out of 0.6-1.8: '+m[w]);break}}else ok(m>=VQ.engine.clampMin&&m<=VQ.engine.clampMax,label+': multiplier out of range: '+m)}
  /* the floor is applied and then p is normalised again (spec 8.2), so the smallest possible value is floor / (1 + 11*floor) */
  const lo=VQ.engine.floor/(1+(VQE.W.length-1)*VQ.engine.floor);for(const w of VQE.W)ok(st.p[w]>=lo-1e-9,label+': a world went under the floor');
  ok(Math.abs(VQE.W.reduce((s,w)=>s+st.p[w],0)-1)<1e-9,label+': p does not sum to 1');
};
/* back, then the same answer again, gives exactly the same state; and a replay of every prefix equals the step by step state */
const replayChecks=(answers,env,label)=>{
  const st=VQE.init(env);
  answers.forEach((a,i)=>{VQE.apply(st,a);const r=VQE.replay(answers.slice(0,i+1),env);ok(eqState(st,r),label+': replay differs after answer '+(i+1))});
  for(const k of [1,3,Math.floor(answers.length/2)]){if(k>=answers.length)continue;
    const back=VQE.replay(answers.slice(0,answers.length-k),env);const again=answers.slice(answers.length-k).reduce((s,a)=>VQE.apply(s,a),back);ok(eqState(again,st),label+': back '+k+' then the same answers is not the same state')}
};

/* ---------- 1. the three personas ---------- */
function personasTest(){
  console.log('\n== personas (spec 12.2) ==');
  for(const [name,P] of Object.entries(personas)){
    const st=VQE.init(P.env),log=[];let first=-1;const path=[];
    P.steps.forEach((s,i)=>{
      const nx=VQE.next(st);path.push(nx.id);
      if(nx.id!==s.q&&first<0){first=i;log.push(`  first difference at step ${i+1}: the document asks ${s.q}, the engine asks ${nx.id} (${nx.phase})`)}
      const a={q:s.q};if(s.q==='DAY'){a.picks=s.picks}else if(s.picks.length)a.picks=s.picks;
      if(s.q==='G'||s.q==='HB')a.w=nx.w||VQE.rank(st.p)[0];
      VQE.apply(st,a);
    });
    const after=VQE.next(st);
    console.log(`${name}: ${P.who}`);
    console.log('  questions in document: '+P.steps.length+(P.steps.length<=20?'':' (over 20!)'));
    console.log('  engine order : '+path.join(' '));
    console.log('  document order: '+P.steps.map(s=>s.q).join(' '));
    log.forEach(l=>console.log(l));
    console.log('  engine says after the last answer: '+(after.done?'done':after.id));
    console.log('  top worlds before DAY (engine): '+pct(st.p)+'   | document: '+P.expect.top.map((w,i)=>w+' '+P.expect.pct[i]+'%').join(', '));
    if(first>=0){pending++;console.log('  PENDING DECISION: question order differs from the document (see above)')}
    ok(VQE.rank(st.p)[0]===P.expect.top[0],name+': leading world is '+VQE.rank(st.p)[0]+', document says '+P.expect.top[0]);
    ok(P.steps.length<=20,name+': more than 20 questions');
    for(const m of st.mults)ok(Object.values(m).every(x=>x>=0.6-1e-9&&x<=1.8+1e-9),name+': multiplier out of range');
    replayChecks(st.ans,P.env,name);
    inv(st,name);
  }
}

/* ---------- 2. simulation ---------- */
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function simulate(perWorld,noise,seed){
  const R=rng(seed),res={n:0,top1:0,top3:0,qs:0,max:0,min:99,per:{}};
  const draw=(w,q,k)=>{ /* a user of world w: an answer is drawn in proportion to its weight for w (weight 0: almost never), and 15% of the answers are random */
    const opts=q.options.filter(VQE.hasAff);
    if(!opts.length||R()<noise){const all=q.options.slice();const out=[];while(out.length<k&&all.length)out.push(all.splice(Math.floor(R()*all.length),1)[0].id);return out}
    const pool=opts.slice(),out=[];
    while(out.length<k&&pool.length){const ws=pool.map(o=>(o.aff[w]||0)+0.05),tot=ws.reduce((a,b)=>a+b,0);let x=R()*tot,i=0;while(i<pool.length-1&&x>ws[i]){x-=ws[i];i++}out.push(pool.splice(i,1)[0].id)}
    return out};
  for(const w of VQE.W){res.per[w]={n:0,top1:0,top3:0,qs:0};
    for(let u=0;u<perWorld;u++){
      const st=VQE.run((q,nx,s)=>{
        if(q.id==='DAY')return {picks:['DAY_pick'],occ:null};
        if(q.id==='G'){const tw=nx.w;return {picks:[tw===w?(R()<.6?'G_1':'G_2'):(R()<.7?'G_4':'G_3')]}}
        if(q.id==='HB'){const tw=nx.w;return {picks:[tw===w?(R()<.6?'HB_1':'HB_2'):(R()<.5?'HB_3':'HB_2')]}}
        const k=Math.min(q.maxPick,q.fmt==='chips'?1:q.maxPick);
        return {picks:draw(w,q,q.phase==='practical'?Math.min(k,q.maxPick):k)}},{profile:{}});
      const rk=VQE.rank(st.p),n=st.asked.length;
      inv(st,'sim '+w+'#'+u);
      res.n++;res.qs+=n;res.max=Math.max(res.max,n);res.min=Math.min(res.min,n);
      const a=rk[0]===w,b=rk.slice(0,3).includes(w);if(a)res.top1++;if(b)res.top3++;
      const pw=res.per[w];pw.n++;pw.qs+=n;if(a)pw.top1++;if(b)pw.top3++}}
  return res}
function simTest(){
  console.log('\n== simulation: 100 simulated users per world, 15% noise ==');
  const t0=Date.now(),r=simulate(100,.15,12345);
  console.log(`users ${r.n} · correct world first: ${(100*r.top1/r.n).toFixed(1)}% · among top 3: ${(100*r.top3/r.n).toFixed(1)}% · questions avg ${(r.qs/r.n).toFixed(1)} (min ${r.min}, max ${r.max}) · ${Date.now()-t0} ms`);
  console.log('  (the document: about 97% / 99.6% / 16.6)');
  for(const w of VQE.W){const p=r.per[w];console.log(`  ${w.padEnd(8)} first ${(100*p.top1/p.n).toFixed(0).padStart(3)}%  top3 ${(100*p.top3/p.n).toFixed(0).padStart(3)}%  questions ${(p.qs/p.n).toFixed(1)}`)}
  return r}

const arg=process.argv[2];
if(arg!=='--sim-only')personasTest();
if(arg!=='--personas-only')simTest();
console.log('\n'+(fails?`${fails} check(s) failed`:'all checks passed')+(pending?` · ${pending} persona(s) with a different question order, waiting for a decision`:''));
process.exit(fails?1:0);
