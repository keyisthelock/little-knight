import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const origin='https://little-knight-chess.pages.dev';
const email=`qa-${crypto.randomUUID()}@example.invalid`,password=crypto.randomBytes(24).toString('base64url');
let cookie='';
async function call(action,body){
 const response=await fetch(origin+'/api/auth/'+action,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();return {response,data};
}
const initial=await call('me');assert.equal(initial.response.status,200);assert.equal(initial.data.user,null);
const created=await call('register',{email,password});assert.equal(created.response.status,200,created.data.error);
cookie=created.response.headers.get('Set-Cookie').split(';')[0];assert.equal((await call('me')).data.user.email,email);
assert.equal((await call('login',{email,password:'incorrect password 123'})).response.status,401);
const login=await call('login',{email,password});assert.equal(login.response.status,200,login.data.error);
cookie=login.response.headers.get('Set-Cookie').split(';')[0];
assert.equal((await call('logout',{})).response.status,200);assert.equal((await call('me')).data.user,null);
console.log('Live auth passed: guest, registration, authenticated session, wrong password, sign-in, sign-out. One randomly named QA account remains; no email was sent.');
