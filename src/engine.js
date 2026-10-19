import { Chess } from "chess.js";
export class Engine {
  constructor(onStatus = () => {
  }) {
    this.onStatus = onStatus;
    this.worker = null;
    this.pending = null;
    this.initializing = null;
    this.initReject = null;
    this.initTimer = null;
    this.variant = null;
    this.loadController = null;
    this.wasmURL = null;
  }
  async init(variant = "lite") {
    if (this.variant && this.variant !== variant) {
      if (this.pending || this.initializing) throw new Error("Wait for the current engine operation to finish.");
      this.reset();
    }
    if (this.worker && !this.initializing) return;
    if (this.initializing) return this.initializing;
    this.variant = variant;
    this.onStatus(variant === "full" ? "Loading full Stockfish 18…" : "Loading practice engine…");
    this.loadController = new AbortController();
    const controller = this.loadController;
    const ready = new Promise((resolve, reject) => {
      const start = async () => {
        try {
          this.initReject = reject;
          let workerURL = "./engine/stockfish.js";
          if (variant === "full") {
            const response = await fetch("./engine/full-v18/manifest.json", { signal: controller.signal });
            if (!response.ok) throw new Error("The full analysis engine is not available. Reconnect and try again.");
            const manifest = await response.json();
            if (!Array.isArray(manifest.parts) || manifest.parts.length > 20) throw new Error("Invalid analysis engine manifest.");
            const chunks = [];
            for (let i = 0; i < manifest.parts.length; i++) {
              const name = manifest.parts[i];
              if (!/^part-\d+\.bin$/.test(name)) throw new Error("Invalid engine part.");
              this.onStatus(`Loading full Stockfish · ${Math.round(i / manifest.parts.length * 100)}%`);
              const part = await fetch("./engine/full-v18/" + name, { signal: controller.signal });
              if (!part.ok) throw new Error("An engine download failed. Reconnect and try again.");
              chunks.push(await part.arrayBuffer());
            }
            if (controller.signal.aborted) throw new Error("Analysis stopped.");
            const blob = new Blob(chunks, { type: "application/wasm" });
            if (blob.size !== manifest.bytes) throw new Error("The analysis engine download was incomplete.");
            this.wasmURL = URL.createObjectURL(blob);
            workerURL = "./engine/stockfish-full.js#" + encodeURIComponent(this.wasmURL);
          }
          if (controller.signal.aborted) throw new Error("Analysis stopped.");
          this.worker = new Worker(workerURL);
          this.initTimer = setTimeout(() => {
            this.reset("Stockfish took too long to load. Reload and try again.");
          }, 3e4);
          this.worker.onerror = () => {
            this.reset("Stockfish could not start. Check that the engine assets are installed.");
          };
          this.worker.onmessage = (event) => {
            for (const line of String(event.data).split("\n")) {
              if (line === "uciok") {
                this.send("setoption name Threads value 1");
                this.send("setoption name Hash value 32");
                this.send("isready");
              }
              if (line === "readyok") {
                clearTimeout(this.initTimer);
                this.initReject = null;
                this.initializing = null;
                this.onStatus(variant === "full" ? "Full Stockfish 18 · maximum skill" : "Practice engine · skill adjusted");
                resolve();
              }
              this.receive(line);
            }
          };
          this.send("uci");
        } catch (e) {
          if (this.loadController === controller) this.reset(e.message);
          reject(e);
        }
      };
      void start();
    });
    this.initializing = ready;
    return ready;
  }
  send(command) {
    this.worker?.postMessage(command);
  }
  receive(line) {
    const p = this.pending;
    if (!p) return;
    if (line.startsWith("info ") && !line.includes(" upperbound") && !line.includes(" lowerbound")) {
      const score = line.match(/score (cp|mate) (-?\d+)/), pv = line.match(/\bpv (.+)/), depth = line.match(/\bdepth (\d+)/);
      if (score && pv) {
        const n = Number(score[2]);
        const relative = score[1] === "mate" ? n > 0 ? 1e4 : -1e4 : n;
        p.result = { whiteScore: relative * (p.turn === "w" ? 1 : -1), mate: score[1] === "mate" ? n : null, pv: pv[1], depth: Number(depth?.[1] || 0), fen: p.fen };
      }
    }
    if (line.startsWith("bestmove ")) {
      clearTimeout(p.timer);
      this.pending = null;
      const bestMove = line.split(" ")[1];
      if (!p.result) p.reject(new Error("The engine returned no evaluation. Please try again."));
      else p.resolve({ ...p.result, bestMove });
    }
  }
  async evaluate(fen, budget = 200, level = 20, fullFenHistory = null, variant = "lite") {
    await this.init(variant);
    if (this.pending) throw new Error("Analysis is already running.");
    const game = new Chess(fen);
    if (game.isGameOver()) return { fen, whiteScore: game.isCheckmate() ? game.turn() === "w" ? -1e4 : 1e4 : 0, mate: game.isCheckmate() ? 0 : null, pv: "", depth: 0, bestMove: "(none)" };
    return new Promise((resolve, reject) => {
      this.pending = { fen, turn: game.turn(), resolve, reject, result: null, timer: setTimeout(() => {
        this.reset();
      }, 12e3) };
      this.send("setoption name Skill Level value " + level);
      this.send("setoption name UCI_LimitStrength value false");
      this.send(fullFenHistory || "position fen " + fen);
      this.send("go movetime " + Math.max(80, Math.min(5e3, budget)));
    });
  }
  reset(message = "Analysis stopped.") {
    this.loadController?.abort();
    this.loadController = null;
    clearTimeout(this.initTimer);
    const initReject = this.initReject;
    this.initReject = null;
    this.initializing = null;
    if (initReject) initReject(new Error(message));
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.worker?.terminate();
    this.worker = null;
    this.variant = null;
    if (this.wasmURL) {
      URL.revokeObjectURL(this.wasmURL);
      this.wasmURL = null;
    }
    this.onStatus("Engine paused");
  }
}
