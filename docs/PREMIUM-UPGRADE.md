# Quiet Club upgrade — audit and verification

## Before implementation

The existing repository was inspected at `aebce4b`. It is a plain JavaScript/esbuild application with chess.js 1.4.0, Stockfish.js 18.0.8 in a Web Worker, localStorage journals, a Cloudflare Pages/D1 authentication API, and Electron packaging. Login, reviewed games, habit evidence, drills, settings, source notices and engine choices must remain compatible.

The baseline suite passed 18 checks. The baseline browser bundle was 97,274 bytes / 33,565 gzip; CSS was 35,964 / 7,813 gzip. The original renderer rebuilt all 64 square buttons on each selection/move. Unfinished play was held in memory only; restart/undo were blocked while the engine was thinking. Threefold/50-move draws were treated as immediate game termination via chess.js rather than as claims.

## Changes

- `session.js`: authoritative play session, legal moves, revision tracking, repetition counts, draw claims, automatic draws, resignation, agreed local draws, undo, validated PGN/FEN persistence.
- `board.js`: retained square/piece elements, pointer drag/drop and touch interaction, click moves, roving keyboard focus, immediate state updates, interruptible transform/opacity animations, capture ghosts, both castling pieces, reduced-motion/hidden-tab handling.
- `pieces.js`: original SVG silhouettes in sculpted and outline styles. No font or image dependency for pieces.
- `engine.js`: rejects superseded initialisation, ignores messages/errors from terminated workers, and distinguishes automatic from claimable move-count draws. UI checks run ID, session revision, mode and FEN before applying AI replies.
- `app.js`: editorial home, local two-player mode, focus toggle, playable opening library, verified mate-in-one challenges, new-game/FEN setup, live move history, resign/draw/export, result summaries, local saved sessions, escalating teaching retained.
- Appearance: charcoal/ivory/warm gold, walnut/slate/olive boards, original geometric knight scene, optional subtle/expressive motion, local move sounds, responsive layouts. No WebGL, perpetual animation loop, external font, new dependency or fake matchmaking.

## Performance and verification limits

The new JS bundle is 122,152 bytes / 41,527 gzip; minified CSS is 47,573 / 11,321 gzip. The added functionality costs approximately 11.5 KiB gzip across JS/CSS. Full-engine downloads and worker limits remain unchanged (one active worker, one CPU thread, 32 MiB hash; hash is not total memory).

Board render duration is exposed as `data-render-ms` on the board for browser QA. No measured before/after input latency, Lighthouse score, FPS or mobile-device result is claimed until an actual browser measurement is obtained. Local HTTP listeners launched by this execution environment were not reachable from its desktop browser. A normal VS Code terminal can run `node scripts/serve.mjs 4175` to expose localhost.

Automated checks include initial-position perft 20/400/8902; legal castling/rights/undo; en passant; all promotion choices; threefold claims/fivefold automatic draw; 50-move claims/75-move automatic draw with mate precedence; stalemate/material/resignation/agreement; PGN save/restore and repetition; legal opening sequences; verified mating solutions; stale-worker isolation; and existing engine, teaching, backup and account integration checks.

## Explicit boundaries

Play is **untimed**. Timed clocks, timeout adjudication, online multiplayer, matchmaking and 3D were not added. No inert controls advertise them. Threefold/50-move claims are supported for the current position; intended-next-move arbiter claims are not implemented. Insufficient-material adjudication uses chess.js and is not a complete arbitrary-position dead-position proof solver. Authentication still has the previously documented beta limits; this visual/gameplay upgrade does not silently migrate accounts or journals.

The public production deployment stays unchanged until the owner reviews the changes. Use the existing Cloudflare Pages project and its existing account database for production; do not create a new site/database. To preview, upload the built `dist` contents to a Preview environment. Production deployment uses the same upload after review. Preserve the `AUTH_DB` binding and source/GPL notices. Source and build steps are described in README.md and DEPLOYMENT.md.
