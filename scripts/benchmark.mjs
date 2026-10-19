import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Chess} from 'chess.js';
import {Engine} from '../src/engine.js';
import {uciMove} from '../src/core.js';

// This script lives in outputs/little-knight; deliver reports in outputs/benchmark.
const reportDir=path.resolve('../benchmark');
fs.mkdirSync(reportDir,{recursive:true});
const referencePath=path.resolve('node_modules/stockfish/bin/stockfish-18-single.js');
const litePath=path.resolve('node_modules/stockfish/bin/stockfish-18-lite-single.js');
class Transport {
  constructor(filename=litePath){
    this.child=spawn(process.execPath,[filename],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let buffered='';
    this.child.stdout.on('data',chunk=>{buffered+=chunk.toString();const lines=buffered.split(/\r?\n/);buffered=lines.pop();for(const data of lines)this.onmessage?.({data});});
    this.child.stderr.on('data',chunk=>fs.appendFileSync(path.join(reportDir,'engine-errors.log'),chunk));
    this.child.on('error',e=>this.onerror?.(e));
    this.child.on('exit',code=>{if(!this.stopped&&code!==0)this.onerror?.(new Error('Engine exited: '+code));});
  }
  postMessage(command){this.child.stdin.write(command+'\n');}
  terminate(){this.stopped=true;this.child.kill();}
}
globalThis.Worker=class extends Transport {constructor(){super(litePath);}};
const bot=new Engine();
class Reference {
  constructor(){this.transport=new Transport(referencePath);this.waiter=null;this.transport.onmessage=({data})=>{this.waiter?.(data);};this.transport.onerror=e=>this.reject?.(e);}
  wait(command,predicate,timeout=30000){return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{this.waiter=null;reject(new Error('Reference engine timed out'));},timeout);
    this.reject=reject;
    this.waiter=line=>{if(predicate(line)){clearTimeout(timer);this.waiter=null;resolve(line);}};
    this.transport.postMessage(command);
  });}
  async init(){await this.wait('uci',line=>line==='uciok');this.send('setoption name Threads value 1');this.send('setoption name Hash value 32');await this.wait('isready',line=>line==='readyok');}
  send(command){this.transport.postMessage(command);}
  async move(position,elo){this.send('setoption name Skill Level value 20');this.send('setoption name UCI_LimitStrength value true');this.send('setoption name UCI_Elo value '+elo);this.send(position);return(await this.wait('go movetime 200',line=>line.startsWith('bestmove '))).split(' ')[1];}
  close(){this.transport.terminate();}
}
const reference=new Reference();
const openings=[
 ['Open game','e4','e5','Nf3','Nc6'],['Queen pawn','d4','d5','c4','e6'],
 ['English','c4','e5','Nc3','Nf6'],['Reti','Nf3','d5','g3','Nf6'],
 ['Sicilian','e4','c5','Nf3','d6'],['French','e4','e6','d4','d5'],
 ['Caro-Kann','e4','c6','d4','d5'],['Indian','d4','Nf6','c4','g6']
];
const records=[];
const pgns=[];
const started=new Date().toISOString();
const config={bot:'Stockfish 18 Lite WASM, stockfish npm 18.0.8',skill:3,movetimeMs:200,hashMB:32,threads:1,reference:'Stockfish 18 full single-thread WASM, same npm release',referencePresets:[1400,1700,2000],plannedGames:48,openingPairs:8,maxPlies:300,unfinishedPolicy:'exclude from rating fit',drawPolicy:'chess.js legal game termination, including claimable threefold/fifty-move draws',transport:'Node CLI for exact shipped WASM and production src/engine.js UCI controller; browser scheduling is not reproduced',cpu:os.cpus()[0].model,totalRAMGB:Math.round(os.totalmem()/1073741824)};

