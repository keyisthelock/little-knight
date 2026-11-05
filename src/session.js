import {Chess} from 'chess.js';
export class GameSession {
  constructor({mode='computer',fen}={}) {this.mode=mode==='local'?'local':'computer';this.game=new Chess(fen);this.result=null;this.revision=0;this.counted=false;this.refresh();}
  repetitions(){const history=this.game.history({verbose:true});const fens=[history[0]?.before||this.game.fen(),...history.map(m=>m.after)];const key=fen=>fen.split(' ').slice(0,4).join(' ');return fens.filter(f=>key(f)===key(this.game.fen())).length;}
  claimable(){if(this.result)return null;if(this.repetitions()>=3)return 'Threefold repetition';if(Number(this.game.fen().split(' ')[4])>=100)return '50-move rule';return null;}
  refresh(){
    if(this.result)return this.result;
    const g=this.game;
    if(g.isCheckmate())this.result={score:g.turn()==='w'?'0-1':'1-0',reason:'Checkmate'};
    else if(g.isStalemate())this.result={score:'1/2-1/2',reason:'Stalemate'};
    else if(g.isInsufficientMaterial())this.result={score:'1/2-1/2',reason:'Insufficient material'};
    else if(this.repetitions()>=5)this.result={score:'1/2-1/2',reason:'Fivefold repetition'};
    else if(Number(g.fen().split(' ')[4])>=150)this.result={score:'1/2-1/2',reason:'75-move rule'};
    if(this.result)g.setHeader('Result',this.result.score);
    return this.result;
  }
  move(move){if(this.result)throw new Error('This game is finished. Start a new game.');const m=this.game.move(move);this.revision++;this.refresh();return m;}
  undo(pair=false){this.result=null;this.game.setHeader('Result','*');const first=this.game.undo();if(first&&pair)this.game.undo();this.revision++;this.refresh();return first;}
  resign(color){if(this.result)return;this.result={score:color==='w'?'0-1':'1-0',reason:(color==='w'?'White':'Black')+' resigned'};this.game.setHeader('Result',this.result.score);this.revision++;}
  draw(agreement=false){const reason=agreement&&this.mode==='local'?'Draw by agreement':this.claimable();if(!reason)throw new Error('A draw cannot be claimed in this position.');this.result={score:'1/2-1/2',reason};this.game.setHeader('Result',this.result.score);this.revision++;}
  serialize(){return {version:1,mode:this.mode,fen:this.game.fen(),pgn:this.game.pgn(),result:this.result,counted:this.counted};}
  static restore(value){
    if(value?.version!==1||typeof value.pgn!=='string'||value.pgn.length>250000)throw new Error('Invalid saved session.');
    const s=new GameSession({mode:value.mode});if(value.pgn.trim())s.game.loadPgn(value.pgn);else if(value.fen)s.game.load(value.fen);
    if(value.fen!==s.game.fen())throw new Error('Saved position does not match move history.');
    if(value.result&&['1-0','0-1','1/2-1/2'].includes(value.result.score))s.result={score:value.result.score,reason:String(value.result.reason).slice(0,80)};
    s.counted=value.counted===true;s.refresh();return s;
  }
}
export const PRESETS=[{level:0,name:'Beginner',description:'Lite · skill 0 · 200 ms'},{level:3,name:'Casual',description:'Lite · skill 3 · 200 ms'},{level:7,name:'Intermediate',description:'Lite · skill 7 · 200 ms'},{level:12,name:'Advanced',description:'Lite · skill 12 · 200 ms'},{level:20,name:'Expert',description:'Full Stockfish · skill 20 · selected analysis time'}];
