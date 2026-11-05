import test from 'node:test';import assert from 'node:assert/strict';import {Chess} from 'chess.js';import {Engine} from '../src/engine.js';
test('late messages and errors from a terminated worker cannot affect its replacement',async()=>{
 const created=[];class Worker{constructor(){created.push(this);}postMessage(c){if(c==='uci')queueMicrotask(()=>this.onmessage?.({data:'uciok'}));if(c==='isready')queueMicrotask(()=>this.onmessage?.({data:'readyok'}));}terminate(){}}
 globalThis.Worker=Worker;const e=new Engine();
 try{await e.init();const old=created[0];e.reset();const promise=e.evaluate(new Chess().fen(),300);await new Promise(r=>setImmediate(r));const fresh=created[1];assert.ok(e.pending);
 old.onmessage({data:'info depth 20 score cp 999 pv a2a3'});old.onmessage({data:'bestmove a2a3'});old.onerror();assert.equal(e.worker,fresh);assert.ok(e.pending);
 fresh.onmessage({data:'info depth 12 score cp 33 pv e2e4'});fresh.onmessage({data:'bestmove e2e4'});const result=await promise;assert.equal(result.whiteScore,33);assert.equal(result.bestMove,'e2e4');
 }finally{e.reset();delete globalThis.Worker;}
});
