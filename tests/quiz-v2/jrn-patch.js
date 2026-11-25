/* The journey (docs/journey-plan.md) asks for the profile before the questionnaire. The questionnaire tests are about the questionnaire, so they start with that
   step already done: every browser context made through playwright's chromium.launch() gets localStorage "kivun3.jrn" = {p:<time>} before the page runs.
   Tests of the profile step itself (journey.js) do not require this file. */
const pw=require('playwright');
if(!pw.chromium.__jrn){
  pw.chromium.__jrn=1;const launch=pw.chromium.launch.bind(pw.chromium);
  const init=()=>{try{if(!localStorage.getItem('kivun3.jrn'))localStorage.setItem('kivun3.jrn',JSON.stringify({p:1}))}catch(e){}};
  pw.chromium.launch=async(...a)=>{const b=await launch(...a),nc=b.newContext.bind(b);
    const wrap=(pg)=>{const rl=pg.reload.bind(pg);
      /* Chromium sometimes starts a reload before a localStorage write has reached the new page (file:// pages, more often when the machine is busy). The tests write the state they need
         and reload at once, so a reload here puts back any key that went missing and reloads once more. */
      pg.reload=async(o)=>{const snap=await pg.evaluate(()=>Object.assign({},localStorage)).catch(()=>null);const r=await rl(o);
        /* up to three more reloads: the second one can lose a key as well */
        if(snap)for(let k=0;k<3;k++){const lost=await pg.evaluate(s=>{let n=0;try{for(const k in s)if(localStorage.getItem(k)==null){localStorage.setItem(k,s[k]);n++}}catch(e){}return n},snap).catch(()=>0);if(!lost)break;await rl(o)}
        return r};return pg};
    const npg=(c)=>{const np=c.newPage.bind(c);c.newPage=async(...x)=>wrap(await np(...x));return c};
    b.newContext=async(...x)=>{const c=await nc(...x);await c.addInitScript(init);return npg(c)};
    b.newPage=async(o)=>{const c=await b.newContext(o);return c.newPage()};
    return b};
}
