#!/usr/bin/env node
/* The whole suite in one command, one test after the other (never in parallel: the browser tests are slow when the machine is busy), each with its own time limit.
   Run: node tests/quiz-v2/all.js      Exit code 0 only if every test passed.  */
const {spawnSync}=require('child_process');const path=require('path');
const T=[
  ['CSP: the policy hash matches the page script (tools/csp-hash.js)','../../tools/csp-hash.js',20],
  ['engine: personas, invariants, replay, simulation','run.js',120],
  ['results: scores and results against the document','results.js',60],
  ['gender forms: every form, three states','gx.js',30],
  ['routes and degree scores (page)','site.js',90],
  ['integration: adapters, profile, saving (page)','integration.js',240],
  ['review fixes: day screen, focus, results layout, gender (page)','fixes.js',120],
  ['gender across the site: first-person forms on every page (page)','gender-site.js',120],
  ['accounts, stage 1: sign-in against a fake Supabase (page)','../accounts/stage1.js',200],
  ['accounts, stage 2: sync between devices, merge, old accounts (page)','../accounts/stage2.js',300],
  ['accounts, stage 3: the questionnaire in the account (page)','../accounts/stage3.js',300],
  ['accounts, stage 4: download, delete, texts, live-check script (page)','../accounts/stage4.js',300],
  ['security: CSP in the browser, what it blocks, the frame guard','../security/csp.js',120],
  ['security: XSS fuzz (every place a person\'s text lives, every page)','../security/xss-fuzz.js',300],
  ['screens: personas through the page at 1280 and 360 (page)','ui.js',420],
];
const rows=[];let bad=0;const t0=Date.now();
for(const [name,file,limit] of T){
  const t=Date.now();const r=spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8',timeout:limit*1000,killSignal:'SIGKILL',maxBuffer:1<<26,cwd:path.join(__dirname,'..','..')});
  const sec=((Date.now()-t)/1000).toFixed(1),timedOut=r.error&&r.error.code==='ETIMEDOUT',out=(r.stdout||'')+(r.stderr||'');
  /* results.js reports differences from the document as a count; the others fail through their exit code */
  const pass=!timedOut&&r.status===0&&!/check\(s\) (failed|differ)/.test(out);
  if(!pass){bad++;console.log(`\n--- ${file}: ${timedOut?'TIMED OUT after '+limit+'s':'FAILED'}\n`+out.split('\n').filter(l=>/FAIL|ERROR|differ|failed|Error/.test(l)).slice(0,15).join('\n'))}
  rows.push([pass?'PASS':timedOut?'TIMEOUT':'FAIL',sec+'s',name]);console.log(`${pass?'PASS   ':timedOut?'TIMEOUT':'FAIL   '} ${sec.padStart(6)}s  ${name}`);
}
console.log(`\n${bad?bad+' of '+T.length+' failed':'all '+T.length+' passed'} in ${((Date.now()-t0)/1000).toFixed(0)}s`);
process.exit(bad?1:0);
