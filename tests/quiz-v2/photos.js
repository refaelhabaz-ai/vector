#!/usr/bin/env node
/* Photos: every degree, profession and technician track resolves to a photo that exists on disk, is small enough, and has a credit row in docs/photo-credits.md.
   Run: node tests/quiz-v2/photos.js */
require('./jrn-patch.js');const {chromium}=require('playwright');const path=require('path'),fs=require('fs');
const ROOT=path.join(__dirname,'..','..'),URL='file://'+path.join(ROOT,'index.html');
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+m);return c};
(async()=>{
  const b=await chromium.launch(),p=await b.newPage();await p.goto(URL);await p.waitForTimeout(800);
  const R=await p.evaluate(()=>{const files=new Set();let none=0,deg=0,occ=0,mh=0;
    DEG.forEach(d=>{const x=degPhoto(d);if(x){files.add(x[0]);deg++}else none++});
    (typeof OCLIST!=='undefined'?OCLIST:[]).forEach(o=>{const x=occPhoto(o.id,OC[o.id]);if(x){files.add(x[0]);occ++}else none++});
    (typeof MHS!=='undefined'?MHS:[]).forEach(m=>{const x=mhPhoto(m);if(x){files.add(x[0]);mh++}else none++});
    const spec=OCLIST.filter(o=>!((occPhoto(o.id,OC[o.id])||[''])[0]).startsWith('cat-')).length;return {files:[...files],none,deg,occ,mh,n:DEG.length,spec,nocc:OCLIST.length,degSpec:DEG.filter(d=>!((degPhoto(d)||[''])[0]).startsWith('cat-')).length}});
  const credits=fs.readFileSync(path.join(ROOT,'docs','photo-credits.md'),'utf8');
  ok(R.deg===R.n,`every degree has a photo (${R.deg} of ${R.n})`);
  ok(R.spec>=260,`at least 260 of ${R.nocc} professions have a photo of their own field (${R.spec})`);
  ok(R.degSpec>=520,`at least 520 of ${R.n} degrees have a photo of their own field (${R.degSpec})`);
  ok(R.none===0,`nothing falls back to no photo (${R.none})`);
  const missing=R.files.filter(f=>!fs.existsSync(path.join(ROOT,'photos',f+'.webp')));
  ok(!missing.length,`all ${R.files.length} photos used by the pages exist on disk ${missing.join(',')}`);
  const big=R.files.filter(f=>fs.existsSync(path.join(ROOT,'photos',f+'.webp'))&&fs.statSync(path.join(ROOT,'photos',f+'.webp')).size>150000);
  ok(!big.length,`every photo is at most 150 KB ${big.join(',')}`);
  const nocredit=R.files.filter(f=>!credits.includes('`photos/'+f+'.webp`'));
  ok(!nocredit.length,`every photo used has a credit row in docs/photo-credits.md ${nocredit.join(',')}`);
  await b.close();console.log(fails?`\n${fails} FAILED`:'\nall checks passed');process.exit(fails?1:0)})();
