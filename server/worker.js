const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.match(/../g)||[],b=>parseInt(b,16));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const COOKIE='__Host-knight_session';
const EXPIRES=86400;
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
export async function digest(text){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));}
// Cloudflare Web Crypto supports a maximum of 100,000 PBKDF2 iterations.
// Authentication is beta: no email verification or recovery mail is configured yet.
export async function passwordHash(password,salt){
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unhex(salt),iterations:100000,hash:'SHA-256'},key,256));
}
function equal(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function cookie(token,maxAge=EXPIRES){return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;}
function tokenFrom(request){return (request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
async function limit(db,key,max,now,window=900){
  const row=await db.prepare('INSERT INTO auth_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count').bind(key,now+window,now,now).first();
  return row.count<=max;
}
async function sessionUser(request,db,now){
  const token=tokenFrom(request);if(!/^[a-f0-9]{64}$/.test(token))return null;
  return db.prepare('SELECT users.id,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').bind(await digest(token),now).first();
}
export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(!env.AUTH_DB)return json({error:'Account service is not configured. You can continue as a guest.'},503);
  const now=Math.floor(Date.now()/1000),db=env.AUTH_DB;
  try{
    if(url.pathname==='/api/auth/me'&&request.method==='GET')return json({user:await sessionUser(request,db,now)});
    if(request.method!=='POST')return json({error:'Not found.'},404);
    if(request.headers.get('Origin')!==url.origin)return json({error:'Request origin not allowed.'},403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON is required.'},415);
    const action=url.pathname.split('/').at(-1);
    if(!['register','login','logout'].includes(action))return json({error:'Not found.'},404);
    if(action==='logout'){
      await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(tokenFrom(request))).run();
      return json({user:null},200,{'Set-Cookie':cookie('',0)});
    }
    const ip=request.headers.get('CF-Connecting-IP')||'unknown';
    if(!await limit(db,'ip:'+await digest(ip),30,now))return json({error:'Too many attempts. Please wait 15 minutes.'},429,{'Retry-After':'900'});
    if(Number(request.headers.get('Content-Length'))>2048)return json({error:'Request too large.'},413);
    const reader=request.body?.getReader();let size=0,chunks=[];
    if(!reader)return json({error:'Missing request.'},400);
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return json({error:'Request too large.'},413);}chunks.push(value);}
    const body=JSON.parse(await new Blob(chunks).text());
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    const password=body.password;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128)return json({error:'Use a valid email and a password of 12–128 characters.'},400);
    if(!await limit(db,'email:'+await digest(email),10,now))return json({error:'Too many attempts. Please wait 15 minutes.'},429,{'Retry-After':'900'});
    let user=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if(action==='register'){
      if(!await limit(db,'signup:'+await digest(ip),10,now,86400))return json({error:'Account creation limit reached. Try again tomorrow.'},429);
      // Always derive a hash, including when the email already exists.
      const salt=random(),hash=await passwordHash(password,salt);
      if(user)return json({error:'Unable to create that account. Try signing in instead.'},400);
      const id=crypto.randomUUID();
      try{await db.prepare('INSERT INTO users (id,email,salt,password_hash,created_at) VALUES (?,?,?,?,?)').bind(id,email,salt,hash,now).run();}
      catch{return json({error:'Unable to create that account. Try signing in instead.'},400);}
      user={id,email};
    }else{
      const hash=await passwordHash(password,user?.salt||'00'.repeat(32));
      if(!user||!equal(hash,user.password_hash))return json({error:'Email or password is incorrect.'},401);
    }
    const token=random(),oldToken=tokenFrom(request);
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE expires_at<=? OR token_hash=?').bind(now,await digest(oldToken)),
      db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token),user.id,now+EXPIRES),
      db.prepare('DELETE FROM auth_limits WHERE expires_at<=?').bind(now)
    ]);
    return json({user:{id:user.id,email:user.email}},200,{'Set-Cookie':cookie(token)});
  }catch{return json({error:'Account service could not complete the request. Please try again.'},500);}
}};
