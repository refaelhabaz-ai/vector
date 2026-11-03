/* Loads the questionnaire engine out of index.html (the site is one file), so the tests run the very code that ships. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const HTML=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
const region=n=>{const a=HTML.indexOf(`/*@@${n}@@*/`),b=HTML.indexOf(`/*@@/${n}@@*/`);if(a<0||b<0)throw new Error('region not found: '+n);return HTML.slice(a,b)};
function load(extra){
  const ctx=vm.createContext({console,Math,JSON,Object,Array,Set,Map,Number,String,Date,Error,isFinite,parseFloat,parseInt});
  vm.runInContext(region('VQ-DATA')+'\n'+region('VQ-ENGINE')+'\nthis.VQ=VQ;this.VQE=VQE;',ctx,{filename:'index.html#quiz-v2'});
  if(extra)for(const n of extra)vm.runInContext(region(n)+'\n',ctx,{filename:'index.html#'+n});
  return ctx;
}
module.exports={load,region,HTML};
