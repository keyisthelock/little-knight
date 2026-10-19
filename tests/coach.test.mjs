import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {legalLine,explainMove,habits,recordAttempt,dueDrills} from '../src/coach.js';
import {parseGame,buildReview,addReview,EMPTY_PROFILE,validateProfile} from '../src/core.js';

test('teaching lines only show legal moves and stop at an illegal suffix',()=>{
 const line=legalLine(new Chess().fen(),'e2e4 e7e5 a1a8');assert.equal(line.length,2);assert.equal(line[1].san,'e5');
 assert.equal(new Chess(line[1].fen).get('e5').type,'p');
});
test('material explanation uses the actual opponent reply, not an invented tactical motif',()=>{
 const before='4k3/8/8/8/8/8/4q3/4R1K1 w - - 0 1';const game=new Chess(before);game.move('Rf1');
 const m={san:'Rf1',color:'w',loss:900,label:{kind:'blunder'},before:{fen:before,pv:'e1e2',mate:null,whiteScore:500},after:{fen:game.fen(),pv:'e2f1 g1f1',mate:null,whiteScore:-400}};
 const l=explainMove(m);assert.equal(l.topic,'calculation'); // Queen is recaptured; no net material-loss claim.
 m.after.pv='e2e1';const l2=explainMove(m);assert.notEqual(l2.topic,'safety'); // A quiet reply is not a capture.
 const c=new Chess('4k3/8/8/8/8/8/4q3/R5K1 w - - 0 1');const fen=c.fen();c.move('Ra2');
 const lost=explainMove({...m,san:'Ra2',before:{...m.before,fen,pv:'a1a8'},after:{...m.after,fen:c.fen(),pv:'e2a2'}});
 assert.equal(lost.topic,'safety');assert.match(lost.evidence,/rook/);
});
test('mate explanations respect the colour of the player',()=>{
 const parsed=parseGame('1. f3 e5 2. g4 Qh4#');
 const m={san:'g4',color:'w',loss:10000,label:{kind:'blunder'},before:{fen:parsed.fens[2],pv:'e2e4',whiteScore:0,mate:null},after:{fen:parsed.fens[3],pv:'d8h4',whiteScore:-10000,mate:1}};
 assert.equal(explainMove(m).topic,'mate');assert.match(explainMove(m).evidence,/Qh4#/);
 assert.notEqual(explainMove({...m,color:'b'}).topic,'mate');
});
test('habit evidence counts distinct games and requires three games for recurring status',()=>{
 const p={games:[{lessons:[{topic:'safety'},{topic:'safety'}]},{lessons:[{topic:'safety'}]}]};
 assert.equal(habits(p)[0].moments,3);assert.equal(habits(p)[0].recurring,false);
 p.games.push({lessons:[{topic:'safety'}]});assert.equal(habits(p)[0].recurring,true);
});
test('hinted answers are not mastered and successful recall schedules later practice',()=>{
 const now=Date.parse('2026-10-19T10:00:00Z'),d={id:'a',loss:200,solved:false};
 const guided=recordAttempt(d,true,{hinted:true,now});assert.equal(guided.solved,false);assert.equal(guided.successes,0);
 const success=recordAttempt(guided,true,{now});assert.equal(success.successes,1);assert.equal(success.solved,true);
 assert.equal(dueDrills({games:[],drills:[success]},now).length,0);
 assert.equal(dueDrills({games:[],drills:[success]},now+86400001).length,1);
});
test('personal game and coaching survive backup validation; re-review cannot inflate patterns',()=>{
 const parsed=parseGame('1. e4 e5'),scores=[{whiteScore:0,pv:'d2d4'},{whiteScore:-300,pv:'e7e5'},{whiteScore:-300,pv:'g1f3'}];
 const r=buildReview(parsed,scores,'w');let p=addReview({...structuredClone(EMPTY_PROFILE),currentPgn:parsed.pgn},parsed,r,'w');
 p=validateProfile(p);assert.equal(p.currentPgn,parsed.pgn);assert.equal(p.games[0].lessons.length,1);
 assert.equal(addReview(p,parsed,r,'w').games.length,1);
});
