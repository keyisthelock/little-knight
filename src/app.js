import { Chess } from "chess.js";
import { Engine } from "./engine.js";
import { SAMPLE_PGN, parseGame, uciMove, sanLine, buildReview, reviewSummary, addReview, EMPTY_PROFILE, validateProfile } from "./core.js";
import { TOPICS, habits, dueDrills, recordAttempt, legalLine } from './coach.js';
import { mountAccount, initAccount, accountDialog } from './account.js';
import {GameSession,PRESETS} from './session.js';
import {BoardView} from './board.js';
import {OPENINGS,CHALLENGES} from './library.js';
import {pieceSVG} from './pieces.js';
let session=new GameSession(), boardView=null, audio=null, resultShown=false;
let storageKey='little-knight-profile', revealed=new Set(), variation=null, drillHinted=false, hintStage=0;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icons = {home:"⌂",library:"◇", review: "▤", play: "♞", practice: "◎", journal: "↗", settings: "⚙" };
let profile;
try {
  profile = validateProfile(JSON.parse(localStorage.getItem("little-knight-profile")));
} catch {
  profile = structuredClone(EMPTY_PROFILE);
}
let view = "home", parsed = null, review = [], scores = [], ply = 0, selected = null, flipped = false, busy = false, runId = 0, engineStatus = "Ready when you are", progress = 0, loading = false, drill = null, hintSquare = null, lastMove = null;
let game = session.game, playStarted = false, messages = [{ who: "knight", text: "Hey, I’m your Little Knight. Bring a game, a curious mind, and maybe a cup of tea. We’ll figure out the tricky bits together." }];
let savedPlayGame = game, savedPlayLastMove = null;
let promotionChoice = null;
const engine = new Engine((status) => {
  engineStatus = status;
  updateStatus();
});
const symbols = { wk: "♚", wq: "♛", wr: "♜", wb: "♝", wn: "♞", wp: "♟", bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟" };
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(profile));
  } catch {
    toast("Storage is full or unavailable. Export a backup to keep your progress.");
  }
}
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
function say(text, force = false) {
  if (profile.settings.tone === "quiet" && !force) return;
  messages.push({ who: "knight", text });
  messages = messages.slice(-30);
  renderChat();
}
function updateStatus() {
  const el = $("#engine-status");
  if (el) el.textContent = engineStatus;
}
function stop() {
  runId++;
  engine.reset();
  busy = false;
  loading = false;
  progress = 0;
  promotionChoice = null;
  boardView?.cancel();
}
function showDialog(html) {
  const d = $("#modal");
  d.onclose=()=>{promotionChoice=null;};
  d.innerHTML = html;
  d.showModal();
  d.querySelector("[data-close]")?.addEventListener("click", () => d.close());
}
function shell() {
  applyAppearance();
  boardView?.cancel();boardView=null;
  $("#app").innerHTML = `<aside class="sidebar"><a class="brand" href="#" aria-label="Little Knight home"><img src="./icon.svg" alt="">Little<span>Knight<span class="brand-dot">.</span></span></a><div class="space-label">YOUR CHESS CORNER</div><nav aria-label="Main navigation">${[["home", "The club"], ["review", "Game review"], ["play", "Play with Knight"], ["practice", "Practice mistakes"], ["journal", "Your journey"], ["library","Openings & puzzles"]].map(([id, label]) => `<button data-view="${id}" class="nav-item ${view === id ? "active" : ""}"><span class="nav-icon">${icons[id]}</span>${label}${id === "practice" && profile.drills.filter((d) => !d.solved).length ? `<span class="nav-count">${profile.drills.filter((d) => !d.solved).length}</span>` : ""}</button>`).join("")}</nav><div class="side-note"><div class="tiny-star">✧</div><strong>A little better,<br>one move at a time.</strong><p>No rush. No judgement.<br>Just you and the board.</p></div><div class="sidebar-bottom"><button data-view="settings" class="nav-item ${view === "settings" ? "active" : ""}"><span class="nav-icon">⚙</span>Preferences</button><div class="local-badge"><i></i> Your games stay on your device</div><div class="profile-mini"><div class="avatar">${esc(profile.settings.name.slice(0, 1).toUpperCase())}</div><div><strong>${esc(profile.settings.name)}</strong><small>Your personal chess space</small></div></div></div></aside><div class="page"><header class="topbar"><span class="breadcrumb">Your chess corner <span>/</span> ${esc({ home:"The club",library:"Openings & puzzles",review: "Game review", play: "Play with Knight", practice: "Practice", journal: "Your journey", settings: "Preferences" }[view])}</span><div class="header-right"><span class="connection"><i></i>${navigator.onLine ? "Local-first" : "Offline"}</span><button class="button secondary account-button" id="account">Sign in</button><button class="icon-button" id="about" aria-label="About Little Knight">?</button></div></header><main id="main"></main><footer><span>Made for the love of the next move.</span><span><span id="engine-status">${esc(engineStatus)}</span><span class="footer-dot">·</span><a href="./licenses.html" target="_blank" rel="noopener">Stockfish & credits ↗</a></span></footer></div>`;
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.view)));
  $(".brand").addEventListener("click", (e) => {
    e.preventDefault();
    navigate("home");
  });
  $("#about").onclick = about;
  mountAccount(()=>busy?toast("Finish or stop the current engine operation first."):accountDialog(showDialog));
  const completedSteps = Number(profile.games.length > 0) + Number(profile.drills.some((d) => d.solved));
  $(".side-note").innerHTML = `<div class="quest-heading">YOUR NEXT SMALL WIN</div><h3>Build a better<br>chess habit.</h3><div class="quest-track"><div id="quest-progress"></div></div><div class="quest-step ${profile.games.length ? "done" : ""}">${profile.games.length ? "✓" : "○"} Review one game</div><div class="quest-step ${profile.drills.some((d) => d.solved) ? "done" : ""}">${profile.drills.some((d) => d.solved) ? "✓" : "○"} Retry one position</div><button class="text-button" id="quest-action">${profile.games.length ? "Keep practising" : "Find your first lesson"} →</button>`;
  $("#quest-progress").style.width = completedSteps * 50 + "%";
  $("#quest-action").onclick = () => navigate(profile.games.length ? "practice" : "review");
  renderView();
}
function navigate(next) {
  if (busy) stop();
  if (view === "play") {
    savedPlayGame = game;
    savedPlayLastMove = lastMove;
  }
  if (next === "play" && view !== "play") {
    game = savedPlayGame;
    lastMove = savedPlayLastMove;
    drill = null;
  }
  view = next;
  variation = null;
  selected = null;
  hintSquare = null;
  shell();
  window.scrollTo({ top: 0,behavior:'instant' });
}
function heading(eyebrow, title, subtitle, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function renderView() {
  const main = $("#main");
  if(view==="home"){renderHome();return;}
  if(view==="library"){renderLibrary();return;}
  if (view === "review") {
    if(!parsed){
      main.innerHTML=heading("YOUR OWN CHESS STORY", "Your next lesson starts with your game.", "Import a game to get personal feedback. Your journal belongs to this profile.")+`<section class="journal-card empty-state"><img src="./icon.svg" alt=""><h2>No game loaded yet.</h2><p>Paste a PGN or choose a game file. We’ll turn your decisions into a focused lesson.</p><button class="button primary" id="empty-import">Import my game →</button><button class="text-button" id="empty-demo">Explore a labelled demo</button></section>`+coachingPanel();
      $("#empty-import").onclick=importDialog;
      $("#empty-demo").onclick=()=>{parsed=parseGame(SAMPLE_PGN);review=[];scores=[];ply=0;renderView();};
      bindCoaching();return;
    }
    main.innerHTML = heading("A FRESH PERSPECTIVE", "Every game has a little lesson.", "Let’s find the moments that will make your next game better.", `<button class="button primary" id="import">＋ Import game</button>`) + `<div class="workspace"><section class="board-card"><div class="board-top"><div><span class="player-avatar opponent">♞</span><div><strong id="opponent-name"></strong><span class="player-sub">${parsed ? "Game review" : "A little lesson in development"}</span></div></div><span class="pill">${parsed.headers.Event === "A little lesson in development" ? "Sample game" : "PGN imported"}</span></div><div class="board-wrap"><div id="eval-bar" class="eval-bar"><div></div><span>0.0</span></div><div id="board" class="board" role="group" aria-label="Chess board"></div></div><div class="board-bottom"><div><span class="player-avatar">${esc(profile.settings.name[0])}</span><div><strong id="player-name"></strong><span class="player-sub">${profile.settings.playerColor === "w" ? "White pieces" : "Black pieces"}</span></div></div><span class="turn-label" id="position-label"></span></div><div class="board-controls"><div><button class="icon-button" id="flip" aria-label="Flip board">⇅</button><button class="icon-button" id="export-pgn" aria-label="Export PGN">↥</button></div><div><button class="icon-button" data-ply="first" aria-label="First position">|‹</button><button class="icon-button" data-ply="prev" aria-label="Previous move">‹</button><span id="ply-count" class="ply-count"></span><button class="icon-button" data-ply="next" aria-label="Next move">›</button><button class="icon-button" data-ply="last" aria-label="Last position">›|</button></div><span class="keyboard-hint">← → to explore</span></div></section><aside class="review-column"><section class="companion-card"><div class="companion-intro"><img src="./icon.svg" alt="Little Knight"><div><strong>A little insight</strong><span>Full-strength engine. Friendly explanations.</span></div><span class="sparkle">✦</span></div><div id="review-insight"></div></section><section class="moves-card"><div class="card-heading"><h2>The story of your game</h2><span id="moves-tag" class="small-muted"></span></div><div id="move-list" class="move-list"></div><div class="analysis-action"><button class="button primary full" id="analyse">✧ Review this game</button><div id="progress" class="progress"><div></div></div><p id="analysis-note">Full Stockfish 18 · first web load ≈108 MB · no game upload</p></div></section></aside></div><section id="evaluation-chart" class="evaluation-chart"></section><div id="review-stats" class="stat-grid"></div>`;
    $("#import").onclick = importDialog;
    const importButton = $("#import");
    const actions = document.createElement("div");
    actions.className = "hero-actions";
    importButton.before(actions);
    actions.append(importButton);
    importButton.className = "button secondary";
    actions.insertAdjacentHTML("afterbegin", '<button class="button primary" id="quick-review">✧ Review this game</button>');
    $("#quick-review").onclick = () => busy ? cancelAnalysis() : analyse();
    $(".page-heading>div").insertAdjacentHTML("beforeend", '<div class="review-banner"><span>FULL STOCKFISH 18</span><span>' + (location.protocol === "knight:" ? "BOTH ENGINES INCLUDED OFFLINE" : "FIRST ANALYSIS DOWNLOAD ≈108 MB") + "</span><span>YOUR GAMES STAY PRIVATE</span></div>");
    $("#flip").onclick = () => {
      flipped = !flipped;
      renderBoard();
    };
    $("#export-pgn").onclick = () => download("game.pgn", parsed.pgn, "application/x-chess-pgn");
    document.querySelectorAll("[data-ply]").forEach((b) => b.onclick = () => setPly({ first: 0, prev: ply - 1, next: ply + 1, last: parsed.moves.length }[b.dataset.ply]));
    $("#analyse").onclick = () => busy ? cancelAnalysis() : analyse();
    renderReview();
  } else if (view === "play" || view === "practice") renderPlay();
  else if (view === "journal") renderJournal();
  else renderSettings();
}
function renderBoard() {
  const board = $("#board");
  if (!board) return;
  const fen = view === "review" ? (variation ? variation.fens[variation.index] : parsed.fens[ply]) : game.fen();
  const position=new Chess(fen);
  const targets=selected&&view!=="review"?position.moves({square:selected,verbose:true}).map(m=>m.to):[];
  if(!boardView||boardView.el!==board)boardView=new BoardView(board,{click:clickSquare,drop:(from,to)=>{if(canControl(from)){selected=from;void clickSquare(to);}},canDrag:canControl,settings:()=>profile.settings});
  const lm=view==='review'?(variation?variation.moves[variation.index-1]:parsed.moves[ply-1]):lastMove;
  boardView.render({fen,flipped,selected,targets,lastMove:lm,hintSquare});
  if ($("#eval-bar")) {
    const score = scores[ply]?.whiteScore || 0;
    const percent = 50 + Math.max(-45, Math.min(45, score / 15));
    $("#eval-bar div").style.height = percent + "%";
    $("#eval-bar span").textContent = scores[ply] ? formatScore(scores[ply]) : "—";
  }
}
function formatScore(s) {
  if (Math.abs(s.whiteScore) >= 9e3) return s.whiteScore > 0 ? "M+" : "M−";
  return (s.whiteScore >= 0 ? "+" : "") + (s.whiteScore / 100).toFixed(1);
}
function setPly(next) {
  if(!parsed)return;
  variation=null;
  ply = Math.max(0, Math.min(parsed.moves.length, next));
  selected = null;
  hintSquare = null;
  renderReview();
}
function renderReview() {
  $("#opponent-name").textContent = parsed.headers[profile.settings.playerColor === "w" ? "Black" : "White"] || "Opponent";
  $("#player-name").textContent = parsed.headers[profile.settings.playerColor === "w" ? "White" : "Black"] || "You";
  const position = new Chess(parsed.fens[ply]);
  $("#position-label").textContent = ply === 0 ? "Starting position" : `Move ${position.fen().split(" ")[5]} · ${position.turn() === "w" ? "White" : "Black"} to move`;
  $("#ply-count").textContent = `${ply} / ${parsed.moves.length}`;
  $("#moves-tag").textContent = `${Math.ceil(parsed.moves.length / 2)} moves`;
  let rows = "";
  const grouped = [];
  parsed.moves.forEach((move, index) => {
    const number = Number(parsed.fens[index].split(" ")[5]);
    if (grouped.at(-1)?.number !== number) grouped.push({ number, w: null, b: null });
    grouped.at(-1)[move.color] = index;
  });
  for (const row of grouped) {
    rows += `<div class="move-row"><span class="move-number">${row.number}.</span>${["w", "b"].map((color) => {
      const j = row[color];
      return j === null ? "<span></span>" : `<button data-move="${j + 1}" class="move ${ply === j + 1 ? "current" : ""}"><span>${esc(parsed.moves[j].san)}</span>${review[j] ? `<span class="move-mark ${review[j].label.kind}" title="${review[j].label.name}">${review[j].label.symbol}</span>` : ""}</button>`;
    }).join("")}</div>`;
  }
  $("#move-list").innerHTML = rows;
  document.querySelectorAll("[data-move]").forEach((b) => b.onclick = () => setPly(Number(b.dataset.move)));
  const activeMove = $("#move-list .current");
  if (activeMove) $("#move-list").scrollTop = Math.max(0, activeMove.offsetTop - $("#move-list").offsetTop - 65);
  const current = review[ply - 1];
  if(current){
    const l=current.lesson,unlocked=revealed.has(current.index)||current.loss<100;
    $("#review-insight").innerHTML=`<div class="insight-tag ${current.label.kind}">${current.label.symbol} ${current.label.name}</div><h3>${esc(current.san)} · ${esc(l.title)}</h3><div class="coach-question"><span>PAUSE & THINK</span><p>${esc(l.question)}</p></div>${unlocked?`<p>${esc(l.evidence)}</p><div class="coach-takeaway"><strong>Take this into your next game</strong><p>${esc(l.takeaway)}</p></div>${l.better.length?'<button class="button secondary full" id="show-better">Explore the better line →</button>':''}${l.reply.length?'<button class="text-button" id="show-reply">See the reply to my move</button>':''}<p class="small-muted">${esc(l.caveat)}</p>`:'<button class="button primary full" id="reveal-lesson">Show the explanation</button>'}${current.loss>=100?'<button class="text-button" id="retry-move">Try this position again →</button>':''}<div id="variation-controls"></div>`;
    $("#reveal-lesson")?.addEventListener('click',()=>{revealed.add(current.index);renderReview();});
    $("#show-better")?.addEventListener('click',()=>openVariation(current,'better'));
    $("#show-reply")?.addEventListener('click',()=>openVariation(current,'reply'));
    $("#retry-move")?.addEventListener('click',()=>startDrill({id:profile.drills.find(d=>d.fen===parsed.fens[current.index])?.id,fen:parsed.fens[current.index],bestUci:current.bestUci,line:current.bestLine,played:current.san,topic:l.topic,evidence:l.evidence}));
  }else $("#review-insight").innerHTML=`<div class="insight-tag neutral">YOUR NEXT LESSON</div><h3>${review.length?'Review ready. Choose a moment.':'Let’s learn from your decisions.'}</h3><p>${review.length?'Select a marked move. Think about the reply, reveal the explanation, then retry it.':'Review your game to find the moments that deserve another look.'}</p>`;
  const summary = reviewSummary(review);
  $("#review-stats").innerHTML = `<div class="stat-card"><div class="stat-icon mint">✓</div><div><span>Move quality index</span><strong>${review.length ? summary.quality + "<small>/100</small>" : "—"}</strong><p>Our own evaluation-loss index</p></div></div><div class="stat-card"><div class="stat-icon peach">◎</div><div><span>Moments to revisit</span><strong>${review.length ? summary.mistakes.length : "—"}</strong><p>Your mistakes become practice</p></div></div><div class="stat-card rating-card"><div class="stat-icon lavender">✧</div><div><span>Playful rating guess <em>BETA</em></span><strong>${summary.guess !== null ? Math.max(400, summary.guess - 300) + "–" + Math.min(2500, summary.guess + 300) : "Still exploring"}</strong><p>${summary.guess !== null ? "Uncalibrated heuristic, not a rated result" : "Needs 12 eligible moves after move 4"}</p><button class="text-button" id="rating-info">How this works ↗</button></div></div>`;
  $("#rating-info").onclick = ratingInfo;
  $("#analyse").textContent = busy ? "■ Stop review" : review.length ? "✧ Review again" : "✧ Review this game";
  if ($("#quick-review")) $("#quick-review").textContent = $("#analyse").textContent;
  $("#progress").classList.toggle("visible", busy);
  $("#progress div").style.width = progress + "%";
  $("#analysis-note").textContent = busy ? `Reviewing position ${Math.round(progress / 100 * parsed.fens.length)} of ${parsed.fens.length}…` : review.length ? "Saved locally. Your next lesson is waiting." : "Full Stockfish 18 · first web load ≈108 MB · no game upload";
  renderBoard();
  renderEvaluationChart();
  if(variation)renderVariation();
}
function renderEvaluationChart() {
  const el = $("#evaluation-chart");
  if (!el) return;
  const focused = document.activeElement?.id === "chart-position";
  if (!scores.length) {
    el.innerHTML = '<div class="card-heading"><h2>The shape of your game</h2><span class="small-muted">Review to reveal the turning points</span></div>';
    return;
  }
  const width = 900, height = 90;
  const x = (i) => i / Math.max(1, scores.length - 1) * width;
  const y = (s) => height / 2 - Math.max(-600, Math.min(600, s)) / 600 * 36;
  const points = scores.map((s, i) => `${x(i)},${y(s.whiteScore)}`).join(" ");
  el.innerHTML = `<div class="card-heading"><h2>The shape of your game</h2><span class="small-muted">Above the line favours White · below favours Black</span></div><div class="chart-body"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evaluation across ${scores.length} positions; use the slider to select a move"><line x1="0" y1="45" x2="900" y2="45" stroke="#dce3d3" stroke-dasharray="4 5"/><polygon points="0,45 ${points} 900,45" fill="#dce8ce" opacity=".6"/><polyline points="${points}" fill="none" stroke="#78956b" stroke-width="2" vector-effect="non-scaling-stroke"/><line x1="${x(ply)}" y1="0" x2="${x(ply)}" y2="90" stroke="#b69a66"/><circle cx="${x(ply)}" cy="${y(scores[ply].whiteScore)}" r="4" fill="#294a3d"/></svg><label class="chart-scrubber"><span>Start</span><input id="chart-position" type="range" min="0" max="${parsed.moves.length}" value="${ply}" aria-label="Explore game position"><span>Finish</span></label></div>`;
  $("#chart-position").onchange = (e) => setPly(Number(e.target.value));
  if (focused) $("#chart-position").focus({ preventScroll: true });
}
function openVariation(move,which){
  const line=move.lesson[which];
  variation={title:which==='better'?'Engine alternative':'Reply to your move',index:0,
    fens:[which==='better'?move.before.fen:move.after.fen,...line.map(x=>x.fen)],moves:line};
  renderVariation();
}
function renderVariation(){
  const el=$('#variation-controls');if(!el||!variation)return;
  el.innerHTML=`<div class="variation-panel"><strong>${esc(variation.title)}</strong><p>Position ${variation.index} / ${variation.moves.length} · ${esc(variation.moves.slice(0,variation.index).map(x=>x.san).join(' ')||'Starting position')}</p><div class="button-group"><button class="button secondary" id="line-back" ${variation.index===0?'disabled':''}>← Back</button><button class="button secondary" id="line-next" ${variation.index===variation.moves.length?'disabled':''}>Next →</button><button class="text-button" id="line-close">Return to game</button></div></div>`;
  $('#line-back').onclick=()=>{variation.index--;renderVariation();};
  $('#line-next').onclick=()=>{variation.index++;renderVariation();};
  $('#line-close').onclick=()=>{variation=null;renderReview();};
  $('#position-label').textContent=variation.title+' · '+variation.index+'/'+variation.moves.length;
  renderBoard();
  if($('#eval-bar'))$('#eval-bar span').textContent='Line';
}
function coachingPanel(){
  const trends=habits(profile),focus=trends[0],due=dueDrills(profile),analysed=profile.games.filter(g=>g.lessons).length;
  return `<section class="coaching-panel"><div class="card-heading"><div><div class="eyebrow">YOUR PERSONAL COACH</div><h2>${focus?esc(focus.title):'One thoughtful habit at a time.'}</h2></div><span class="pill">${focus?.recurring?'Recurring pattern':focus?'Early signal':'Getting to know your chess'}</span></div><p>${focus?`Observed in <strong>${focus.games} of ${focus.sample}</strong> recently analysed games (${focus.moments} moments). ${esc(focus.habit)}`:'Review your own games to discover patterns. Three separate games with the same theme are needed before we call it recurring.'}</p><div class="coach-plan"><div><strong>Your next 10 minutes</strong><ol><li>${focus?esc(focus.task):'Review one of your own games.'}</li><li>${due.length?`Retry ${Math.min(3,due.length)} position${due.length===1?'':'s'} due for practice.`:'Pause at one mistake and predict the strongest reply.'}</li><li>Explain the idea in your own words before your next game.</li></ol></div><button class="button primary" id="coach-practise">${due.length?'Start focused practice':'Review my next game'} →</button></div>${trends.length?`<div class="habit-grid">${trends.slice(0,3).map(h=>`<div><strong>${esc(h.title)}</strong><span>${h.games}/${h.sample} games · ${h.recurring?'recurring':'early signal'}</span></div>`).join('')}</div>`:''}<p class="small-muted">Based on ${analysed} locally analysed game${analysed===1?'':'s'}; last 20 used for patterns. Tags use visible engine lines. They cannot infer whether you rushed, felt nervous, or understood an idea. Old reviews need one re-analysis to add coaching evidence.</p></section>`;
}
function bindCoaching(){
  $('#coach-practise')?.addEventListener('click',()=>{const next=dueDrills(profile)[0];if(next)startDrill(next);else navigate('review');});
}
function importDialog() {
  showDialog(`<div class="dialog-heading"><div><div class="eyebrow">BRING YOUR OWN GAME</div><h2>A fresh pair of eyes.</h2></div><button class="icon-button" data-close aria-label="Close">×</button></div><p class="muted">Paste a single PGN, or choose a file. Your game stays on this device.</p><label class="field-label" for="pgn-input">Game in PGN format</label><textarea id="pgn-input" rows="9" placeholder="1. e4 e5 2. Nf3 Nc6…" spellcheck="false"></textarea><div class="import-options"><label>Review my moves as <select id="import-color"><option value="w">White</option><option value="b">Black</option></select></label><label class="button secondary file-button">Choose .pgn<input type="file" id="pgn-file" accept=".pgn,.txt"></label></div><p id="import-error" class="error-text" role="alert"></p><div class="dialog-actions"><button class="button secondary" id="sample">Use sample game</button><button class="button primary" id="load-pgn">Open game →</button></div>`);
  $("#import-color").value = profile.settings.playerColor;
  $("#pgn-file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 25e4) {
      $("#import-error").textContent = "Please choose a file smaller than 250 KB.";
      return;
    }
    $("#pgn-input").value = await f.text();
  };
  const load = (text) => {
    try {
      const next = parseGame(text);
      stop();
      parsed = next;
      review = [];
      scores = [];
      ply = 0;
      profile.settings.playerColor = $("#import-color").value;
      profile.currentPgn=parsed.pgn;
      save();
      revealed.clear();variation=null;
      $("#modal").close();
      renderView();
    } catch (e) {
      $("#import-error").textContent = "Could not read this game. " + e.message;
    }
  };
  $("#load-pgn").onclick = () => load($("#pgn-input").value);
  $("#sample").onclick = () => load(SAMPLE_PGN);
}
async function analyse() {
  if (busy) return;
  busy = true;
  progress = 0;
  const id = ++runId;
  const nextScores = [];
  renderReview();
  try {
    for (let i = 0; i < parsed.fens.length; i++) {
      if (id !== runId) return;
      const preceding = parsed.moves.slice(0, i).map((move) => move.from + move.to + (move.promotion || "")).join(" ");
      const positionCommand = "position fen " + parsed.fens[0] + (preceding ? " moves " + preceding : "");
      nextScores.push(await engine.evaluate(parsed.fens[i], profile.settings.budget, 20, positionCommand, "full"));
      if (id !== runId) return;
      progress = (i + 1) / parsed.fens.length * 100;
      $("#progress div").style.width = progress + "%";
      $("#analysis-note").textContent = `Reviewing position ${i + 1} of ${parsed.fens.length}…`;
      await new Promise((r) => setTimeout(r, 25));
    }
    scores = nextScores;
    review = buildReview(parsed, scores, profile.settings.playerColor);
    profile = addReview(profile, parsed, review, profile.settings.playerColor);
    save();
    busy = false;
    ply = review.find((m) => m.isPlayer && m.loss >= 100)?.index + 1 || 0;
    shell();
    toast("Review ready. Your practice positions are saved on this device.");
  } catch (e) {
    if (id === runId) {
      busy = false;
      toast(e.message);
      renderReview();
    }
  }
}
function cancelAnalysis() {
  stop();
  renderReview();
  toast("Review stopped. You can start again whenever you like.");
}
function renderPlay() {
  const practice = view === "practice";
  if (practice && !drill) {
    const pending = dueDrills(profile);
    $("#main").innerHTML = heading("TURN A MISTAKE INTO A SMALL WIN", "A little practice goes a long way.", "Positions from your games, saved right here on your device.") + `<div class="practice-banner"><img src="./icon.svg" alt=""><div><h2>${pending.length ? "Your next lesson is already here." : "Every mistake can become a lesson."}</h2><p>${pending.length ? `${pending.length} positions to revisit. Take one at your own pace.` : "Review one of your games to collect practice positions. You can also try a short demonstration."}</p><button class="button primary" id="practice-start">${pending.length ? "Practise next position" : "Try a practice position"} →</button></div></div><div class="drill-grid">${profile.drills.slice().reverse().slice(0, 12).map((d) => `<button class="drill-card" data-drill="${esc(d.id)}"><span class="pill">${d.solved ? "✓ Revisited" : "◎ Your game"}</span><h3>Instead of ${esc(d.played)}</h3><p>${new Chess(d.fen).turn() === "w" ? "White" : "Black"} to move · Find the engine’s preferred move</p><span class="text-button">Explore position →</span></button>`).join("")}</div>`;
    $("#main").insertAdjacentHTML('beforeend',coachingPanel());bindCoaching();
    $("#practice-start").onclick = () => startDrill(pending[0] || { fen: "4k3/8/8/8/8/8/4q3/4R1K1 w - - 0 1", bestUci: "e1e2", line: "Rxe2+", played: "A missed capture" });
    document.querySelectorAll("[data-drill]").forEach((b) => b.onclick = () => startDrill(profile.drills.find((d) => d.id === b.dataset.drill)));
    return;
  }
  $("#main").innerHTML = heading(practice ? "YOUR NEXT SMALL WIN" : "A FRIEND ON THE OTHER SIDE", practice ? "Let’s try that moment again." : "A little chess. A little company.", practice ? "Find the engine’s preferred move. Take all the time you need." : "A relaxed game, a friendly nudge, and room to get better.", `<button class="button secondary" id="new-game">${practice ? "← All practice" : "↻ New game"}</button>`) + `<div class="workspace"><section class="board-card"><div class="board-top"><div><span class="player-avatar opponent">♞</span><div><strong>Little Knight</strong><span class="player-sub">${practice ? "Your practice partner" : "Friendly mode · " + { 0: "Gentle", 3: "Easygoing", 7: "Thoughtful", 12: "Challenging", 20: "Full strength" }[profile.settings.level]}</span></div></div><span class="pill">${practice ? "Practice" : "Offline ready"}</span></div><div class="board-wrap play-board-wrap"><div id="board" class="board" role="group" aria-label="Playable chess board"></div></div><div class="board-bottom"><div><span class="player-avatar">${esc(profile.settings.name[0])}</span><div><strong>${esc(profile.settings.name)}</strong><span class="player-sub">${(practice ? game.turn() : profile.settings.playerColor) === "w" ? "White" : "Black"} pieces</span></div></div><span class="turn-label" id="game-status"></span></div><div class="board-controls"><div><button class="icon-button" id="flip" aria-label="Flip board">⇅</button><button class="icon-button" id="undo" aria-label="Take back turn" ${practice ? "disabled" : ""}>↶</button></div><button class="text-button" id="hint">✧ A little hint</button><button class="text-button" id="review-played">Review game ↗</button></div></section><aside class="review-column"><section class="chat-card"><div class="companion-intro"><img src="./icon.svg" alt="Little Knight"><div><strong>Your Little Knight</strong><span><i class="online-dot"></i> Here for the next move</span></div><span class="sparkle">✦</span></div><div id="chat-messages" class="chat-messages" aria-live="polite"></div><div class="chat-replies"><button data-chat="encourage">A little encouragement</button><button data-chat="remember">What do you remember?</button><button data-chat="tip">Give me a chess tip</button></div><div class="chat-footnote">Contextual dialogue · no cloud AI or microphone</div></section><section class="memory-note"><span>✧</span><div><strong>Growing together</strong><p>${profile.games.length ? `I have ${profile.games.length} reviewed games and ${profile.drills.filter((d) => !d.solved).length} practice positions in your local journal.` : "Review your games and I’ll remember positions we can practise together."}</p></div></section></aside></div><div class="quiet-note">${practice ? "Practice uses a saved engine continuation. Other good moves may exist." : "Difficulty settings are approximate, not calibrated ratings. Use hints and takebacks freely."}</div>`;
  $("#flip").onclick = () => {
    flipped = !flipped;
    renderBoard();
  };
  $("#new-game").onclick = () => {
    if (practice) {
      drill = null;
      shell();
    } else gameSetup();
  };
  $("#undo").onclick = undo;
  $("#hint").onclick = hint;
  $("#review-played").onclick = reviewPlayed;
  document.querySelectorAll("[data-chat]").forEach((b) => b.onclick = () => reply(b.dataset.chat));
  renderBoard();
  renderChat();
  updateGameStatus();
  if(!practice){enhancePlay();if(!busy&&session.mode==='computer'&&game.turn()!==profile.settings.playerColor&&!session.result)void botMove();}
}
function renderChat() {
  const el = $("#chat-messages");
  if (!el) return;
  el.innerHTML = messages.map((m) => `<div class="chat-message ${m.who === "you" ? "user-message" : ""}">${esc(m.text)}</div>`).join("");
  el.scrollTop = el.scrollHeight;
}
function reply(kind) {
  const prompts = { encourage: "A little encouragement, please.", remember: "What do you remember about my chess?", tip: "Give me a chess tip." };
  messages.push({ who: "you", text: prompts[kind] });
  if(kind==='remember'&&habits(profile).length){const h=habits(profile)[0];say(`In your last ${h.sample} analysed games, I found ${h.moments} ${h.title.toLowerCase()} moments across ${h.games} games. ${h.recurring?'This is recurring.':'This is an early signal, not a firm pattern.'} ${h.habit}`,true);return;}
  if (kind === "remember") say(profile.games.length ? `You’ve reviewed ${profile.games.length} games here. We have ${profile.drills.filter((d) => !d.solved).length} positions left to revisit and ${profile.drills.filter((d) => d.solved).length} already revisited. I only remember what you save in this app.` : "We’re just getting started. Review a game and I’ll save a few important positions for our next practice session.", true);
  else if (kind === "encourage") say(["You don’t have to find the perfect move. Look for checks, captures, and threats, then choose thoughtfully.", "A difficult position is a chance to slow down. One careful move is a lovely place to start.", "You showed up to practise. That counts. Let’s give this position a little patience."][Math.floor(Math.random() * 3)], true);
  else say(game.isCheck() ? "Your king is in check. Look at king moves, capturing the checking piece, or blocking the line." : "Before you move, ask: what is my opponent threatening, and which of my pieces are undefended?", true);
}
async function clickSquare(square) {
  if($('#board'))$('#board').dataset.inputState=JSON.stringify({view,busy,finished:!!session.result,mode:session.mode,turn:game.turn(),side:profile.settings.playerColor});
  if (view === "review") return;
  if (busy) return;
  const practice = view === "practice";
  if(!practice&&(session.result||session.mode!=='local'&&game.turn()!==profile.settings.playerColor))return;
  const piece = game.get(square);
  if (selected) {
    const options = game.moves({ square: selected, verbose: true }).filter((m) => m.to === square);
    if (options.length) {
      if (options.some((m) => m.promotion)) {
        promotionChoice = { from: selected, to: square };
        showDialog(`<div class="dialog-heading"><h2>Your pawn earned a promotion.</h2><button class="icon-button" data-close aria-label="Close">×</button></div><p>Choose a piece.</p><div class="promotion-options">${[["q", "Queen"], ["r", "Rook"], ["b", "Bishop"], ["n", "Knight"]].map(([p, n]) => `<button class="button secondary" data-promote="${p}">${n}</button>`).join("")}</div>`);
        document.querySelectorAll("[data-promote]").forEach((b) => b.onclick = () => {
          const m = { ...promotionChoice, promotion: b.dataset.promote };
          promotionChoice = null;
          $("#modal").close();
          void makeMove(m);
        });
        return;
      }
      await makeMove({ from: selected, to: square });
      return;
    }
  }
  selected = piece?.color === game.turn() ? square : null;
  hintSquare = null;
  renderBoard();
}
async function makeMove(move) {
  if (view === "practice") {
    const actual = move.from + move.to + (move.promotion || "");
    const attempt=new Chess(game.fen());let isMate=false;try{attempt.move(move);isMate=attempt.isCheckmate();}catch{return;}
    if (actual !== drill.bestUci && !(drill.goal==='mate'&&isMate)) {
      if(drill.id){const d=profile.drills.find(x=>x.id===drill.id);if(d){Object.assign(d,recordAttempt(d,false));save();}}
      say("That is legal. Before trying again, name your opponent’s strongest reply. The saved engine line prefers another move; other good moves may exist.",true);
      selected = null;
      renderBoard();
      return;
    }
    lastMove = game.move(move);
    selected = null;
    hintSquare = null;
    if (drill.id) {
      const d = profile.drills.find((d2) => d2.id === drill.id);
      if (d) Object.assign(d,recordAttempt(d,true,{hinted:drillHinted}));
      save();
    }
    renderBoard();
    updateGameStatus();
    say(`Nicely found: ${lastMove.san}. ${drillHinted?'That was guided practice; try it without a hint next time.':'I’ll bring this position back later to help it stick.'} ${TOPICS[drill.topic]?.habit||'Check your opponent’s reply before moving.'}`,true);
    $("#review-played").textContent='Next practice →';
    $("#review-played").onclick=()=>{drill=null;renderPlay();};
    $("#hint").disabled = true;
    return;
  }
  try {
    lastMove = session.move(move);
    soundMove(lastMove);persistPlay();
    selected = null;
    hintSquare = null;
    playStarted = true;
    renderBoard();
    updateGameStatus();
    if (lastMove.san.includes("#")) say("Checkmate. Nicely finished! Shall we review how you got there?", true);
    else if (lastMove.isKingsideCastle() || lastMove.isQueensideCastle()) say("King tucked away. A little breathing room.");
    else if (lastMove.captured && profile.settings.tone === "chatty") say("A capture on the board. Let’s see how the position changes.");
    refreshPlayPanel();
    if(session.result)finishGame();else if(session.mode==='computer')await botMove();
  } catch (e) {
    toast(e.message);
  }
}
async function botMove() {
  if (busy || view !== "play" || session.result || session.mode!=="computer" || game.turn()===profile.settings.playerColor || document.hidden) return;
  busy = true;
  const id = ++runId;
  const expectedFen=game.fen(),expectedRevision=session.revision;
  updateGameStatus();
  try {
    const history = game.history({ verbose: true });
    const start = history[0]?.before;
    const positionCommand = history.length ? `position fen ${start} moves ${history.map((m) => m.from + m.to + (m.promotion || "")).join(" ")}` : null;
    const fullStrength = profile.settings.level === 20;
    const result = await engine.evaluate(game.fen(), fullStrength ? profile.settings.budget : 200, profile.settings.level, positionCommand, fullStrength ? "full" : "lite");
    if (id !== runId||view!=='play'||session.result||session.revision!==expectedRevision||game.fen()!==expectedFen)return;
    lastMove = session.move(uciMove(result.bestMove));
    soundMove(lastMove);persistPlay();
    busy = false;
    selected = null;
    renderBoard();
    updateGameStatus();
    if (game.isCheckmate()) say("Checkmate. Let’s revisit the turning point together—there’s a useful lesson in here.", true);
    else if (game.isCheck()) say("A little check. Your king needs attention.");
    refreshPlayPanel();
    if (session.result) finishGame();
  } catch (e) {
    if (id === runId) {
      busy = false;
      toast(e.message);
      updateGameStatus();
    }
  }
}
function finishGame(){
  if(!session.result)return;
  if(!session.counted){profile.sessions++;session.counted=true;save();persistPlay();}
  updateGameStatus();refreshPlayPanel();
  if(resultShown)return;resultShown=true;
  const r=session.result;
  showDialog(`<div class="result-emblem">♞</div><div class="eyebrow">THE FINAL POSITION</div><h2>${esc(r.reason)}</h2><p class="result-score">${esc(r.score)}</p><p>A finished game. A new perspective.</p><div class="button-group"><button class="button primary" id="result-review">Review this game</button><button class="button secondary" data-close>Keep the board</button></div>`);
  $('#result-review').disabled=!game.history().length;$('#result-review').onclick=()=>{$('#modal').close();reviewPlayed();};
}
function updateGameStatus() {
  const el = $("#game-status");
  if (!el) return;
  if(view==='play'){el.textContent=session.result?session.result.reason+' · '+session.result.score:busy?'Knight is thinking…':game.isCheck()?'Check · '+(game.turn()==='w'?'White':'Black')+' to move':session.mode==='local'?(game.turn()==='w'?'White':'Black')+' to move':game.turn()===profile.settings.playerColor?'Your move':'Knight to move';return;}
  el.textContent = busy ? "Knight is thinking…" : game.isCheckmate() ? "Checkmate" : game.isDraw() ? "Draw" : game.isCheck() ? "Check · " + (game.turn() === "w" ? "White" : "Black") + " to move" : view === "practice" ? "Find a thoughtful move" : game.turn() === profile.settings.playerColor ? "Your move" : "Knight to move";
}
function newGame(options={}){
  stop();session=new GameSession(options);game=session.game;savedPlayGame=game;savedPlayLastMove=null;lastMove=null;selected=null;hintSquare=null;playStarted=false;drill=null;resultShown=false;flipped=profile.settings.playerColor==='b';view='play';persistPlay();shell();
}
function undo(){
  if(view!=='play')return;
  const thinking=busy;stop();const pair=session.mode==='computer'&&!thinking&&game.turn()===profile.settings.playerColor;
  session.undo(pair);resultShown=false;lastMove=game.history({verbose:true}).at(-1)||null;selected=null;hintSquare=null;persistPlay();renderBoard();updateGameStatus();refreshPlayPanel();
  if(session.mode==='computer'&&game.turn()!==profile.settings.playerColor&&!session.result)void botMove();
}
async function hint() {
  if (busy) return;
  if (view === "practice") {
    drillHinted=true;hintStage++;
    if(hintStage===1)say(TOPICS[drill.topic]?.question||'Look at checks, captures and threats. What must your move address?',true);
    else if(hintStage===2){hintSquare=drill.bestUci.slice(0,2);renderBoard();say(`Look at the piece on ${hintSquare}. Where could it go?`,true);}
    else {hintSquare=drill.bestUci.slice(2,4);renderBoard();say(`The saved move is ${legalLine(drill.fen,drill.bestUci)[0]?.san||drill.bestUci}. Try it on the board, then explain the reply to yourself.`,true);}
    return;
  }
  if (session.result || game.turn() !== profile.settings.playerColor || session.mode==='local') return;
  busy = true;
  const id = ++runId;
  updateGameStatus();
  try {
    const result = await engine.evaluate(game.fen(), profile.settings.budget, 20, null, "full");
    if (id !== runId) return;
    busy = false;
    hintSquare = result.bestMove.slice(0, 2);
    renderBoard();
    say(`Consider the piece on ${hintSquare}. The engine suggests ${sanLine(game.fen(), result.pv, 1)}.`, true);
    updateGameStatus();
  } catch (e) {
    if (id === runId) {
      busy = false;
      toast(e.message);
      updateGameStatus();
    }
  }
}
function reviewPlayed() {
  if (busy) return;
  if (!game.history().length) {
    toast("Play a few moves first.");
    return;
  }
  if (view === "play") {
    savedPlayGame = game;
    savedPlayLastMove = lastMove;
  }
  parsed = parseGame(game.pgn());
  review = [];
  scores = [];
  ply = 0;
  view = "review";
  shell();
}
function startDrill(d) {
  if (!d?.bestUci) return;
  if (view === "play") {
    savedPlayGame = game;
    savedPlayLastMove = lastMove;
  }
  stop();
  drill = d;
  drillHinted=false;hintStage=0;
  game = new Chess(d.fen);
  lastMove = null;
  selected = null;
  hintSquare = null;
  flipped = game.turn() === "b";
  view = "practice";
  messages = [{who:"knight",text:`${TOPICS[d.topic]?.title||"A second look"}. ${game.turn()==="w"?"White":"Black"} to move. ${TOPICS[d.topic]?.question||"What checks, captures and threats can you find?"}`}];
  shell();
}
function renderJournal() {
  const count = profile.games.length, solved = profile.drills.filter((d) => d.solved).length;
  $("#main").innerHTML = coachingPanel() + heading("PROGRESS, AT YOUR OWN PACE", "Look how far you’ve come.", "A small journal of the work you put in. Stored on this device.", `<button class="button secondary" id="backup">↥ Export backup</button>`) + `<div class="stat-grid journal-stats"><div class="stat-card"><div class="stat-icon mint">▤</div><div><span>Games reviewed</span><strong>${count}</strong><p>Each one has something to teach</p></div></div><div class="stat-card"><div class="stat-icon peach">◎</div><div><span>Positions revisited</span><strong>${solved}</strong><p>Turning mistakes into familiarity</p></div></div><div class="stat-card"><div class="stat-icon lavender">♞</div><div><span>Games with Knight</span><strong>${profile.sessions}</strong><p>Completed on this device</p></div></div></div><section class="journal-card"><div class="card-heading"><h2>Your review journal</h2><span class="pill">Private & local</span></div>${count ? profile.games.map((g, i) => `<button class="journal-row" data-saved="${i}"><span class="journal-game-icon">♟</span><div><strong>${esc(new Date(g.date).toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" }))}</strong><span>Played as ${g.color === "w" ? "White" : "Black"}</span></div><div><strong>${g.mistakes} moments</strong><span>to learn from</span></div><span class="quality-pill">${g.quality}/100 quality</span><span>↗</span></button>`).join("") : `<div class="empty-state"><img src="./icon.svg" alt=""><h2>Your story starts with one game.</h2><p>Review a game to save your first lesson here.</p><button class="button primary" id="first-review">Review a game →</button></div>`}</section><div class="quiet-note">A quality index describes moves under a short engine search; it is not a measure of your worth or an official rating.</div>`;
  bindCoaching();
  $("#backup").onclick = backup;
  $("#first-review")?.addEventListener("click", () => navigate("review"));
  document.querySelectorAll("[data-saved]").forEach((b) => b.onclick = () => {
    parsed = parseGame(profile.games[Number(b.dataset.saved)].pgn);
    profile.currentPgn=parsed.pgn;
    profile.settings.playerColor = profile.games[Number(b.dataset.saved)].color;
    save();
    review = [];
    scores = [];
    ply = 0;
    navigate("review");
  });
}
function renderSettings() {
  $("#main").innerHTML = heading("MAKE YOURSELF AT HOME", "Your kind of chess corner.", "A few thoughtful settings. Everything stays on this device.") + `<div class="settings-grid"><section class="settings-card"><h2>You & your Knight</h2><label class="setting-row"><span><strong>What should I call you?</strong><small>A nickname is perfectly fine.</small></span><input id="name" maxlength="30" value="${esc(profile.settings.name)}"></label><label class="setting-row"><span><strong>A little conversation</strong><small>Choose how chatty your companion is.</small></span><select id="tone"><option value="quiet">Quiet</option><option value="friendly">Friendly</option><option value="chatty">Chatty</option></select></label><label class="setting-row"><span><strong>Your pieces</strong><small>Applies to new games and reviews.</small></span><select id="color"><option value="w">White</option><option value="b">Black</option></select></label><label class="setting-row"><span><strong>Practice opponent</strong><small>Approximate strength, not a rated Elo.</small></span><select id="level"><option value="0">Gentle</option><option value="3">Easygoing</option><option value="7">Thoughtful</option><option value="12">Challenging</option></select></label><button class="button primary" id="save-settings">Save preferences</button></section><section class="settings-card"><h2>Kind to your laptop</h2><p class="muted">One engine thread. A 32 MB engine hash. Full Stockfish 18 powers reviews and hints.</p><label class="setting-row"><span><strong>Analysis budget per position</strong><small>Longer searches use more CPU and battery.</small></span><select id="budget"><option value="120">Battery saver · 120 ms</option><option value="200">Balanced · 200 ms</option><option value="400">More detail · 400 ms</option></select></label><div class="settings-callout"><span>♧</span><p>Balanced gives each position one second. Deeper searches use more battery. A stronger analysis engine does not guarantee clearer teaching or a particular Elo.</p></div><h2 class="section-gap">Your data, your choice</h2><div class="button-group"><button class="button secondary" id="backup">Export backup</button><label class="button secondary file-button">Restore backup<input type="file" id="restore" accept=".json"></label></div><button class="text-button danger" id="reset-profile">Delete my local profile</button><p class="small-muted">Backups include games, practice positions and preferences. No account is needed.</p></section><section class="settings-card product-card"><div><div class="eyebrow">THE OFFLINE COMPANION</div><h2>A small purchase. A familiar friend.</h2><p>Planned pricing: ₹299 in India / $19.99 internationally, one time. This development version is free to test. Payments are not enabled.</p></div><span class="pill">Development preview · v0.1</span></section></div>`;
  $("#tone").value = profile.settings.tone;
  $("#level").insertAdjacentHTML("beforeend", '<option value="20">Full strength</option>');
  $("#budget").innerHTML = '<option value="300">Quick · 0.3 s</option><option value="1000">Balanced · 1 s</option><option value="3000">Deeper · 3 s</option>';
  $("#color").value = profile.settings.playerColor;
  $("#level").value = profile.settings.level;
  $("#budget").value = profile.settings.budget;
  $("#save-settings").onclick = () => {
    profile.settings = { ...profile.settings, name: $("#name").value.trim() || "Friend", tone: $("#tone").value, playerColor: $("#color").value, level: Number($("#level").value), budget: Number($("#budget").value) };
    save();
    toast("Preferences saved. Start a new game to apply your side.");
    shell();
  };
  $("#backup").onclick = backup;
  $("#restore").onchange = restore;
  appearanceSettings();
  $("#reset-profile").onclick = () => {
    showDialog(`<div class="dialog-heading"><h2>Start a fresh journal?</h2><button class="icon-button" data-close aria-label="Close">×</button></div><p>This removes saved games, practice positions and preferences from this app on this device. Export a backup first if you want to keep them.</p><div class="dialog-actions"><button class="button secondary" id="cancel-reset">Keep my journal</button><button class="button danger-button" id="confirm-reset">Delete local profile</button></div>`);
    $("#cancel-reset").onclick = () => $("#modal").close();
    $("#confirm-reset").onclick = () => {
      profile = structuredClone(EMPTY_PROFILE);
      parsed=null;review=[];scores=[];ply=0;variation=null;revealed.clear();
      save();
      $("#modal").close();
      shell();
      toast("Your local journal has been cleared.");
    };
  };
}
function backup() {
  download("little-knight-backup.json", JSON.stringify(profile, null, 2), "application/json");
}
async function restore(e) {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5e6) throw new Error("Please choose a backup smaller than 5 MB.");
    const imported = validateProfile(JSON.parse(await file.text()));
    showDialog(`<div class="dialog-heading"><h2>Restore your journal?</h2><button class="icon-button" data-close aria-label="Close">×</button></div><p>This replaces the current local profile with ${imported.games.length} games and ${imported.drills.length} practice positions from your backup.</p><div class="dialog-actions"><button class="button primary" id="confirm-restore">Restore backup</button></div>`);
    $("#confirm-restore").onclick = () => {
      profile = imported;
      save();
      $("#modal").close();
      shell();
      toast("Your journal is restored.");
    };
  } catch (err) {
    toast("Could not restore backup. " + err.message);
  }
  e.target.value = "";
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
}
function ratingInfo() {
  showDialog(`<div class="dialog-heading"><h2>A guess, with a little honesty.</h2><button class="icon-button" data-close aria-label="Close">×</button></div><p>This beta uses a simple rule based on average evaluation loss after the first four moves. It excludes positions beyond ±15 pawns and requires 12 eligible moves by your side.</p><p>The rule is <code>2200 − 9 × average centipawn loss</code>, clipped to 400–2200, with a decorative ±300 range. It has <strong>not been calibrated against player ratings</strong>. That range is not a statistical confidence interval.</p><p>It is for curiosity only. It is not a FIDE, Chess.com or Lichess rating. A real skill estimate needs many games, a defined rating pool, and validation on unseen players. Short engine searches and unusual positions can distort it.</p>`);
}
function about() {
  showDialog(`<div class="dialog-heading"><div class="brand"><img src="./icon.svg" alt="">Little Knight.</div><button class="icon-button" data-close aria-label="Close">×</button></div><h2>A calmer way to get better.</h2><p>Review your games, practise important moments, and enjoy a friendly opponent. Chess analysis and your journal run on this device.</p><p>This is a working development preview. The companion uses contextual, authored dialogue rather than an unrestricted chatbot. Rating guesses are uncalibrated. Checkout is not configured.</p><p>For an offline website, visit once online and wait for “Offline files ready”. Browser storage may be cleared by your browser. The packaged Windows app includes both engines locally. Web analysis downloads about 108 MB once, then caches it when browser storage permits.</p><a class="text-button" href="./licenses.html" target="_blank" rel="noopener">Engine licences and source →</a>`);
}
document.addEventListener("keydown", (e) => {
  if ($("#modal").open || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  if (view === "review" && parsed && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
    e.preventDefault();
    setPly(e.key === "Home" ? 0 : e.key === "End" ? parsed.moves.length : ply + (e.key === "ArrowRight" ? 1 : -1));
  }
});
document.addEventListener("visibilitychange", () => {
  if(document.hidden){boardView?.cancel();if(busy){if(view==='review')cancelAnalysis();else {stop();updateGameStatus();}}}else if(view==='play'&&!session.result&&session.mode==='computer'&&game.turn()!==profile.settings.playerColor)void botMove();
});
window.addEventListener("beforeunload", () => engine.reset());
window.addEventListener("online", () => {
  const c = $(".connection");
  if (c) c.innerHTML = "<i></i>Local-first";
});
window.addEventListener("offline", () => {
  const c = $(".connection");
  if (c) c.innerHTML = "<i></i>Offline";
});
try{parsed=profile.currentPgn?parseGame(profile.currentPgn):profile.games[0]?parseGame(profile.games[0].pgn):null;}catch{parsed=null;}
restorePlay();
shell();
void initAccount(user=>{
  stop();storageKey=user?'little-knight-user-'+user.id:'little-knight-profile';
  try{profile=validateProfile(JSON.parse(localStorage.getItem(storageKey)));}catch{profile=structuredClone(EMPTY_PROFILE);}
  try{parsed=profile.currentPgn?parseGame(profile.currentPgn):profile.games[0]?parseGame(profile.games[0].pgn):null;}catch{parsed=null;}
  review=[];scores=[];ply=0;revealed.clear();variation=null;drill=null;game=new Chess();savedPlayGame=game;savedPlayLastMove=null;lastMove=null;
  messages=[{who:'knight',text:'Welcome to your own chess corner. Let’s find your next lesson.'}];session=new GameSession();game=session.game;savedPlayGame=game;restorePlay();view='home';shell();
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").then(async (registration) => {
  await navigator.serviceWorker.ready;
  toast("Practice files ready offline. Full analysis is cached after its first successful load.");
}).catch(() => {
});
function canControl(square){
  if(!['play','practice'].includes(view)||busy||promotionChoice)return false;
  const p=game.get(square);return !!p&&p.color===game.turn()&&(view==='practice'||!session.result&&(session.mode==='local'||game.turn()===profile.settings.playerColor));
}
function applyAppearance(){
  const s=profile.settings;s.theme??='walnut';s.pieces??='classic';s.motion??='subtle';
  document.body.dataset.theme=s.theme;document.body.dataset.motion=s.motion;document.body.dataset.view=view;
}
function persistPlay(){
  if(view==='practice')return;
  try{localStorage.setItem(storageKey+'-session',JSON.stringify(session.serialize()));}catch{toast('Could not save this game. Export its PGN before leaving.');}
}
function restorePlay(){
  try{const raw=localStorage.getItem(storageKey+'-session');if(raw)session=GameSession.restore(JSON.parse(raw));else session=new GameSession();}catch{session=new GameSession();}
  game=session.game;savedPlayGame=game;lastMove=game.history({verbose:true}).at(-1)||null;savedPlayLastMove=lastMove;resultShown=false;
}
function soundMove(move){
  if(!profile.settings.sound||document.hidden)return;
  try{audio??=new AudioContext();void audio.resume();const osc=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime;osc.type='sine';osc.frequency.setValueAtTime(move.captured?240:440,t);osc.frequency.exponentialRampToValueAtTime(130,t+.065);gain.gain.setValueAtTime(.04,t);gain.gain.exponentialRampToValueAtTime(.001,t+.08);osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+.09);}catch{/* Sound remains optional. */}
}
function renderHome(){
  const continuing=!!session.game.history().length&&!session.result;
  $('#main').innerHTML=`<section class="club-hero"><div class="club-copy"><div class="eyebrow"><span class="club-rule"></span> A SMALL CLUB. AN INFINITE GAME.</div><h1>Make room<br>for your<br><em>next move.</em></h1><p>For the quiet thrill of a good idea.<br>Play, explore, and learn a little about your chess.</p><div class="club-actions"><button class="button primary" id="hero-play">${continuing?'Continue your game':'Take a seat'} <span>↗</span></button><button class="text-button" id="hero-review">Bring a game to review →</button></div><div class="club-caption"><span class="status-dot"></span> Stockfish 18 · your board, your pace</div></div><div class="knight-scene" aria-hidden="true"><div class="scene-halo"></div><span class="scene-index">01 — THE KNIGHT</span><div class="scene-board"></div><div class="hero-knight">${pieceSVG({type:'n',color:'w'})}</div><div class="scene-orbit orbit-one"></div><div class="scene-orbit orbit-two"></div><div class="scene-coordinate">Nf3<span>A different way forward.</span></div></div></section><section class="club-modes"><div class="section-label">CHOOSE YOUR TABLE <span>NO WAITING ROOM.</span></div><div class="mode-grid"><button class="mode-card" id="mode-computer"><span class="mode-number">01</span><span class="mode-mark">♞</span><h2>A worthy<br>opponent.</h2><p>Five engine presets. Hints and takebacks when you want them.</p><span class="mode-link">Play the computer ↗</span></button><button class="mode-card" id="mode-local"><span class="mode-number">02</span><span class="mode-mark">♜</span><h2>One board.<br>Two minds.</h2><p>Pass the device. Untimed, uninterrupted, together.</p><span class="mode-link">Local two-player ↗</span></button><button class="mode-card" id="mode-learn"><span class="mode-number">03</span><span class="mode-mark">◇</span><h2>Follow your<br>curiosity.</h2><p>Explore six opening ideas and three verified mate-in-one challenges.</p><span class="mode-link">Open the study ↗</span></button></div></section><section class="club-note"><span>LESS NOISE.<br>MORE CHESS.</span><p>No camera. No microphone. Your games and practice history stay on your device. Optional account login is available; chess works without it.</p><button class="text-button" id="home-preferences">Make this space yours →</button></section>`;
  $('#hero-play').onclick=()=>continuing?navigate('play'):gameSetup();$('#hero-review').onclick=()=>{navigate('review');if(!parsed)importDialog();};$('#mode-computer').onclick=()=>gameSetup('computer');$('#mode-local').onclick=()=>gameSetup('local');$('#mode-learn').onclick=()=>navigate('library');$('#home-preferences').onclick=()=>navigate('settings');
  const scene=$('.knight-scene');let frame=0;scene.onpointermove=e=>{if(profile.settings.motion!=='full'||matchMedia('(prefers-reduced-motion: reduce)').matches||e.pointerType!=='mouse')return;const rect=scene.getBoundingClientRect();cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{scene.style.setProperty('--rx',((e.clientY-rect.top)/rect.height-.5)*-6+'deg');scene.style.setProperty('--ry',((e.clientX-rect.left)/rect.width-.5)*6+'deg');});};scene.onpointerleave=()=>{cancelAnimationFrame(frame);scene.style.setProperty('--rx','0deg');scene.style.setProperty('--ry','0deg');};
}
function gameSetup(mode=session.mode){
  showDialog(`<div class="dialog-heading"><div><div class="eyebrow">TAKE YOUR SEAT</div><h2>A fresh possibility.</h2></div><button class="icon-button" data-close aria-label="Close">×</button></div><div class="setup-grid"><label>Game mode<select id="setup-mode"><option value="computer">Play the computer</option><option value="local">Local two-player</option></select></label><label>Computer difficulty<select id="setup-level">${PRESETS.map(p=>`<option value="${p.level}">${p.name}</option>`).join('')}</select></label><label>Your pieces<select id="setup-color"><option value="w">White</option><option value="b">Black</option></select></label><div><span class="field-label">Time control</span><p>Untimed · take the time to think.</p></div></div><p id="preset-description" class="small-muted"></p><details class="fen-details"><summary>Start from a FEN position</summary><label class="field-label" for="setup-fen">Optional FEN</label><input class="auth-input" id="setup-fen" placeholder="Leave empty for the starting position"></details><p class="small-muted">A new game replaces the saved play session. Export its PGN first if you want to keep it. Difficulty presets use engine skill controls; they are not calibrated Elo ratings.</p><p class="error-text" id="setup-error" role="alert"></p><button class="button primary full" id="setup-start">Let’s play ↗</button>`);
  $('#setup-mode').value=mode;$('#setup-level').value=profile.settings.level;$('#setup-color').value=profile.settings.playerColor;
  const update=()=>{const local=$('#setup-mode').value==='local';$('#setup-level').disabled=local;$('#setup-color').disabled=local;$('#preset-description').textContent=local?'One device, two players. Hints are disabled. Undo is allowed.':PRESETS.find(p=>p.level===Number($('#setup-level').value)).description;};$('#setup-mode').onchange=update;$('#setup-level').onchange=update;update();
  $('#setup-start').onclick=()=>{try{const fen=$('#setup-fen').value.trim()||undefined;if(fen)new Chess(fen);const options={mode:$('#setup-mode').value,fen};profile.settings.level=Number($('#setup-level').value);profile.settings.playerColor=$('#setup-color').value;save();$('#modal').close();newGame(options);}catch(err){$('#setup-error').textContent='Could not start: '+err.message;}};
}
function enhancePlay(){
  const local=session.mode==='local';document.body.dataset.view='play';
  $('.page-heading h1').innerHTML=local?'A conversation.<br><em>In sixty-four squares.</em>':'Find your<br><em>next good idea.</em>';
  $('.page-heading p').textContent=local?'Two players. One device. No engine assistance.':'A focused board, a thoughtful opponent, and room to improve.';
  $('.board-top strong').textContent=local?'Local two-player':'Little Knight';$('.board-top .player-sub').textContent=local?'Untimed · no assistance':PRESETS.find(p=>p.level===profile.settings.level)?.name+' · Stockfish';$('.board-top .pill').textContent=local?'Shared board':'Practice';
  $('#hint').disabled=local||!!session.result;$('#hint').title=local?'Hints are disabled in local two-player mode':'';
  $('.review-column').insertAdjacentHTML('afterbegin',`<section class="live-history"><div class="card-heading"><h2>On the board</h2><button class="text-button" id="focus-toggle">Focus mode</button></div><div id="play-history"></div><div class="session-actions"><button class="text-button" id="resign">Resign</button><button class="text-button" id="claim-draw">Claim draw</button>${local?'<button class="text-button" id="agree-draw">Agree a draw</button>':''}<button class="text-button" id="play-export">Export PGN</button></div><p class="small-muted" id="session-help"></p></section>`);
  $('#focus-toggle').onclick=()=>{document.body.classList.toggle('focus-mode');$('#focus-toggle').textContent=document.body.classList.contains('focus-mode')?'Show companion':'Focus mode';};
  $('#resign').onclick=()=>{showDialog(`<div class="dialog-heading"><h2>Resign this game?</h2><button class="icon-button" data-close aria-label="Close">×</button></div><p>${local?(game.turn()==='w'?'White':'Black'):'You'} will resign. You can review the game afterwards.</p><button class="button primary" id="confirm-resign">Resign game</button>`);$('#confirm-resign').onclick=()=>{$('#modal').close();stop();session.resign(local?game.turn():profile.settings.playerColor);persistPlay();finishGame();};};
  $('#claim-draw').onclick=()=>{try{stop();session.draw();persistPlay();finishGame();}catch(err){toast(err.message);}};
  $('#agree-draw')?.addEventListener('click',()=>{showDialog(`<div class="dialog-heading"><h2>Do both players agree?</h2><button class="icon-button" data-close aria-label="Close">×</button></div><p>Confirm only when both players have agreed to a draw.</p><button class="button primary" id="confirm-draw">Both players agree</button>`);$('#confirm-draw').onclick=()=>{$('#modal').close();stop();session.draw(true);persistPlay();finishGame();};});
  $('#play-export').onclick=()=>download('little-knight-game.pgn',game.pgn(),'application/x-chess-pgn');refreshPlayPanel();
}
function refreshPlayPanel(){
  const el=$('#play-history');if(!el||view!=='play')return;const moves=game.history({verbose:true});
  el.innerHTML=moves.length?moves.map((m,i)=>`${i%2===0?`<span class="history-number">${Math.floor(i/2)+1}.</span>`:''}<button class="history-move" data-history="${i+1}">${esc(m.san)}</button>`).join(''):'<p class="small-muted">Your first move starts the story.</p>';
  el.scrollTop=el.scrollHeight;el.querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>{stop();reviewPlayed();setPly(Number(b.dataset.history));});
  $('#resign').disabled=!!session.result;$('#claim-draw').disabled=!!session.result||!session.claimable();if($('#agree-draw'))$('#agree-draw').disabled=!!session.result;
  $('#session-help').textContent=session.result?session.result.reason+' · '+session.result.score:session.claimable()?'A draw may be claimed now: '+session.claimable()+'.':'3 repetitions / 50 moves: claimable. 5 repetitions / 75 moves: automatic.';
  $('#hint').disabled=session.mode==='local'||!!session.result;
}
function appearanceSettings(){
  $('.settings-grid').insertAdjacentHTML('afterbegin',`<section class="settings-card appearance-card"><div class="eyebrow">THE DETAILS ARE YOURS</div><h2>Make it feel like home.</h2><label class="setting-row"><span><strong>Board palette</strong></span><select id="board-theme"><option value="walnut">Walnut & ivory</option><option value="slate">Midnight slate</option><option value="olive">Olive club</option></select></label><label class="setting-row"><span><strong>Piece design</strong></span><select id="piece-style"><option value="classic">Sculpted</option><option value="outline">Outline</option></select></label><label class="setting-row"><span><strong>Motion</strong><small>Your system’s reduced-motion setting takes priority.</small></span><select id="motion-setting"><option value="off">Off</option><option value="subtle">Subtle</option><option value="full">Expressive</option></select></label><label class="setting-row"><span><strong>Move sounds</strong><small>Synthesised locally. No microphone access.</small></span><input id="sound-setting" type="checkbox" ${profile.settings.sound?'checked':''}></label><button class="button secondary" id="save-appearance">Save appearance</button></section>`);
  $('#board-theme').value=profile.settings.theme;$('#piece-style').value=profile.settings.pieces;$('#motion-setting').value=profile.settings.motion;
  $('#save-appearance').onclick=()=>{Object.assign(profile.settings,{theme:$('#board-theme').value,pieces:$('#piece-style').value,motion:$('#motion-setting').value,sound:$('#sound-setting').checked});save();applyAppearance();toast('Your space, just how you like it.');};
}
function renderLibrary(){
  $('#main').innerHTML=heading('THE STUDY','A little curiosity.<br><em>A lot of possibilities.</em>','A curated starting point. Explore the ideas, then play them on your board.')+`<section class="library-section"><div class="section-label">OPENING IDEAS <span>SIX WAYS TO BEGIN.</span></div><div class="opening-grid">${OPENINGS.map((o,i)=>`<button class="opening-card" data-opening="${i}"><span class="eyebrow">${o.eco}</span><h2>${esc(o.name)}</h2><code>${esc(o.moves)}</code><p>${esc(o.idea)}</p><span class="mode-link">Explore the position ↗</span></button>`).join('')}</div></section><section class="library-section"><div class="section-label">FORCING IDEAS <span>THREE MATES IN ONE.</span></div><div class="puzzle-grid">${CHALLENGES.map((p,i)=>`<button class="puzzle-card" data-puzzle="${i}"><span class="mode-number">0${i+1}</span><h2>${esc(p.title)}</h2><p>${p.fen.split(' ')[1]==='w'?'White':'Black'} to move · checkmate in one</p><span class="mode-link">Find the finish ↗</span></button>`).join('')}</div></section>`;
  document.querySelectorAll('[data-opening]').forEach(b=>b.onclick=()=>{const o=OPENINGS[Number(b.dataset.opening)],g=new Chess();o.moves.split(' ').forEach(m=>g.move(m));parsed=parseGame(g.pgn());review=[];scores=[];ply=parsed.moves.length;navigate('review');});
  document.querySelectorAll('[data-puzzle]').forEach(b=>b.onclick=()=>startDrill(CHALLENGES[Number(b.dataset.puzzle)]));
}

