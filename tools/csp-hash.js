#!/usr/bin/env node
/* Keeps the Content-Security-Policy of index.html in step with the page's inline scripts.
   The policy allows each inline script by its SHA-256 hash, so ANY edit of an inline script changes its hash and the browser then blocks that script (the site, if it is the main one)
   until the policy is updated. An inline script that is not in the policy is blocked; a hash in the policy that no script has is stale.
     node tools/csp-hash.js --check     exits 1 (and says why) if the hashes in the policy are not exactly the hashes of the inline scripts, or the policy is weakened
     node tools/csp-hash.js --write     rewrites the hashes in the policy
   If the site (or a part of it) is blocked after an edit: run `node tools/csp-hash.js --write` and commit index.html.   */
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
  const want=scripts.map(m=>hashOf(m[2])),wantSet=[...new Set(want)];
  let have=[],policy=null;
  if(metas.length===1){policy=metas[0][1];
    const sd=(policy.match(/script-src([^;]*)/)||[,''])[1];have=[...sd.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map(m=>m[1]);
    REQUIRED.forEach(r=>{if(!policy.includes(r))problems.push(`the policy no longer contains: ${r}`)});
    if(/unsafe-eval|script-src[^;]*'unsafe-inline'/.test(policy))problems.push("the policy allows 'unsafe-eval' or an inline script without a hash")}
  wantSet.filter(h=>!have.includes(h)).forEach(h=>problems.push(`an inline script (hash ${h}) is not allowed by the policy: it would be blocked`));
  have.filter(h=>!wantSet.includes(h)).forEach(h=>problems.push(`the policy has a hash that no inline script has any more (${h})`));
  return {problems,want:wantSet,have,policy,metas,scripts:scripts.length};
}
/* the hashes in the script-src directive become exactly the hashes of the inline scripts, in the order of the page */
function write(html,a){return html.replace(/(script-src 'self')((?: 'sha256-[A-Za-z0-9+/=]*')*)/,(m,p)=>p+a.want.map(h=>` '${h}'`).join(''))}
module.exports={analyse,write};
if(require.main===module){
  const html=fs.readFileSync(FILE,'utf8'),a=analyse(html),mode=process.argv[2]||'--check';
  if(mode==='--write'){if(!a.want.length||a.metas.length!==1){console.log('cannot write: '+a.problems.join('; '));process.exit(1)}
    fs.writeFileSync(FILE,write(html,a));console.log('policy hashes set: '+a.want.join(' '));process.exit(0)}
  if(a.problems.length){console.log('CSP check FAILED:\n  - '+a.problems.join('\n  - ')+'\nFix: node tools/csp-hash.js --write   (then commit index.html)');process.exit(1)}
  console.log(`CSP check passed: the policy allows each of the ${a.scripts} inline script(s) by its hash (${a.want.join(' ')})`);
}
