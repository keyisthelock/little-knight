import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker from '../server/worker.js';

function environment(){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));
 const db={prepare(query){let args=[];return{bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async run(){return sql.prepare(query).run(...args);}};},async batch(statements){sql.exec('BEGIN');try{const results=await Promise.all(statements.map(s=>s.run()));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {AUTH_DB:db,ASSETS:{fetch:()=>new Response('asset')},sql};
}
function request(action,body,cookie='',origin='https://knight.example'){
 return new Request('https://knight.example/api/auth/'+action,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,'CF-Connecting-IP':'192.0.2.1',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
}
test('register, sign in, session expiry, sign out and secret storage work through the real handler',async()=>{
 const env=environment(),credentials={email:'test@example.invalid',password:'a test-only password 123!'};
 const created=await worker.fetch(request('register',credentials),env);assert.equal(created.status,200);
 const cookie=created.headers.get('Set-Cookie');assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/);
 const row=env.sql.prepare('SELECT * FROM users').get();assert.notEqual(row.password_hash,credentials.password);assert.equal(row.password_hash.length,64);
 assert.equal((await (await worker.fetch(request('me',null,cookie),env)).json()).user.email,credentials.email);
 assert.equal((await worker.fetch(request('login',{...credentials,password:'incorrect password'}),env)).status,401);
 const logged=await worker.fetch(request('login',credentials),env);assert.equal(logged.status,200);
 const token=logged.headers.get('Set-Cookie');assert.notEqual(token,cookie);
 await worker.fetch(request('logout',{},token),env);
 assert.equal((await (await worker.fetch(request('me',null,token),env)).json()).user,null);
 env.sql.prepare('UPDATE sessions SET expires_at=0').run();
 assert.equal((await (await worker.fetch(request('me',null,cookie),env)).json()).user,null);env.sql.close();
});
test('auth rejects cross-site requests, oversized bodies and repeated attempts',async()=>{
 const env=environment(),body={email:'absent@example.invalid',password:'wrong password 123!'};
 assert.equal((await worker.fetch(request('login',body,'','https://evil.invalid'),env)).status,403);
 assert.equal((await worker.fetch(request('register',{...body,extra:'a'.repeat(3000)}),env)).status,413);
 for(let i=0;i<10;i++)assert.equal((await worker.fetch(request('login',body),env)).status,401);
 assert.equal((await worker.fetch(request('login',body),env)).status,429);
 const response=await worker.fetch(request('me'),env);assert.equal(response.headers.get('Cache-Control'),'no-store');env.sql.close();
});
