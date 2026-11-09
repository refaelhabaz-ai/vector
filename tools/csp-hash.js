#!/usr/bin/env node
/* Keeps the Content-Security-Policy of index.html in step with the page's inline scripts.
   The policy allows each inline script by its SHA-256 hash, so ANY edit of a script changes its hash and the browser then blocks that script (the whole site, for the main one)
   until the policy is updated. The page has two inline scripts: the site itself, and the helper bot (Vecti) at the end of the file.
     node tools/csp-hash.js --check     exits 1 (and says why) if the hashes in the policy are not the hashes of the scripts, or the policy is weakened
     node tools/csp-hash.js --write     rewrites the hashes in the policy
   If the site is blocked after an edit: run `node tools/csp-hash.js --write` and commit index.html.   */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const FILE=process.env.CSP_FILE||path.join(__dirname,'..','index.html');
const REQUIRED=["default-src 'none'","object-src 'none'","base-uri 'none'","script-src 'self' 'sha256-"];   /* the parts of the policy that must stay */
const hashOf=t=>'sha256-'+crypto.createHash('sha256').update(t.replace(/\r\n?/g,'\n'),'utf8').digest('base64');
function analyse(html){
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/\bsrc\s*=/.test(m[1]));
  const metas=[...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*>/gi)];
  const problems=[];
  if(!scripts.length)problems.push('no inline <script> found');
  if(metas.length!==1)problems.push(`expected exactly one Content-Security-Policy meta tag, found ${metas.length}`);
  const want=scripts.map(m=>hashOf(m[2]));   /* in page order */
  let have=[],policy=null;
  if(metas.length===1){policy=metas[0][1];have=[...policy.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map(m=>m[1]);
    REQUIRED.forEach(r=>{if(!policy.includes(r))problems.push(`the policy no longer contains: ${r}`)});
    if(/unsafe-eval|script-src[^;]*'unsafe-inline'/.test(policy))problems.push("the policy allows 'unsafe-eval' or an inline script without a hash")}
  want.forEach((h,i)=>{if(!have.includes(h))problems.push(`inline script ${i+1} (${scripts[i][2].length} characters) is not allowed: its hash is ${h}`)});
  have.forEach(h=>{if(!want.includes(h))problems.push(`the policy allows a script hash that matches no script: ${h}`)});
  return {problems,want,have,policy,metas};
}
/* the script-src list becomes exactly the scripts' hashes, in page order */
function write(html,a){return html.replace(/(script-src 'self')((?: 'sha256-[A-Za-z0-9+/=]*')*)/,(m,s)=>s+a.want.map(h=>` '${h}'`).join(''))}
module.exports={analyse,write};
if(require.main===module){
  const html=fs.readFileSync(FILE,'utf8'),a=analyse(html),mode=process.argv[2]||'--check';
  if(mode==='--write'){if(!a.want.length||a.metas.length!==1){console.log('cannot write: '+a.problems.join('; '));process.exit(1)}
    fs.writeFileSync(FILE,write(html,a));console.log('policy hashes set to '+a.want.join(' '));process.exit(0)}
  if(a.problems.length){console.log('CSP check FAILED:\n  - '+a.problems.join('\n  - ')+'\nFix: node tools/csp-hash.js --write   (then commit index.html)');process.exit(1)}
  console.log('CSP check passed: the policy allows the page scripts by their hashes ('+a.want.join(', ')+')');
}
