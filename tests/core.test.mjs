import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { parseGame, SAMPLE_PGN, buildReview, reviewSummary, addReview, EMPTY_PROFILE, validateProfile, sanLine } from '../src/core.js';

test('PGN import preserves legal positions and handles black to move custom starts',()=>{
 const parsed=parseGame(SAMPLE_PGN);assert.equal(parsed.moves.length,14);assert.equal(parsed.fens.length,15);
 assert.equal(new Chess(parsed.fens.at(-1)).isCheckmate(),true);
 const custom=parseGame('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/4K3 b - - 0 1"]\n\n1... Kd7 2. Kd2');
 assert.equal(custom.moves[0].color,'b');assert.equal(custom.fens[0].split(' ')[1],'b');
});
test('PGN rejects invalid, empty and oversized input',()=>{
 assert.throws(()=>parseGame('1. e5'));assert.throws(()=>parseGame(''));assert.throws(()=>parseGame('a'.repeat(250001)));
});
test('review evaluation loss uses the mover’s perspective for both colours',()=>{
 const parsed=parseGame('1. e4 e5');
 const review=buildReview(parsed,[{whiteScore:20,pv:'d2d4 d7d5',fen:parsed.fens[0]},{whiteScore:-180,pv:'b8c6',fen:parsed.fens[1]},{whiteScore:120,pv:'g1f3',fen:parsed.fens[2]}],'b');
 assert.equal(review[0].loss,200);assert.equal(review[1].loss,300);assert.equal(review[1].isPlayer,true);assert.equal(review[1].label.kind,'blunder');
});
test('best continuation renders legal SAN and stops at illegal suffixes',()=>{
 assert.equal(sanLine(new Chess().fen(),'e2e4 e7e5 a1a8'),'e4 e5');
});
test('local memory deduplicates reviews and saves playable retry positions',()=>{
 const parsed=parseGame('1. e4 e5');
 const scores=[{whiteScore:30,pv:'d2d4',fen:parsed.fens[0]},{whiteScore:-200,pv:'b8c6',fen:parsed.fens[1]},{whiteScore:0,pv:'g1f3',fen:parsed.fens[2]}];
 const r=buildReview(parsed,scores,'w');const p=addReview(structuredClone(EMPTY_PROFILE),parsed,r,'w');
 assert.equal(p.games.length,1);assert.equal(p.drills.length,1);assert.equal(new Chess(p.drills[0].fen).move({from:'d2',to:'d4'}).san,'d4');
 assert.equal(addReview(p,parsed,r,'w').games.length,1);assert.equal(addReview(p,parsed,r,'w').drills.length,1);
});
test('rating heuristic abstains without enough non-opening moves',()=>{
 assert.equal(reviewSummary([]).guess,null);
});
test('backup restores safe settings and rejects malformed training positions',()=>{
 const p=structuredClone(EMPTY_PROFILE);p.settings.budget=999999;p.settings.name='A'.repeat(100);const safe=validateProfile(p);
 assert.equal(safe.settings.budget,1000);assert.equal(safe.settings.name.length,30);
 p.drills=[{fen:'invalid',bestUci:'a1a2'}];assert.throws(()=>validateProfile(p));
});
