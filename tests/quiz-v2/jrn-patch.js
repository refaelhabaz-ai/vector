/* The journey (docs/journey-plan.md) asks for the profile before the questionnaire. The questionnaire tests are about the questionnaire, so they start with that
   step already done: every browser context made through playwright's chromium.launch() gets localStorage "kivun3.jrn" = {p:<time>} before the page runs.
   Tests of the profile step itself (journey.js) do not require this file. */
const pw=require('playwright');
if(!pw.chromium.__jrn){
  pw.chromium.__jrn=1;const launch=pw.chromium.launch.bind(pw.chromium);
  const init=()=>{try{if(!localStorage.getItem('kivun3.jrn'))localStorage.setItem('kivun3.jrn',JSON.stringify({p:1}))}catch(e){}};
  pw.chromium.launch=async(...a)=>{const b=await launch(...a),nc=b.newContext.bind(b);
    b.newContext=async(...x)=>{const c=await nc(...x);await c.addInitScript(init);return c};
    b.newPage=async(o)=>{const c=await b.newContext(o);return c.newPage()};
    return b};
}
