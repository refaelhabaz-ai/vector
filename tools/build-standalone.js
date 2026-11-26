#!/usr/bin/env node
/* Builds ONE html file with the whole site inside it, to send to friends or open from a phone/computer with no server and no folders:
     node tools/build-standalone.js            writes dist/vector-standalone.html
   What it does, with no change to the site's text, data or design:
     - every photo in photos/ that the site uses becomes a data: address inside the file (the site looks the photo up there instead of opening photos/<name>.webp)
     - the sign-in library (vendor/supabase-js-*.min.js) is embedded as text and run from there (a hash of it is allowed in the Content-Security-Policy)
     - the Content-Security-Policy hashes are recomputed for the changed scripts, with the same rules as tools/csp-hash.js
   Everything else (fonts, icons, the legal pages, the data) is already inside index.html.
   What still needs the internet, as on the live site: signing in with Google and the forum (they talk to Supabase). Without a connection the rest works.
   dist/ is not committed (the file is about 15MB): run this tool whenever you need a fresh copy.
   OFFLINE copy for friends:   node tools/build-standalone.js --offline   writes dist/vector-offline.html
     the same file with no connection of any kind to a database or a server: the sign-in library is not included, the project address and key are removed, the Content-Security-Policy
     allows no network requests at all (connect-src 'none'), and the sign-in button is hidden. Everything else works, and what a person types stays in their own browser.   */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const OFFLINE=process.argv.includes('--offline');
const ROOT=path.join(__dirname,'..'),OUT=path.join(ROOT,'dist',OFFLINE?'vector-offline.html':'vector-standalone.html');
const csp=require('./csp-hash.js');
let html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
/* 1. photos */
const names=fs.readdirSync(path.join(ROOT,'photos')).filter(f=>f.endsWith('.webp')).map(f=>f.slice(0,-5)).filter(n=>html.includes(n)).sort();
const map={};let bytes=0;
for(const n of names){const b=fs.readFileSync(path.join(ROOT,'photos',n+'.webp'));bytes+=b.length;map[n]='data:image/webp;base64,'+b.toString('base64')}
const repl=[
 ["const ph=n=>`photos/${n}.webp`;","const ph=n=>PHU(n);"],
 ['<img src="photos/${p[0]}.webp"','<img src="${PHU(p[0])}"'],
 ['<img src="photos/${q[0]}.webp"','<img src="${PHU(q[0])}"']];
for(const [a,b] of repl){if(html.split(a).length!==2)throw new Error('expected exactly one place to change: '+a);html=html.replace(a,()=>b)}
if(/photos\/\$\{/.test(html))throw new Error('a photo address is still built from the folder');
/* 2. the sign-in library, run from an embedded copy (the offline copy has no library and no way to reach a server) */
let libFile='(none: offline copy)',lib='';
if(!OFFLINE){
  libFile=fs.readdirSync(path.join(ROOT,'vendor')).find(f=>/^supabase-js-.*\.min\.js$/.test(f));
  lib=fs.readFileSync(path.join(ROOT,'vendor',libFile),'utf8');
  if(/<\/script/i.test(lib))throw new Error('the library contains </script');
  const a1="s.src=SUPA_CFG.lib;s.integrity=SUPA_CFG.sri;",b1="s.textContent=document.getElementById('supalib-src').textContent;";
  const a2="s.onload=()=>fin(!!(window.supabase&&window.supabase.createClient));s.onerror=()=>fin(false);document.head.appendChild(s)";
  const b2="document.head.appendChild(s);fin(!!(window.supabase&&window.supabase.createClient))";
  for(const [a,b] of [[a1,b1],[a2,b2]]){if(html.split(a).length!==2)throw new Error('expected exactly one place to change: '+a);html=html.replace(a,()=>b)}
}else{
  const cuts=[
    ["url:'https://wgarkvjbwzmpdvvrsrni.supabase.co',","url:'https://offline.invalid',"],
    ["key:'sb_publishable_Rm7ngD6e2fFrU6i8GTyArw__IhyrXjr',","key:'',"],
    ["if(window.supabase&&window.supabase.createClient)return Promise.resolve(true);","return Promise.resolve(false);"],
    ["connect-src https://wgarkvjbwzmpdvvrsrni.supabase.co;","connect-src 'none';"]];
  for(const [a,b] of cuts){if(html.split(a).length!==2)throw new Error('expected exactly one place to change: '+a);html=html.replace(a,()=>b)}
  html=html.replace('</style>','#acctBtn,.vm [data-acct],[data-vmacct]{display:none!important}\n</style>');
  if(/supabase\.co/.test(html))throw new Error('the offline copy still mentions the database address');
}
/* the photo table and the library go in front of the site's own script */
const inject=`<script>window.__PH=${JSON.stringify(map)};window.PHU=function(n){return window.__PH[n]||('photos/'+n+'.webp')};</script>\n${OFFLINE?'':`<script type="text/plain" id="supalib-src">${lib}</script>\n`}`;
const i=html.search(/<script\b(?![^>]*\bsrc=)/);
if(i<0)throw new Error('no inline script found');
html=html.slice(0,i)+inject+html.slice(i);
/* 3. policy hashes for every inline script, the embedded library included */
const a=csp.analyse(html);
if(a.metas.length!==1)throw new Error('expected one Content-Security-Policy tag');
html=csp.write(html,a);
const b=csp.analyse(html);
if(b.problems.length)throw new Error('CSP: '+b.problems.join('; '));
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,html);
console.log(`wrote ${path.relative(ROOT,OUT)}: ${(html.length/1048576).toFixed(1)} MB, ${names.length} photos (${(bytes/1048576).toFixed(1)} MB), library ${libFile}`);
