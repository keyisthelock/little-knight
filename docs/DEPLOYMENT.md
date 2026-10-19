# Deployment

Production: https://little-knight-chess.pages.dev/

## Cloudflare Pages

1. Run `npm ci`, `npm run build`, and `npm test`.
2. Create a D1 database for accounts and execute `server/schema.sql` in its SQL console or through Wrangler.
3. Add a production D1 binding named **`AUTH_DB`** to the Pages project, selecting that database. Changes take effect on the next deployment.
4. Upload the **contents of `dist/`**, or a ZIP with `index.html` at its root, through Pages direct upload.
5. Wait for ZIP extraction and per-file status. Verify every asset uploaded, including `_worker.js` and `_routes.json`, then deploy.
6. Verify `/api/auth/me` returns `{ "user": null }` while signed out, and check chess analysis in a browser.

`_worker.js` is the bundled advanced-mode Worker. `_routes.json` invokes it only for `/api/*`; other assets stay static. Account responses bypass the service-worker cache. No API tokens or database credentials belong in frontend code or Git.

Never upload `node_modules`, `release`, `LocalProfile`, `.env`, `.dev.vars`, or a user's backup. Full WASM parts are under 25 MiB each. Runtime binaries are built from the pinned npm package; matching GPL source is included in Git and the website.

## Local and subsequent updates

The small `npm run dev` server supports static chess features, not the account API. Use Cloudflare's Worker/D1 local tooling with the same schema and binding for local account testing, or run the integration tests.

Keep the database/binding on updates. The schema uses `IF NOT EXISTS` and does not reset accounts. Increment the offline cache version when changing cached assets. Keep `/api/*` excluded from caches. Export a local backup before replacing a desktop installation.

The current account beta provides no email delivery, verified email ownership, password recovery, or self-service deletion. Do not advertise those features as complete.

Official references: [advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [bindings](https://developers.cloudflare.com/pages/functions/bindings/), [direct upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).
