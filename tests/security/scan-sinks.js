#!/usr/bin/env node
/* Static scan for XSS: parses the site's script (acorn) and lists every interpolation inside an HTML-building template literal that is NOT obviously safe
   (wrapped in esc(), a number, a fixed icon, a nested template that is itself checked, ...). The list is what a human reviews: it is a review aid, not a proof.
   Run: node tests/security/scan-sinks.js [--all]        */
const acorn=require('/opt/node-tools/node_modules/acorn'),walk=require('/opt/node-tools/node_modules/acorn-walk');
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
const m=html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)||html.match(/<script>([\s\S]*?)<\/script>/);
const off=html.slice(0,html.indexOf('<script>')).split('\n').length; /* line offset of the script inside the file */
const src=m[1];
const ast=acorn.parse(src,{ecmaVersion:'latest',locations:true,allowReturnOutsideFunction:true});
const text=n=>src.slice(n.start,n.end);
const SAFE_FN=new Set(['esc','ki','fmt','shek','dLong','dShort','ago','String','Number','Math','parseInt','parseFloat','ill','cv','JSON']);   /* esc escapes; the others return numbers, dates or fixed markup */
const NUMLIKE=/^(length|size|n|i|j|k|idx|count)$/;
function safe(e){
  switch(e.type){
    case 'Literal':return true;
    case 'TemplateLiteral':return true;                       /* visited on its own */
    case 'CallExpression':{const c=e.callee;
      if(c.type==='Identifier'&&SAFE_FN.has(c.name))return true;
      if(c.type==='MemberExpression'&&c.property.name==='join'&&c.object.type==='CallExpression'&&c.object.callee.type==='MemberExpression'&&c.object.callee.property.name==='map'){
        const f=c.object.arguments[0];if(f&&/Function/.test(f.type)){const b=f.body;return b.type==='TemplateLiteral'||b.type==='ConditionalExpression'||b.type==='CallExpression'||b.type==='BlockStatement'}}
      if(c.type==='MemberExpression'&&['toFixed','toLocaleString','toISOString'].includes(c.property.name))return true;
      return false}
    case 'MemberExpression':return (e.property.name&&NUMLIKE.test(e.property.name))||(e.object.type==='Identifier'&&/^(ICON|FIC|FIC2|CKI|Z|SVG|BACK|X)$/.test(e.object.name));
    case 'ConditionalExpression':return safe(e.consequent)&&safe(e.alternate);
    case 'LogicalExpression':return safe(e.left)&&safe(e.right);
    case 'BinaryExpression':return ['-','*','/','%','**','<','>','<=','>=','==','===','!=','!=='].includes(e.operator)||(e.operator==='+'&&safe(e.left)&&safe(e.right));
    case 'UnaryExpression':return true;
    case 'Identifier':return /^(BACK|X|CKI|NBSP)$/.test(e.name);
    default:return false}}
const out=[];
walk.full(ast,n=>{
  if(n.type!=='TemplateLiteral')return;
  if(!n.quasis.some(q=>/</.test(q.value.raw)))return;           /* not HTML */
  n.expressions.forEach((e,i)=>{if(safe(e))return;
    const before=n.quasis[i].value.raw.slice(-40).replace(/\s+/g,' ');
    const attr=/=\s*"[^"]*$/.test(n.quasis[i].value.raw)?'attr':/=\s*'[^']*$/.test(n.quasis[i].value.raw)?'attr1':/<[a-z][^>]*$/i.test(n.quasis[i].value.raw)?'tag':'text';
    out.push({line:e.loc.start.line+off-1,ctx:attr,expr:text(e).replace(/\s+/g,' ').slice(0,110),before})})});
const root=e=>{const m=e.match(/^[!(]*([A-Za-z_$][\w$]*)/);return m?m[1]:'?'};
if(process.argv.includes('--all')){out.forEach(o=>console.log(`${o.line}\t${o.ctx}\t${o.expr}`));}
const byRoot={};out.forEach(o=>{(byRoot[root(o.expr)]=byRoot[root(o.expr)]||[]).push(o)});
console.log(`${out.length} interpolations in HTML templates are not obviously safe (of ${walk&&0||''}), by first identifier:`);
Object.entries(byRoot).sort((a,b)=>b[1].length-a[1].length).slice(0,70).forEach(([k,v])=>console.log(String(v.length).padStart(4)+'  '+k+'   e.g. line '+v[0].line+': '+v[0].expr.slice(0,70)));
fs.writeFileSync(process.env.SCAN_OUT||'/dev/null',JSON.stringify(out,null,1));
