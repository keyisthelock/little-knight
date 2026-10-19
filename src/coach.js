import { Chess } from 'chess.js';

const names={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
const values={p:1,n:3,b:3,r:5,q:9,k:0};
export const TOPICS={
  safety:{title:'Piece safety',habit:'Before moving, check what your opponent can capture.',question:'After your move, what can your opponent capture?',task:'Scan every attacked piece before your next five moves.'},
  mate:{title:'King safety',habit:'Look for your opponent’s checks before choosing your move.',question:'Which checks does your opponent have after this move?',task:'For five moves, name your opponent’s checks before moving.'},
  missedMate:{title:'Finishing an attack',habit:'When attacking, calculate forcing checks first.',question:'Can you find a forcing check that keeps the attack going?',task:'Solve two attacking positions, starting with checks.'},
  opportunity:{title:'Forcing moves',habit:'Look at checks, captures and threats before quiet moves.',question:'What forcing move would you consider before playing this?',task:'List one check or capture before your next five moves.'},
  calculation:{title:'Calculating replies',habit:'For each candidate move, find your opponent’s strongest reply.',question:'What would your opponent play against your first choice?',task:'Calculate one reply to each candidate in your next five moves.'}
};
function moveUci(game,uci){return game.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci[4]?{promotion:uci[4]}:{})});}
export function legalLine(fen,pv='',limit=6){
  const game=new Chess(fen),line=[];
  for(const uci of pv.split(/\s+/).slice(0,limit)){
    if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))break;
    try {const move=moveUci(game,uci);line.push({san:move.san,fen:game.fen(),from:move.from,to:move.to,captured:move.captured,color:move.color});}catch{break;}
  }
  return line;
}
export function explainMove(m){
  const board=new Chess(m.before.fen||m.beforeFen||m.before), afterFen=m.after.fen||m.afterFen;
  const better=legalLine(board.fen(),m.before.pv), reply=afterFen?legalLine(afterFen,m.after.pv):[];
  const best=better[0], response=reply[0];
  let topic='calculation', evidence='The engine prefers a different continuation at this search budget.';
  const mateFor=(s,color)=>s.mate!==null&&s.mate!==undefined&&Math.abs(s.whiteScore)>=9000&&((s.whiteScore>0)===(color==='w'));
  if(m.loss>=100 && mateFor(m.after,m.color==='w'?'b':'w')){
    topic='mate'; evidence=response?`After ${m.san}, the engine starts with ${response.san} and finds a forced mate against your king.`:`After ${m.san}, your king is checkmated.`;
  }else if(m.loss>=100 && mateFor(m.before,m.color)&&!mateFor(m.after,m.color)){
    topic='missedMate'; evidence=best?`${best.san} keeps a forced mating line in this search. The search after ${m.san} no longer finds that mate.`:'The search before your move found a forced mate that was lost afterwards.';
  }else if(m.loss>=100 && response?.captured){
    let balance=0;
    for(const r of reply)balance+=(r.color===m.color?1:-1)*(values[r.captured]||0);
    if(balance<0){topic='safety';evidence=`After ${m.san}, ${response.san} captures a ${names[response.captured]}. In the displayed line, you lose about ${Math.abs(balance)} ${Math.abs(balance)===1?'point':'points'} of material net.`;}
    else evidence=`After ${m.san}, the engine replies ${response.san}. Follow the exchanges before deciding whether the capture is safe.`;
  }else if(m.loss>=100&&best&&(best.captured||best.san.includes('+')||best.san.includes('#'))){
    topic='opportunity';evidence=`Consider ${best.san}: ${best.captured?`it captures a ${names[best.captured]}`:'it gives check'}. Compare the reply with the line after ${m.san}.`;
  }else if(m.loss<100){evidence=m.label.kind==='best'?`${m.san} matches the engine’s first choice in this search.`:`${m.san} keeps the evaluation close to the engine’s first choice.`;}
  return {topic,...TOPICS[topic],evidence,best:best?.san||'',better,reply,
    takeaway:m.loss<100?'Keep checking your opponent’s strongest reply, even after a good move.':TOPICS[topic].habit,
    caveat:'Short engine search; the lines show evidence, not a proof that every other move loses.'};
}
export function habits(profile){
  const games=profile.games.filter(g=>Array.isArray(g.lessons)).slice(0,20),counts={};
  for(const g of games)for(const topic of Object.keys(TOPICS)){
    const n=g.lessons.filter(l=>l.topic===topic).length;
    if(n){counts[topic]??={topic,games:0,moments:0};counts[topic].games++;counts[topic].moments+=n;}
  }
  return Object.values(counts).sort((a,b)=>b.games-a.games||b.moments-a.moments).map(h=>({...h,...TOPICS[h.topic],recurring:h.games>=3,sample:games.length}));
}
export function recordAttempt(drill,correct,{hinted=false,now=Date.now()}={}){
  const successes=(drill.successes||0)+(correct&&!hinted?1:0);
  return {...drill,attempts:(drill.attempts||0)+1,successes,hints:(drill.hints||0)+(hinted?1:0),
    solved:correct&&!hinted?true:!!drill.solved,lastAttempt:new Date(now).toISOString(),
    due:new Date(now+(correct&&!hinted?Math.min(14,2**Math.min(successes-1,4))*86400000:600000)).toISOString()};
}
export function dueDrills(profile,now=Date.now()){
  const focus=habits(profile)[0]?.topic;
  return profile.drills.filter(d=>!d.due?!d.solved:Date.parse(d.due)<=now)
    .sort((a,b)=>Number(b.topic===focus)-Number(a.topic===focus)||(a.attempts||0)-(b.attempts||0)||b.loss-a.loss);
}
