#!/usr/bin/env node
/* The other direction of tools/build-standalone.js: takes a stand-alone file that someone worked on (you or a friend) and turns it back into the site's index.html form,
   so the changes can be compared with the repo's index.html, checked, and merged.
     node tools/import-standalone.js <file.html>             writes dist/import/index.html and prints what changed (the repo is not touched)
     node tools/import-standalone.js <file.html> --apply     also copies it over index.html (then run the tests: node tests/quiz-v2/all.js)
   It removes what the build added (the photo table and the embedded library), puts back the photo and sign-in lines, and recomputes the Content-Security-Policy hashes.
   Changes made inside the photo table or the embedded library are not imported (a new photo has to be added to photos/ and to docs/photo-credits.md instead).   */
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=path.join(__dirname,'..'),csp=require('./csp-hash.js');
const file=process.argv[2],apply=process.argv.includes('--apply');
if(!file||!fs.existsSync(file)){console.log('usage: node tools/import-standalone.js <file.html> [--apply]');process.exit(2)}
let h=fs.readFileSync(file,'utf8');
const strip=/<script>window\.__PH=[\s\S]*?<\/script>\n<script type="text\/plain" id="supalib-src">[\s\S]*?<\/script>\n/;
if(!strip.test(h)){console.log('this does not look like a file built by build-standalone.js (the photo table is missing)');process.exit(2)}
h=h.replace(strip,'');
const back=[
 ["const ph=n=>PHU(n);","const ph=n=>`photos/${n}.webp`;"],
 ['<img src="${PHU(p[0])}"','<img src="photos/${p[0]}.webp"'],
 ['<img src="${PHU(q[0])}"','<img src="photos/${q[0]}.webp"'],
 ["s.textContent=document.getElementById('supalib-src').textContent;","s.src=SUPA_CFG.lib;s.integrity=SUPA_CFG.sri;"],
 ["document.head.appendChild(s);fin(!!(window.supabase&&window.supabase.createClient))","s.onload=()=>fin(!!(window.supabase&&window.supabase.createClient));s.onerror=()=>fin(false);document.head.appendChild(s)"]];
const missing=[];
for(const [a,b] of back){if(h.split(a).length===2)h=h.replace(a,()=>b);else missing.push(a.slice(0,50))}
if(missing.length)console.log('note: these build lines were changed or removed in the file, so they were left as they are:\n  - '+missing.join('\n  - '));
const a=csp.analyse(h);if(a.metas.length===1)h=csp.write(h,a);
const out=path.join(ROOT,'dist','import','index.html');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,h);
const cur=path.join(ROOT,'index.html');
if(fs.readFileSync(cur,'utf8')===h){console.log('no changes: the file is the same as the site in the repo');process.exit(0)}
let d='';try{d=cp.execFileSync('diff',['-u','--label','repo/index.html','--label','imported',cur,out],{maxBuffer:1<<28}).toString()}catch(e){d=(e.stdout||'').toString()}
const lines=d.split('\n'),add=lines.filter(l=>/^\+[^+]/.test(l)).length,del=lines.filter(l=>/^-[^-]/.test(l)).length;
console.log(`changed: ${add} lines added, ${del} lines removed (candidate saved at dist/import/index.html)`);
console.log(lines.filter(l=>/^[+-][^+-]/.test(l)).slice(0,30).map(l=>l.slice(0,160)).join('\n'));
if(apply){fs.copyFileSync(out,cur);console.log('applied to index.html: now run node tools/csp-hash.js --check and node tests/quiz-v2/all.js')}
