import { Chess } from "chess.js";
import { explainMove, TOPICS } from './coach.js';
export const SAMPLE_PGN = `[Event "A little lesson in development"]
[White "You"]
[Black "Little Knight"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1`;
export function parseGame(pgn) {
  if (typeof pgn !== "string" || pgn.length > 25e4) throw new Error("Please import one PGN game smaller than 250 KB.");
  const game = new Chess();
  game.loadPgn(pgn);
  const moves = game.history({ verbose: true });
  if (!moves.length) throw new Error("This PGN has no moves to review.");
  if (moves.length > 500) throw new Error("Please use a game with fewer than 500 half-moves.");
  return { moves, fens: [moves[0].before, ...moves.map((m) => m.after)], headers: game.getHeaders(), pgn: game.pgn() };
}
export function uciMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), ...uci[4] ? { promotion: uci[4] } : {} };
}
export function sanLine(fen, line, limit = 5) {
  const game = new Chess(fen), out = [];
  for (const uci of (line || "").split(" ").slice(0, limit)) {
    try {
      out.push(game.move(uciMove(uci)).san);
    } catch {
      break;
    }
  }
  return out.join(" ");
}
export function classify(loss, best) {
  if (best) return { name: "Best move", kind: "best", symbol: "★" };
  if (loss < 35) return { name: "Good move", kind: "good", symbol: "✓" };
  if (loss < 100) return { name: "Inaccuracy", kind: "inaccuracy", symbol: "?!" };
  if (loss < 250) return { name: "Mistake", kind: "mistake", symbol: "?" };
  return { name: "Blunder", kind: "blunder", symbol: "??" };
}
export function buildReview(parsed, scores, playerColor = "w") {
  return parsed.moves.map((move, i) => {
    const before = scores[i], after = scores[i + 1];
    const direction = move.color === "w" ? 1 : -1;
    const loss = Math.max(0, (before.whiteScore - after.whiteScore) * direction);
    const bestUci = (before.pv || "").split(" ")[0];
    const actual = move.from + move.to + (move.promotion || "");
    const label = classify(loss, actual === bestUci);
    const item = { ...move, index: i, loss, label, bestUci, bestLine: sanLine(move.before, before.pv), before: {...before,fen:move.before}, after: {...after,fen:move.after}, isPlayer: move.color === playerColor };
    item.lesson = explainMove(item);
    return item;
  });
}
export function reviewSummary(review) {
  const own = review.filter((m) => m.isPlayer);
  const ordinary = own.filter((m) => m.index >= 8 && Math.abs(m.before.whiteScore) < 1500 && Math.abs(m.after.whiteScore) < 1500);
  const averageLoss = ordinary.length ? ordinary.reduce((a, m) => a + Math.min(m.loss, 1e3), 0) / ordinary.length : null;
  const guess = ordinary.length >= 12 ? Math.round(Math.max(400, Math.min(2200, 2200 - averageLoss * 9)) / 50) * 50 : null;
  return {
    own,
    ordinary,
    averageLoss,
    guess,
    best: own.filter((m) => m.label.kind === "best").length,
    mistakes: own.filter((m) => ["mistake", "blunder"].includes(m.label.kind)),
    quality: own.length ? Math.round(100 * own.reduce((sum, m) => sum + Math.exp(-Math.min(m.loss, 1e3) / 180), 0) / own.length) : 0
  };
}
export function gameKey(pgn, color) {
  let hash = 2166136261;
  for (const c of pgn + color) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
export function addReview(profile, parsed, review, color) {
  const key = gameKey(parsed.pgn, color);
  const existing = profile.games.find((g) => g.id === key);
  if (existing?.lessons) return profile;
  const summary = reviewSummary(review);
  const drills = summary.mistakes.filter((m) => m.bestUci && !["(none)", "0000"].includes(m.bestUci)).sort((a, b) => b.loss - a.loss).slice(0, 5).map((m) => ({ id: key + "-" + m.index, fen: parsed.fens[m.index], bestUci: m.bestUci, line: m.bestLine, played: m.san, loss: m.loss, solved: false, topic:m.lesson.topic, evidence:m.lesson.evidence, attempts:0,successes:0,hints:0 }));
  const lessons=summary.mistakes.map(m=>({index:m.index,topic:m.lesson.topic}));
  return {
    ...profile,
    currentPgn: parsed.pgn,
    games: [{ id: key, date: existing?.date || new Date().toISOString(), quality: summary.quality, mistakes: summary.mistakes.length, color, pgn: parsed.pgn,lessons }, ...profile.games.filter(g=>g.id!==key)].slice(0, 100),
    drills: [...profile.drills, ...drills.filter(d=>!profile.drills.some(old=>old.id===d.id))].slice(-100)
  };
}
export const EMPTY_PROFILE = { version: 1, games: [], drills: [], sessions: 0, settings: { tone: "friendly", budget: 1e3, level: 3, playerColor: "w", name: "Friend" } };
export function validateProfile(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.games) || !Array.isArray(value.drills) || value.games.length > 100 || value.drills.length > 100) throw new Error("This is not a supported Little Knight backup.");
  const cleanText = (text, limit) => String(text ?? "").slice(0, limit);
  const safeInteger = (number, max) => Number.isFinite(number) ? Math.min(max, Math.max(0, Math.round(number))) : 0;
  const drills = value.drills.map((d) => {
    const c = new Chess(d.fen);
    c.move(uciMove(d.bestUci));
    return {
      id: cleanText(d.id, 80),
      fen: c.undo().before,
      bestUci: cleanText(d.bestUci, 5),
      line: cleanText(d.line, 300),
      played: cleanText(d.played, 30),
      loss: safeInteger(d.loss, 2e4),
      solved: d.solved === true
      ,topic:TOPICS[d.topic]?d.topic:'calculation',evidence:cleanText(d.evidence,600),
      attempts:safeInteger(d.attempts,10000),successes:safeInteger(d.successes,10000),hints:safeInteger(d.hints,10000),
      due:Number.isFinite(Date.parse(d.due))?new Date(d.due).toISOString():null,
      lastAttempt:Number.isFinite(Date.parse(d.lastAttempt))?new Date(d.lastAttempt).toISOString():null
    };
  });
  const games = value.games.map((g) => {
    if (typeof g.pgn !== "string" || g.pgn.length > 25e4) throw new Error("Invalid saved game.");
    const parsed = parseGame(g.pgn);
    const date = new Date(g.date);
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid saved date.");
    return {
      id: cleanText(g.id, 80),
      date: date.toISOString(),
      quality: safeInteger(g.quality, 100),
      mistakes: safeInteger(g.mistakes, 500),
      color: g.color === "b" ? "b" : "w",
      pgn: parsed.pgn,
      ...(Array.isArray(g.lessons)?{lessons:g.lessons.filter(l=>TOPICS[l.topic]&&Number.isInteger(l.index)&&l.index>=0&&l.index<parsed.moves.length).slice(0,250).map(l=>({index:l.index,topic:l.topic}))}:{})
    };
  });
  const s = value.settings || {};
  return {
    version: 1,
    games,
    drills,
    sessions: Number.isFinite(value.sessions) ? Math.max(0, value.sessions) : 0,
    settings: {
      name: String(s.name || "Friend").slice(0, 30),
      tone: ["quiet", "friendly", "chatty"].includes(s.tone) ? s.tone : "friendly",
      budget: [300, 1e3, 3e3].includes(s.budget) ? s.budget : 1e3,
      level: [0, 3, 7, 12, 20].includes(s.level) ? s.level : 3,
      playerColor: s.playerColor === "b" ? "b" : "w"
    },
    ...(typeof value.currentPgn==='string'&&value.currentPgn.length<=250000?{currentPgn:parseGame(value.currentPgn).pgn}:{})
  };
}
