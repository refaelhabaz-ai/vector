/* A tiny stand-in for the parts of Supabase the site talks to (GoTrue auth + the consents table), served through Playwright's request interception.
   It lets the tests run the REAL supabase-js library from vendor/ against a fake server: no network, no account, no keys.
   Usage: const m=await installMock(context,{user:{...},down:false}); m.log = every request; m.consents = rows in the fake table; m.set({down:true}) to simulate an outage. */
const HOST='https://wgarkvjbwzmpdvvrsrni.supabase.co';
const b64u=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','access-control-expose-headers':'*'};
/* the "server": data per user, shared by every browser context that is given the same backend (= two devices of the same account) */
function createBackend(){
  const be={users:{},last:0,fail:null,log:[]};
  be.now=()=>{be.last=Math.max(Date.now(),be.last+1);return new Date(be.last).toISOString()};
  be.u=id=>be.users[id]||(be.users[id]={data:{},profile:null,consents:[],quiz:{sessions:{},answers:{},results:{}}});
  return be;
}
const LOCAL_ONLY=['inc','first','svc','res','resAt'],KEYS=['prof','scores','dir','dir2','path','list','calcRows','calcAr','uni','sch'];
async function installMock(ctx,opt={}){
  const be=opt.backend||createBackend();
  const m={backend:be,log:[],opt:{down:false,hang:false,rateLimit:false,otp:'123456',consentsDown:false,dataDown:false,user:{id:'11111111-2222-3333-4444-555555555555',email:'dana@example.com',full_name:'דנה כהן'},...opt},authorize:[],signedOut:0};
  delete m.opt.backend;
  m.set=o=>Object.assign(m.opt,o);
  Object.defineProperty(m,'consents',{get:()=>be.u(m.opt.user.id).consents,set:v=>{be.u(m.opt.user.id).consents=v}});
  Object.defineProperty(m,'data',{get:()=>be.u(m.opt.user.id).data});
  m.session=()=>{const u=m.opt.user,now=Math.floor(Date.now()/1000);
    return {access_token:[b64u({alg:'HS256',typ:'JWT'}),b64u({sub:u.id,email:u.email,role:'authenticated',aud:'authenticated',exp:now+3600,iat:now}),'sig'].join('.'),token_type:'bearer',expires_in:3600,expires_at:now+3600,refresh_token:'rt-'+now,
      user:{id:u.id,aud:'authenticated',role:'authenticated',email:u.email,app_metadata:{provider:'google'},user_metadata:{full_name:u.full_name,name:u.full_name,email:u.email},created_at:new Date().toISOString()}}};
  const uidOf=req=>{try{const t=(req.headers()['authorization']||'').replace(/^Bearer /,'').split('.')[1];return JSON.parse(Buffer.from(t,'base64url').toString()).sub}catch(e){return null}};
  await ctx.route(HOST+'/**',async route=>{
    const req=route.request(),url=new URL(req.url()),p=url.pathname,method=req.method();
    const json=(status,body,extra={})=>route.fulfill({status,headers:{...CORS,'content-type':'application/json',...extra},body:body===undefined?'':JSON.stringify(body)});
    if(method==='OPTIONS')return route.fulfill({status:204,headers:CORS});
    m.log.push({method,path:p,search:url.search,body:req.postData()||''});
    if(m.opt.hang)return;                                   /* never answers (the site must not wait for it) */
    if(m.opt.down)return route.abort('failed');            /* no connection */
    if(p==='/auth/v1/settings')return json(200,{external:{google:m.opt.googleOff?false:true,email:true},disable_signup:false});
    if(p==='/auth/v1/authorize'){m.authorize.push(Object.fromEntries(url.searchParams));return route.fulfill({status:200,headers:{'content-type':'text/html'},body:'<html><body>google</body></html>'})}
    if(p==='/auth/v1/token')return json(200,m.session());
    if(p==='/auth/v1/user')return json(200,m.session().user);
    if(p==='/auth/v1/logout'){m.signedOut++;return route.fulfill({status:204,headers:CORS})}
    if(p==='/auth/v1/otp'){return m.opt.rateLimit?json(429,{code:'over_email_send_rate_limit',message:'rate limit'}):json(200,{})}
    if(p==='/auth/v1/verify'){const b=JSON.parse(req.postData()||'{}');return b.token===m.opt.otp?json(200,m.session()):json(403,{code:'otp_expired',message:'Token has expired or is invalid'})}
    const uid=uidOf(req);
    if(p.startsWith('/rest/v1/')){
      if(!uid)return json(401,{code:'PGRST301',message:'JWT'});
      if(be.fail&&be.fail(p,method))return json(500,{message:'boom'});
      const U=be.u(uid),tbl=p.slice('/rest/v1/'.length),q=url.searchParams;
      if(tbl==='consents'){
        if(m.opt.consentsDown)return json(500,{message:'boom'});
        if(method==='GET'){const v=(q.get('version')||'').replace(/^eq\./,'');return json(200,U.consents.filter(r=>!v||r.version===v).map(r=>({kind:r.kind})))}
        if(method==='POST'){const rows=JSON.parse(req.postData()||'[]');for(const r of rows){if(r.user_id!==uid)return json(403,{code:'42501',message:'rls'});if(!U.consents.some(x=>x.kind===r.kind&&x.version===r.version))U.consents.push({...r,accepted_at:be.now()})}return route.fulfill({status:201,headers:CORS,body:''})}
      }
      if(tbl==='user_data'){
        if(m.opt.dataDown)return json(503,{message:'down'});
        if(method==='GET')return json(200,Object.entries(U.data).map(([key,r])=>({key,value:r.value,updated_at:r.updated_at})));
        if(method==='POST'){const rows=JSON.parse(req.postData()||'[]'),out=[];
          for(const r of rows){if(r.user_id!==uid)return json(403,{code:'42501',message:'rls'});
            if(!KEYS.includes(r.key))return json(400,{code:'23514',message:'user_data_key_ok'});
            if(r.key==='prof'&&r.value&&LOCAL_ONLY.some(f=>f in r.value))return json(400,{code:'23514',message:'user_data_prof_local_only'});
            if(JSON.stringify(r.value).length>262144)return json(400,{code:'23514',message:'size'});
            U.data[r.key]={value:r.value,updated_at:be.now()};out.push({key:r.key,updated_at:U.data[r.key].updated_at})}
          return json(201,out)}
        if(method==='DELETE'){const ks=(q.get('key')||'').replace(/^in\.\(|\)$/g,'').split(',');ks.forEach(k=>{delete U.data[k]});return route.fulfill({status:204,headers:CORS})}
      }
      if(tbl==='profiles'&&method==='POST'){const r=JSON.parse(req.postData()||'{}');if(r.user_id!==uid)return json(403,{code:'42501',message:'rls'});U.profile={...r,updated_at:be.now()};return route.fulfill({status:201,headers:CORS,body:''})}
    }
    return json(404,{message:'not mocked: '+method+' '+p});
  });
  return m;
}
/* the site is served over http (like GitHub Pages), because the browser only checks SRI on a same-origin http(s) page, not on file:// */
function serve(){const http=require('http'),fs=require('fs'),path=require('path'),root=path.join(__dirname,'..','..');
  const T={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
  const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html');
    if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('nope')}r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)});
  return new Promise(res=>srv.listen(0,'127.0.0.1',()=>res({url:'http://127.0.0.1:'+srv.address().port+'/index.html',close:()=>new Promise(r=>srv.close(r))})))}
module.exports={installMock,createBackend,serve,HOST};
