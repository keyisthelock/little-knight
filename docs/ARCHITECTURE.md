# Architecture and boundaries

## Chess and coaching

chess.js validates moves. `Engine` runs one Stockfish worker, switches Lite/full variants, and cancels stopped work. Full assets load lazily. UCI scores are normalised to White's perspective; review loss is then measured from the mover's perspective.

`coach.js` replays engine lines before displaying them. Material lessons count captures in the displayed line. Mate lessons require mate scores against the correct side. Other positions use a calculation prompt. These are limited heuristics, not a comprehensive tactical detector.

Each game contributes lesson tags once. Habit summaries use distinct games from the most recent 20 analysed reviews; three games with a theme trigger the recurring label. This threshold is a product rule, not statistical significance.

Practice stores attempts, independent successes, hint use and due times. Independent recall schedules approximately 1, 2, 4, 8 and at most 14 days between repeats; guided or incorrect answers become due after 10 minutes. Selection prioritises a frequent theme and less-practised positions.

## Local history

Guests use `little-knight-profile`; signed-in users use an account-specific local key. Login switches profiles and resets transient game/review state. It does not silently copy a guest journal, upload chess history, or merge people sharing a device. Backups allow deliberate transfers.

The app restores the profile's last imported game, or most recently reviewed game. A new profile has no game; demos are explicit. Scores are recomputed for a new review, while history and lessons persist locally. Local storage is not an encrypted vault or a server-enforced privacy boundary.

## Authentication

The Pages Worker exposes `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me`. D1 stores accounts, hashed sessions and temporary rate counters. Plaintext passwords are never stored or logged.

Sessions have 256 random bits, are stored as hashes, use Secure/HttpOnly/SameSite cookies and expire after 24 hours. Login rotates the current cookie; logout deletes its session. Mutations require matching Origin and JSON. Bodies are capped at 2 KiB. SQL uses prepared statements. Per-IP/email counters limit attempts; account creation has a separate daily limit.

PBKDF2-SHA256 currently uses Cloudflare Web Crypto's 100,000-iteration ceiling. This prototype needs a stronger audited authentication architecture, verified email, recovery, deletion and abuse monitoring before commercial launch.

## Offline desktop

Electron serves bundled assets with a secure local protocol, node integration disabled, context isolation and renderer sandboxing. The Chromium profile lives beside the portable executable. Chess/coaching work offline; login is a website feature. No language model, camera, microphone, local network server or administrator privileges are required.
