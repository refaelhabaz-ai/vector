const acorn=require('/opt/node-tools/node_modules/acorn'),walk=require('/opt/node-tools/node_modules/acorn-walk');
/* Second step of the static review: of the interpolations that scan-sinks.js did not clear, keeps those in functions that read a place where a person's text lives.
   Run: SCAN_OUT=/tmp/a.json node tests/security/scan-sinks.js && SCAN_OUT=/tmp/a.json SCAN2_OUT=/tmp/b.json node tests/security/scan-taint.js */
const fs=require('fs'),path=require('path');const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);const off=html.slice(0,html.indexOf('<script>')).split('\n').length;const src=m[1];
const ast=acorn.parse(src,{ecmaVersion:'latest',locations:true,allowReturnOutsideFunction:true});
const flagged=JSON.parse(fs.readFileSync(''+(process.env.SCAN_OUT||'/tmp/sinks.json')+'','utf8'));
const fl=new Map();flagged.forEach(f=>{(fl.get(f.line)||fl.set(f.line,[]).get(f.line)).push(f)});
/* enclosing functions with their source */
const fns=[];walk.full(ast,n=>{if(/Function/.test(n.type))fns.push({s:n.loc.start.line+off-1,e:n.loc.end.line+off-1,name:(n.id&&n.id.name)||'',len:n.end-n.start,src:src.slice(n.start,n.end)})});
const SRC=/\bpth\(\)|\bPTH\b|schS\(\)|schRec|SCHS|FM\.docs|FM\.names|FM\.q|\bACC\b|ACC\.cur|store\.get\(|localStorage|location\.(hash|search)|S\.prof|S\.sc\b|CALC_ROWS|\bFF\.|JOBF\.q|TF\.q|\bASK\b|\.story|\.note|nicks|interests|SUPA\.user|user_metadata|r\.id|route/;
const res={};
for(const [line,list] of fl){let best=null;for(const f of fns)if(f.s<=line&&f.e>=line&&(!best||f.len<best.len))best=f;
  const key=best?best.name+'@'+best.s:'(top)';
  if(best&&!SRC.test(best.src))continue; res[key]=(res[key]||[]).concat(list.map(x=>x.line+' '+x.ctx+' '+x.expr))}
const keys=Object.keys(res);console.log(keys.length+' functions touch user-controlled sources and contain not-obviously-safe interpolations; '+keys.reduce((a,k)=>a+res[k].length,0)+' interpolations');
fs.writeFileSync(''+(process.env.SCAN2_OUT||'/tmp/sinks2.json')+'',JSON.stringify(res,null,1));
keys.sort((a,b)=>res[b].length-res[a].length).slice(0,25).forEach(k=>console.log(String(res[k].length).padStart(4),k))
