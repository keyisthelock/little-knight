import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Chess } from 'chess.js';
import { Engine } from '../src/engine.js';

// Exercise the production UCI controller against the actual shipped engine.
// The adapter only replaces the browser transport with the engine's Node CLI.
class EngineWorker {
  constructor(source='') {
    const filename=source.includes('stockfish-full.js')?'stockfish-18-single.js':'stockfish-18-lite-single.js';
    this.child = spawn(process.execPath,[path.resolve('node_modules/stockfish/bin/'+filename)],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let buffered='';
    this.child.stdout.on('data',chunk=>{
      buffered+=chunk.toString();
      const lines=buffered.split(/\r?\n/);buffered=lines.pop();
      for(const data of lines)this.onmessage?.({data});
    });
    this.child.on('error',error=>this.onerror?.(error));
  }
  postMessage(command){this.child.stdin.write(command+'\n');}
  terminate(){this.child.kill();}
}

test('real Stockfish evaluates both sides, returns legal moves and restarts after stop',{timeout:45000},async()=>{
  globalThis.Worker=EngineWorker;
  const engine=new Engine();
  try {
    const game=new Chess();
    const white=await engine.evaluate(game.fen(),120);
    assert.ok(Number.isFinite(white.whiteScore));assert.ok(white.depth>0);
    game.move({from:white.bestMove.slice(0,2),to:white.bestMove.slice(2,4)});
    const black=await engine.evaluate(game.fen(),120,3);
    assert.ok(Number.isFinite(black.whiteScore));
    assert.doesNotThrow(()=>game.move({from:black.bestMove.slice(0,2),to:black.bestMove.slice(2,4)}));
    engine.reset();
    const restarted=await engine.evaluate(new Chess().fen(),120);
    assert.match(restarted.bestMove,/^[a-h][1-8][a-h][1-8][qrbn]?$/);
  } finally { engine.reset();delete globalThis.Worker; }
});

test('full-engine chunks reconstruct the exact engine, and analysis switches safely back to practice',{timeout:60000},async()=>{
 const manifest=JSON.parse(fs.readFileSync('dist/engine/full-v18/manifest.json','utf8'));
 const chunks=manifest.parts.map(name=>fs.readFileSync('dist/engine/full-v18/'+name));
 assert.ok(chunks.every(part=>part.length<=16*1024*1024));
 const bytes=Buffer.concat(chunks);
 assert.equal(bytes.length,manifest.bytes);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async url=>new Response(fs.readFileSync(path.resolve('dist',url)));
 globalThis.Worker=EngineWorker;
 const engine=new Engine();
 try{
  const full=await engine.evaluate(new Chess().fen(),120,20,null,'full');
  assert.ok(full.depth>0);assert.equal(engine.variant,'full');
  const lite=await engine.evaluate(new Chess().fen(),120,3,null,'lite');
  assert.ok(lite.depth>0);assert.equal(engine.variant,'lite');
 }finally{engine.reset();globalThis.fetch=originalFetch;delete globalThis.Worker;}
});

test('stopping during engine startup rejects promptly and allows a new worker',{timeout:45000},async()=>{
  globalThis.Worker=EngineWorker;
  const engine=new Engine();
  try {
    const first=engine.evaluate(new Chess().fen(),120);
    engine.reset();
    await assert.rejects(first,/stopped/);
    const second=await engine.evaluate(new Chess().fen(),120);
    assert.ok(second.depth>0);
  }finally{engine.reset();delete globalThis.Worker;}
});
