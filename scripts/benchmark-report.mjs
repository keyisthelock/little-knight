import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('../benchmark');
const data=JSON.parse(fs.readFileSync(path.join(dir,'results.json'),'utf8'));
if(data.status!=='complete')throw new Error('Benchmark is not complete.');
const valid=data.games.filter(g=>g.score!==null);
function rating(games){
 let a=-1000,b=4000;
 for(let i=0;i<70;i++){const mid=(a+b)/2;const delta=games.reduce((sum,g)=>sum+g.score-1/(1+10**((g.referenceElo-mid)/400)),0);if(delta>0)a=mid;else b=mid;}
 return(a+b)/2;
}
// Resample whole opening blocks: keep colour swaps and reference groups together.
let state=20261017;
function random(){state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;}
const pairs=[...new Set(valid.map(g=>g.pair))];
const bootstrap=[];
for(let iteration=0;iteration<5000;iteration++){
 const sampled=[];
 for(let j=0;j<pairs.length;j++){const chosen=pairs[Math.floor(random()*pairs.length)];sampled.push(...valid.filter(g=>g.pair===chosen));}
 bootstrap.push(rating(sampled));
}
bootstrap.sort((a,b)=>a-b);
const interval=[Math.round(bootstrap[125]),Math.round(bootstrap[4874])];
const estimate=Math.round(rating(valid));
const wins=valid.filter(g=>g.score===1).length,draws=valid.filter(g=>g.score===.5).length,losses=valid.filter(g=>g.score===0).length;
const totalSeconds=data.games.reduce((sum,g)=>sum+g.seconds,0);
const summary={status:data.status,referenceRelativeElo:estimate,openingBlockBootstrap95Interval:interval,likelihoodInterval:data.fit.approximate95LikelihoodInterval,games:valid.length,wins,draws,losses,excluded:data.games.length-valid.length,minutes:Math.round(totalSeconds/6)/10,groups:data.groups,interpretation:'Nominal Stockfish-reference equivalent at 200 ms/move on this laptop; not a validated FIDE, Chess.com, Lichess or CCRL rating. Both intervals exclude systematic errors in reference calibration.',method:'Logistic Elo maximum-likelihood fit; 5000 deterministic bootstrap replicates resampling entire opening blocks.'};
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));
const text=`# Little Knight — preliminary playing-strength benchmark

**Default playing bot: approximately ${Math.round(estimate/50)*50} on this test's nominal Stockfish-reference scale.**

Fitted value: **${estimate}**. Opening-block bootstrap interval: **${interval[0]}–${interval[1]}** (approximate 95%, conditional on this test and its reference ratings). This is not an official or validated human rating.

## Results

${valid.length} completed games: **${wins} wins, ${draws} draws, ${losses} losses**. Excluded unfinished/error games: ${data.games.length-valid.length}. Recorded match time: approximately ${Math.round(totalSeconds/60)} minutes.

| Full Stockfish nominal preset | Wins | Draws | Losses | Score |
|---|---:|---:|---:|---:|
${data.groups.map(g=>`| ${g.referenceElo} | ${g.wins} | ${g.draws} | ${g.losses} | ${g.score}/${g.completed} (${Math.round(g.score/g.completed*100)}%) |`).join('\n')}

Results describe **playing against the default companion**, not the maximum-skill analysis engine, and not the site's uncalibrated user-rating guess.

## Conditions

- Bot: Stockfish 18 Lite WASM from stockfish npm 18.0.8; production src/engine.js UCI controller; skill 3; UCI_LimitStrength false.
- Reference: full Stockfish 18 single-thread WASM from the same package; UCI_LimitStrength true; nominal UCI_Elo presets 1400, 1700 and 2000.
- Both: one thread, 32 MB hash, 200 ms requested per move. No pondering or tablebases. Hash cleared between games. Engines alternate searching; games run sequentially.
- Eight short, four-ply openings, each repeated with bot colours swapped against each reference preset: Open Game, Queen Pawn, English, Reti, Sicilian, French, Caro-Kann, Indian.
- Whole move history supplied through UCI so repetitions are visible to each engine. Game termination checked through chess.js, including claimable draws.
- Maximum 300 plies and 180 seconds per game; unfinished games excluded rather than labelled draws or guessed wins.
- Machine: ${data.config.cpu}; ${data.config.totalRAMGB} GB RAM. Node CLI runs the exact WASM binaries; browser worker scheduling is not reproduced.
- Started: ${data.started}. Finished: ${data.updated}. Timestamps are UTC.

## What the number means

The fitted rating maximises the logistic Elo likelihood of the game's score against each nominal reference rating. The 95% bootstrap interval resamples the eight opening blocks, preserving their colour swaps and opponent groups. The independent-game likelihood interval is ${data.fit.approximate95LikelihoodInterval.join('–')}; it relies on stronger independence assumptions. Neither is an assurance of real-world human rating accuracy.

**The largest limitation is the rating anchor.** Stockfish's nominal UCI_Elo presets were calibrated at 120 seconds plus 1 second per move, anchored to CCRL 40/4. Our 200 ms/move setup is deliberately shorter to reproduce the app's default. Preset labels do not become verified ratings at these conditions. Lite/full performance, the chosen openings, small sample, same-family opponents, randomness and machine load can all shift the result.

It would be misleading to advertise this as “${estimate} FIDE” or “${estimate} Chess.com”. Use “Easygoing — preliminary benchmark around ${Math.round(estimate/50)*50} against Stockfish reference presets at 200 ms/move”, or keep the non-numeric difficulty label.

For a stronger calibration, use independent engines with established ratings under matched conditions, more opening pairs, repeated seeds, more games, and a separate human/platform validation population. The strongest analysis mode needs a separate benchmark.

## Reproduce and audit

Run from the Little Knight project folder:

\`\`\`sh
node scripts/benchmark.mjs
node scripts/benchmark-report.mjs
\`\`\`

Full outcomes and timings: [results.json](results.json). All replayable games: [games.pgn](games.pgn). Summary: [summary.json](summary.json).

Reference: [Stockfish UCI documentation](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html#uci_elo).
`;
fs.writeFileSync(path.join(dir,'Benchmark-report.md'),text);
console.log(JSON.stringify(summary,null,2));
