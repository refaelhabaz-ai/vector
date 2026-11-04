#!/usr/bin/env node
/* Keeps the Content-Security-Policy of index.html in step with the page's one inline script.
   The policy allows that script by its SHA-256 hash, so ANY edit of the script changes the hash and the browser then blocks the whole site until the policy is updated.
     node tools/csp-hash.js --check     exits 1 (and says why) if the hash in the policy is not the hash of the script, or the policy is weakened
     node tools/csp-hash.js --write     updates the hash in the policy
   If the site is blocked after an edit: run `node tools/csp-hash.js --write` and commit index.html.   */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const FILE=process.env.CSP_FILE||path.join(__dirname,'..','index.html');
const REQUIRED=["default-src 'none'","object-src 'none'","base-uri 'none'","script-src 'self' 'sha256-"];   /* the parts of the policy that must stay */
function analyse(html){
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/\bsrc\s*=/.test(m[1]));
  const metas=[...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*>/gi)];
  const problems=[];
  if(scripts.length!==1)problems.push(`expected exactly one inline <script>, found ${scripts.length} (every inline script must be allowed by its own hash)`);
  if(metas.length!==1)problems.push(`expected exactly one Content-Security-Policy meta tag, found ${metas.length}`);
  let want=null,have=null,policy=null;
  if(scripts.length===1){want='sha256-'+crypto.createHash('sha256').update(scripts[0][2].replace(/\r\n?/g,'\n'),'utf8').digest('base64')}
  if(metas.length===1){policy=metas[0][1];const h=policy.match(/'(sha256-[A-Za-z0-9+/=]+)'/);have=h?h[1]:null;
    REQUIRED.forEach(r=>{if(!policy.includes(r))problems.push(`the policy no longer contains: ${r}`)});
    if(/unsafe-eval|script-src[^;]*'unsafe-inline'/.test(policy))problems.push("the policy allows 'unsafe-eval' or an inline script without a hash")}
  if(want&&have!==want)problems.push(`the hash in the policy is ${have||'(none)'}, the script's hash is ${want}`);
  return {problems,want,have,policy,metas};
}
function write(html,a){return html.replace(/'sha256-[A-Za-z0-9+/=]*'/,`'${a.want}'`)}
module.exports={analyse,write};
if(require.main===module){
  const html=fs.readFileSync(FILE,'utf8'),a=analyse(html),mode=process.argv[2]||'--check';
  if(mode==='--write'){if(!a.want||a.metas.length!==1){console.log('cannot write: '+a.problems.join('; '));process.exit(1)}
    fs.writeFileSync(FILE,write(html,a));console.log('policy hash set to '+a.want);process.exit(0)}
  if(a.problems.length){console.log('CSP check FAILED:\n  - '+a.problems.join('\n  - ')+'\nFix: node tools/csp-hash.js --write   (then commit index.html)');process.exit(1)}
  console.log('CSP check passed: the policy allows the page script by its hash ('+a.want+')');
}
