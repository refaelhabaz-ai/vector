/* A tiny stand-in for the parts of Supabase the site talks to (GoTrue auth + the consents table), served through Playwright's request interception.
   It lets the tests run the REAL supabase-js library from vendor/ against a fake server: no network, no account, no keys.
   Usage: const m=await installMock(context,{user:{...},down:false}); m.log = every request; m.consents = rows in the fake table; m.set({down:true}) to simulate an outage. */
const HOST='https://wgarkvjbwzmpdvvrsrni.supabase.co';
const b64u=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','access-control-expose-headers':'*'};
async function installMock(ctx,opt={}){
  const m={log:[],consents:[],opt:{down:false,hang:false,rateLimit:false,otp:'123456',consentsDown:false,user:{id:'11111111-2222-3333-4444-555555555555',email:'dana@example.com',full_name:'דנה כהן'},...opt},authorize:[],signedOut:0};
  m.set=o=>Object.assign(m.opt,o);
  m.session=()=>{const u=m.opt.user,now=Math.floor(Date.now()/1000);
    return {access_token:[b64u({alg:'HS256',typ:'JWT'}),b64u({sub:u.id,email:u.email,role:'authenticated',aud:'authenticated',exp:now+3600,iat:now}),'sig'].join('.'),token_type:'bearer',expires_in:3600,expires_at:now+3600,refresh_token:'rt-'+now,
      user:{id:u.id,aud:'authenticated',role:'authenticated',email:u.email,app_metadata:{provider:'google'},user_metadata:{full_name:u.full_name,name:u.full_name,email:u.email},created_at:new Date().toISOString()}}};
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
    if(p==='/rest/v1/consents'){
      if(m.opt.consentsDown)return json(500,{message:'boom'});
      if(method==='GET'){const v=url.searchParams.get('version'),want=v&&v.replace(/^eq\./,'');return json(200,m.consents.filter(r=>!want||r.version===want).map(r=>({kind:r.kind})))}
      if(method==='POST'){const rows=JSON.parse(req.postData()||'[]');for(const r of rows)if(!m.consents.some(x=>x.user_id===r.user_id&&x.kind===r.kind&&x.version===r.version))m.consents.push({...r,accepted_at:new Date().toISOString()});return route.fulfill({status:201,headers:CORS,body:''})}
    }
    return json(404,{message:'not mocked: '+p});
  });
  return m;
}
/* the site is served over http (like GitHub Pages), because the browser only checks SRI on a same-origin http(s) page, not on file:// */
function serve(){const http=require('http'),fs=require('fs'),path=require('path'),root=path.join(__dirname,'..','..');
  const T={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
  const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html');
    if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('nope')}r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)});
  return new Promise(res=>srv.listen(0,'127.0.0.1',()=>res({url:'http://127.0.0.1:'+srv.address().port+'/index.html',close:()=>new Promise(r=>srv.close(r))})))}
module.exports={installMock,serve,HOST};
