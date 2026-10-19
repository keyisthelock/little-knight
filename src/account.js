const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null,enabled=location.protocol==='https:',onChange=()=>{};
export const currentUser=()=>user;
async function api(action,body){
  const response=await fetch('/api/auth/'+action,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({error:'Account service is temporarily unavailable.'}));
  if(!response.ok)throw new Error(data.error||'Account request failed.');return data;
}
export function mountAccount(open){
  const button=document.querySelector('#account');
  if(!button)return;
  button.textContent=user?'My account':'Sign in';
  button.onclick=open;
}
export async function initAccount(callback){
  onChange=callback;if(!enabled)return;
  try{const data=await api('me');if(data.user){user=data.user;onChange(user);}}catch{/* Guest mode remains usable if offline. */}
}
export function accountDialog(showDialog){
  if(user){
    showDialog(`<div class="dialog-heading"><h2>Your account</h2><button class="icon-button" data-close aria-label="Close">×</button></div><p>Signed in as <strong>${esc(user.email)}</strong></p><p>Your email and password hash are stored by this site on Cloudflare. Your chess journal stays in this browser, separated from the guest journal. Signing in on another device does not sync games.</p><p class="small-muted">Account beta: email ownership verification and password recovery are not available yet. Keep your password safe. Sessions expire after 24 hours.</p><p id="auth-error" role="alert"></p><button class="button secondary" id="logout">Sign out</button>`);
    document.querySelector('#logout').onclick=async e=>{e.target.disabled=true;try{await api('logout',{});user=null;document.querySelector('#modal').close();onChange(null);}catch(err){document.querySelector('#auth-error').textContent=err.message;e.target.disabled=false;}};
    return;
  }
  let mode='login';
  const draw=()=>{
    showDialog(`<div class="dialog-heading"><div><div class="eyebrow">YOUR CHESS CORNER</div><h2>${mode==='login'?'Welcome back.':'Meet your Little Knight.'}</h2></div><button class="icon-button" data-close aria-label="Close">×</button></div>${!enabled?'<p>Accounts are available on the HTTPS website. Offline play and your local journal work without signing in.</p>':`<form id="auth-form"><label class="field-label" for="auth-email">Email address</label><input class="auth-input" id="auth-email" name="email" type="email" autocomplete="email" maxlength="254" required><label class="field-label" for="auth-password">Password</label><input class="auth-input" id="auth-password" name="password" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" minlength="12" maxlength="128" required><p class="small-muted">12–128 characters. Account beta: no email verification or password recovery yet. Your games stay on this device; accounts do not sync them.</p><p class="error-text" id="auth-error" role="alert"></p><button class="button primary full" type="submit">${mode==='login'?'Sign in':'Create account'}</button></form><button class="text-button" id="auth-switch">${mode==='login'?'New here? Create an account':'Already have an account? Sign in'}</button>`}<p class="small-muted">You can always close this and continue as a guest.</p>`);
    if(!enabled)return;
    document.querySelector('#auth-switch').onclick=()=>{mode=mode==='login'?'register':'login';document.querySelector('#modal').close();draw();};
    document.querySelector('#auth-form').onsubmit=async e=>{
      e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
      document.querySelector('#auth-error').textContent='';
      try{
        const data=await api(mode,{email:document.querySelector('#auth-email').value,password:document.querySelector('#auth-password').value});
        document.querySelector('#auth-password').value='';user=data.user;document.querySelector('#modal').close();onChange(user);
      }catch(err){document.querySelector('#auth-error').textContent=err.message;button.disabled=false;}
    };
  };draw();
}
