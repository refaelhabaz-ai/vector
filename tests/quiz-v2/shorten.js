#!/usr/bin/env node
/* Phase 2 of the journey: a shorter questionnaire that gives the same answer as the long one.
   Two copies of the engine run on the same 1,200 simulated users (100 per world, 15% noise, the owner's answer model from run.js). One copy has the parameters of the long
   questionnaire (LEGACY, the numbers of the document), the other the parameters in index.html. Every simulated answer depends only on the user and the question, so a user gives the
   same answer to the same question in both copies and the two runs differ only in which questions were asked and when the engine stopped.
   It checks: the average length (the aim is 10-14 questions with the last one, the three work days), that the world the user really has is still found, and that the short run agrees
   with the long run about the top world and the top three.        node tests/quiz-v2/shorten.js [--report]    */
const {load}=require('./lib.js');
const LEGACY={realityCore:["P1","P2","P3","P4","P5","P6"],coreBudget:8,stop:{topP:.5,gap:.15,stableTop3:2},guess:{minAsked:7,latestAt:10,minTopP:.3},maxN:19,focusMax:13,stopMinN:9,hobbyMinN:6,refineBelow:11};
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function build(legacy){const c=load();const E=c.VQ.engine;if(legacy){Object.assign(E,JSON.parse(JSON.stringify(LEGACY)))}return c}
function runUser(c,w,u,noise){
  const {VQE}=c;
  const R=(q)=>rng(hash(w+'#'+u+'#'+q.id));
  const draw=(q,k)=>{const r=R(q),opts=q.options.filter(VQE.hasAff);
    if(!opts.length||r()<noise){const all=q.options.slice(),out=[];while(out.length<k&&all.length)out.push(all.splice(Math.floor(r()*all.length),1)[0].id);return out}
    const pool=opts.slice(),out=[];while(out.length<k&&pool.length){const ws=pool.map(o=>Math.pow(0.3+(o.aff[w]||0),1.6)),tot=ws.reduce((a,b)=>a+b,0);let x=r()*tot,i=0;while(i<pool.length-1&&x>ws[i]){x-=ws[i];i++}out.push(pool.splice(i,1)[0].id)}return out};
  return VQE.run((q,nx)=>{
    if(q.id==='DAY')return {picks:['DAY_pick'],occ:null};
    const r=R(q);
    if(q.id==='G'){return {picks:[nx.w===w?(r()<.6?'G_1':'G_2'):(r()<.7?'G_4':'G_3')]}}
    if(q.id==='HB'){return {picks:[nx.w===w?(r()<.6?'HB_1':'HB_2'):(r()<.5?'HB_3':'HB_2')]}}
    const k=Math.min(q.maxPick,q.fmt==='chips'?1:q.maxPick);return {picks:draw(q,k)}},{profile:{}})}
function compare(perWorld,noise){
  const L=build(true),S=build(false),out={n:0,qL:0,qS:0,maxS:0,minS:0,top1S:0,top3S:0,top1L:0,top3L:0,agree1:0,jac:0,dist:{}};out.minS=99;
  for(const w of S.VQE.W)for(let u=0;u<perWorld;u++){
    const a=runUser(L,w,u,noise),b=runUser(S,w,u,noise),ra=L.VQE.rank(a.p),rb=S.VQE.rank(b.p),nL=a.asked.length,nS=b.asked.length;
    out.n++;out.qL+=nL;out.qS+=nS;out.maxS=Math.max(out.maxS,nS);out.minS=Math.min(out.minS,nS);out.dist[nS]=(out.dist[nS]||0)+1;
    if(ra[0]===w)out.top1L++;if(ra.slice(0,3).includes(w))out.top3L++;if(rb[0]===w)out.top1S++;if(rb.slice(0,3).includes(w))out.top3S++;
    if(ra[0]===rb[0])out.agree1++;const A=new Set(ra.slice(0,3)),B=new Set(rb.slice(0,3));out.jac+=[...A].filter(x=>B.has(x)).length/3}
  return out}
const pc=(x,n)=>(100*x/n).toFixed(1)+'%';
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+m)};
const t0=Date.now(),r=compare(100,.15),n=r.n;
console.log(`1,200 simulated users, ${Date.now()-t0} ms`);
console.log(`  long run : ${(r.qL/n).toFixed(1)} questions on average · right world first ${pc(r.top1L,n)} · in the top 3 ${pc(r.top3L,n)}`);
console.log(`  short run: ${(r.qS/n).toFixed(1)} questions on average (min ${r.minS}, max ${r.maxS}) · right world first ${pc(r.top1S,n)} · in the top 3 ${pc(r.top3S,n)}`);
console.log(`  the two runs agree on the top world for ${pc(r.agree1,n)}; the top three share ${(100*r.jac/n).toFixed(1)}% of their worlds`);
console.log('  length of the short run: '+Object.keys(r.dist).sort((a,b)=>a-b).map(k=>`${k}:${r.dist[k]}`).join(' '));
ok(r.qS/n<=14,'the short run needs 14 questions or fewer on average (with the last one)');
ok(r.maxS<=14,'no run is longer than 14');
ok(r.top1S/n>=.94,'the right world is first for 94% or more');
ok(r.top3S/n>=.985,'the right world is in the top 3 for 98.5% or more');
ok(r.agree1/n>=.94,'the short run and the long run agree on the top world for 94% or more');
ok(r.jac/n>=.83,'the top three of the two runs share 83% or more');
console.log(fails?`\n${fails} FAILED`:'\nall checks passed');process.exit(fails?1:0);
