#!/usr/bin/env node
/* Moves the opening texts of docs/intro-texts.md into index.html (between the INTRO and INTRO-END markers).
   Format of the file, one block per page:
     ## deg:d31 — פסיכולוגיה          (deg:<degree id> | occ:<occupation id> | mh:<technician track index>)
     <the text, 2-4 sentences>
     מקורות:
     - https://...   (at least two reliable sources that were checked)
   A block with fewer than two sources is refused, so a text never goes live without them.
     node tools/build-intros.js           writes index.html
     node tools/build-intros.js --check   exits 1 if index.html differs from the file */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..'),MD=path.join(ROOT,'docs','intro-texts.md'),HTML=path.join(ROOT,'index.html');
const md=fs.readFileSync(MD,'utf8'),out={deg:{},occ:{},mh:{}};
const blocks=md.split(/^## /m).slice(1);
for(const b of blocks){
  const m=b.match(/^(deg|occ|mh):(\S+)[^\n]*\n([\s\S]*)$/);if(!m)continue;
  const [,kind,id,rest]=m,parts=rest.split(/^מקורות:\s*$/m);
  const text=parts[0].replace(/\s+/g,' ').trim(),srcs=((parts[1]||'').match(/https?:\/\/\S+/g)||[]);
  if(!text){continue}
  if(srcs.length<2){console.error(`REFUSED ${kind}:${id}: ${srcs.length} source(s), at least 2 are required`);process.exit(1)}
  if(/[0-9]/.test(text)&&!/<!--\s*numbers-ok/.test(rest)){console.error(`CHECK ${kind}:${id}: the text has a digit. A number in the hook must come from an official source (add <!-- numbers-ok: where from --> under the block after checking it)`);process.exit(1)}
  out[kind][kind==='mh'?+id:id]=text;
}
const html=fs.readFileSync(HTML,'utf8'),a=html.indexOf('/*@@INTRO@@*/'),z=html.indexOf('/*@@INTRO-END@@*/');
if(a<0||z<0){console.error('markers not found');process.exit(1)}
const next=html.slice(0,a)+'/*@@INTRO@@*/const INTRO='+JSON.stringify(out).replace(/</g,'\\u003c')+';'+html.slice(z);
if(process.argv.includes('--check')){if(next!==html){console.error('index.html is not what docs/intro-texts.md produces: run node tools/build-intros.js');process.exit(1)}console.log('intro texts: up to date ('+Object.values(out).reduce((n,o)=>n+Object.keys(o).length,0)+')');process.exit(0)}
fs.writeFileSync(HTML,next);console.log('wrote '+Object.values(out).reduce((n,o)=>n+Object.keys(o).length,0)+' intro texts');
