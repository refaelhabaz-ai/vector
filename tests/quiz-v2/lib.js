/* Loads the questionnaire engine out of index.html (the site is one file), so the tests run the very code that ships. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const HTML=fs.readFileSync(process.env.VQ_HTML||path.join(__dirname,'..','..','index.html'),'utf8');
const region=n=>{const a=HTML.indexOf(`/*@@${n}@@*/`),b=HTML.indexOf(`/*@@/${n}@@*/`);if(a<0||b<0)throw new Error('region not found: '+n);return HTML.slice(a,b)};
function siteData(){const m=HTML.match(/const DATA = (\{[\s\S]*?\});\n/);return JSON.parse(m[1])}
function load(extra){
  const ctx=vm.createContext({console,Math,JSON,Object,Array,Set,Map,Number,String,Date,Error,isFinite,parseFloat,parseInt});
  vm.runInContext(region('VQ-DATA')+'\n'+region('VQ-GX')+'\n'+region('VQ-ENGINE')+'\nthis.VQ=VQ;this.VQE=VQE;this.VQX=VQX;',ctx,{filename:'index.html#quiz-v2'});
  if(extra&&extra.includes('VQ-RESULTS')){vm.runInContext(region('VQ-RESULTS')+'\nthis.VQR=VQR;',ctx,{filename:'index.html#VQ-RESULTS'});const D=siteData();ctx.__D={dirOcc:D.dir.occ,items:D.dir.items,oc:D.oc};vm.runInContext('VQR.setData(__D)',ctx)}
  return ctx;
}
module.exports={load,region,HTML};