function fit(data){
 const valid=data.filter(g=>g.score!==null);
 if(!valid.length)return null;
 const p=(r,e)=>1/(1+10**((e-r)/400));
 const loglike=r=>valid.reduce((s,g)=>{const q=p(r,g.referenceElo);return s+g.score*Math.log(q)+(1-g.score)*Math.log(1-q);},0);
 let lo=-1000,hi=4000;
 for(let i=0;i<100;i++){const mid=(lo+hi)/2;const residual=valid.reduce((s,g)=>s+g.score-p(mid,g.referenceElo),0);if(residual>0)lo=mid;else hi=mid;}
 const estimate=(lo+hi)/2,peak=loglike(estimate);
 let lower=estimate,upper=estimate;
 while(lower>-1000&&2*(peak-loglike(lower))<3.841459)lower-=1;
 while(upper<4000&&2*(peak-loglike(upper))<3.841459)upper+=1;
 return {referenceRelativeElo:Math.round(estimate),approximate95LikelihoodInterval:[Math.round(lower),Math.round(upper)],assumption:'Independent fractional-score Bernoulli games and exact reference ratings; excludes reference calibration error and opening-pair correlation',completed:valid.length};
}
function persist(status){
 const summary={started,updated:new Date().toISOString(),status,config,completed:records.length,groups:config.referencePresets.map(elo=>{
   const all=records.filter(g=>g.referenceElo===elo),games=all.filter(g=>g.score!==null);
   return {referenceElo:elo,attempted:all.length,completed:games.length,wins:games.filter(g=>g.score===1).length,draws:games.filter(g=>g.score===.5).length,losses:games.filter(g=>g.score===0).length,unfinished:all.length-games.length,score:games.reduce((s,g)=>s+g.score,0)};
 }),fit:fit(records),games:records};
 const temp=path.join(reportDir,'results.tmp.json');fs.writeFileSync(temp,JSON.stringify(summary,null,2));fs.renameSync(temp,path.join(reportDir,'results.json'));
 fs.writeFileSync(path.join(reportDir,'games.pgn'),pgns.join('\n\n'));
 return summary;
}
process.on('SIGINT',()=>{persist('interrupted');bot.reset();reference.close();process.exit(130);});
try{
 await bot.init();await reference.init();
 persist('running');console.log('Benchmark started: 48 games, exact skill-3 bot, 200 ms/move; one active engine at a time.');
 for(let openingIndex=0;openingIndex<openings.length;openingIndex++){
  for(const elo of config.referencePresets){for(const color of ['w','b']){
   const startedGame=Date.now(),game=new Chess(),[name,...moves]=openings[openingIndex];
   for(const move of moves)game.move(move);
   game.setHeader('Event','Little Knight preliminary strength benchmark');game.setHeader('White',color==='w'?'Little Knight skill 3':'Stockfish nominal '+elo);game.setHeader('Black',color==='b'?'Little Knight skill 3':'Stockfish nominal '+elo);game.setHeader('TimeControl','200ms per move');game.setHeader('Opening',name);
   bot.send('ucinewgame');bot.send('setoption name Clear Hash');reference.send('ucinewgame');reference.send('setoption name Clear Hash');
   let measuredPlies=0,reason=null,error=null;const timings={bot:[],reference:[]};
   while(!game.isGameOver()&&game.history().length<config.maxPlies){
    if(Date.now()-startedGame>180000){reason='time cap, unfinished';break;}
    const history=game.history({verbose:true});const position='position startpos moves '+history.map(m=>m.from+m.to+(m.promotion||'')).join(' ');
    const own=game.turn()===color,t0=performance.now();
    try{
     const move=own?(await bot.evaluate(game.fen(),200,3,position)).bestMove:await reference.move(position,elo);
     timings[own?'bot':'reference'].push(performance.now()-t0);
     game.move(uciMove(move));measuredPlies++;
    }catch(e){error=e.message;reason='engine error, excluded';break;}
   }
   let score=null,result='*';
   if(game.isCheckmate()){const winner=game.turn()==='w'?'b':'w';score=winner===color?1:0;result=winner==='w'?'1-0':'0-1';reason='checkmate';}
   else if(game.isDraw()){score=.5;result='1/2-1/2';reason=game.isThreefoldRepetition()?'threefold repetition':game.isStalemate()?'stalemate':game.isInsufficientMaterial()?'insufficient material':'fifty-move rule';}
   else if(!reason)reason='ply cap, unfinished';
   game.setHeader('Result',result);game.setHeader('Termination',reason);pgns.push(game.pgn());
   records.push({number:records.length+1,opening:name,pair:openingIndex,referenceElo:elo,botColor:color,result,score,reason,error,plies:game.history().length,measuredPlies,seconds:Math.round((Date.now()-startedGame)/100)/10,averageBotMoveMs:Math.round(timings.bot.reduce((a,b)=>a+b,0)/Math.max(1,timings.bot.length)),averageReferenceMoveMs:Math.round(timings.reference.reduce((a,b)=>a+b,0)/Math.max(1,timings.reference.length))});
   persist('running');console.log(JSON.stringify(records.at(-1)));
   if(error)throw new Error(error);
   await new Promise(r=>setTimeout(r,250));
  }}
 }
 const summary=persist('complete');console.log('COMPLETE '+JSON.stringify(summary.fit));
}catch(e){persist('failed');console.error(e);process.exitCode=1;}
finally{bot.reset();reference.close();}
