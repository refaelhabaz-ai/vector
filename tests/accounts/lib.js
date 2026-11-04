/* Shared helpers for the account tests: a served site, "devices" (separate browser contexts) that can share one fake server, and the Google round trip. */
const {chromium}=require('playwright');const {installMock,createBackend,serve}=require('./mock.js');
const USERS={dana:{id:'11111111-2222-3333-4444-555555555555',email:'dana@example.com',full_name:'דנה כהן'},omer:{id:'99999999-8888-7777-6666-444444444444',email:'omer@example.com',full_name:'עומר לוי'}};
async function start(){const web=await serve(),b=await chromium.launch();
  const T={web,b,URL:web.url,fails:0,ok:(c,m)=>{if(!c)T.fails++;console.log((c?'  ok   ':'  FAIL ')+m);return c},backend:createBackend()};
  /* a device: its own browser context (own storage), the same fake server */
  T.device=async(o={})=>{const ctx=o.ctx||await b.newContext({viewport:{width:1100,height:900},acceptDownloads:true}),mock=await installMock(ctx,{backend:o.backend||T.backend,user:USERS[o.user||'dana'],...(o.mock||{})}),p=await ctx.newPage();
    p.setDefaultTimeout(8000);p.errs=[];p.on('pageerror',e=>p.errs.push(String(e)));p.ctx=ctx;p.mock=mock;
    await p.goto(T.URL);await p.evaluate(s=>{localStorage.setItem('kivun3.seenProf','true');localStorage.setItem('kivun3.jnTip','1');if(s)localStorage.setItem('kivun3.prof',JSON.stringify({bag:'full',psy:'plan',heb:'he',sex:s}))},o.sex||'');
    if(o.seed)await p.evaluate(seed=>{for(const [k,v] of Object.entries(seed))localStorage.setItem('kivun3.'+k,JSON.stringify(v))},o.seed);
    await p.goto(T.URL+(o.hash||'#dir'));await p.reload();await p.waitForTimeout(500);return p};
  /* the whole Google round trip (the redirect to Google replaced by a direct return to the page) */
  T.login=async(p,hash)=>{await p.click('#acctBtn');await p.waitForSelector('#ov .authw');await p.check('#ov [data-aconsent]');await p.click('#gbtn');await p.waitForTimeout(500);
    await p.goto(T.URL+'?code=abc123'+(hash||''));await p.waitForTimeout(1500)};
  T.nick=async p=>{if(await p.$('#nickf')){await p.click('#nickf button[type=submit]');await p.waitForTimeout(250)}};
  T.close=async()=>{await b.close();await web.close();console.log(T.fails?`\n${T.fails} FAILED`:'\nall checks passed');process.exit(T.fails?1:0)};
  return T}
module.exports={start,USERS};
