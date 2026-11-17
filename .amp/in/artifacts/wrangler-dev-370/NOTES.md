# #370: can `wrangler dev` replace the local Bun/SQLite server?

- Revision: origin/main 1241de3f, unchanged. Investigation only.
- Config: repo-root `wrangler.jsonc` (self-host template: no redirect, placeholder D1 id). `apps/worker/wrangler.jsonc` was not used, because its top level redirects to howmuch.tk.sg.
- Probe seed script: `.amp/in/orb-backup/seed-over-http.ts` (seeds `fixtures/demo-ledger.json` through the public API).

## Commands

```sh
bun run --cwd apps/web build                                   # 10 s
bunx wrangler d1 migrations apply DB --local --persist-to /tmp/wdev/state --config wrangler.jsonc   # 23 migrations, 10 s
bunx wrangler dev --local --persist-to /tmp/wdev/state --config wrangler.jsonc --port 8799 --ip 127.0.0.1 \
  --test-scheduled --var HOWMUCH_API_TOKEN:wdev-bootstrap-token --var HOWMUCH_DEFAULT_PLAN_ID:local-plan   # /health in 3 s
bun .amp/in/orb-backup/seed-over-http.ts http://127.0.0.1:8799 wdev-bootstrap-token local-plan
```

## Results

| Check | Expected | Observed |
| --- | --- | --- |
| `/health`, `/api/auth/status`, `/add` | ok, setup required, SPA HTML | `{"ok":true}`, `setup_required:true`, 200 text/html |
| Seed over HTTP | same balances as `bun run demo:seed` | 3 accounts, 10 categories, 18 transactions in 511 ms; Everyday 198008500, Saver 421500000, Travel Card -64830800, identical to the SQLite seed |
| First-owner setup in browser | lands on Ledger with session cookie | `Ledger · Halation`, `__Host-howmuch_session` kept over http://127.0.0.1 |
| Quick entry recipe (`quick-spend`, `quick-recent`, `quick-register`) | Saved, row on register, -6800 via API | `Saved.` / `Toast Box Verify saved.`, register row 15 Nov 2026 $6.80 outflow, API `amount -6800`, balance 198008500 -> 198001700 |
| `/__scheduled?cron=5+0+*+*+*` | Worker's scheduled handler runs | 200, `scheduled_materialization` log with `failure_count 0` |
| Restart `wrangler dev` | data persists | balance still 198001700; state dir 768 KB |
| Vite dev server with `HOWMUCH_API_URL=http://127.0.0.1:8799` | ledger reads and writes through proxy | ledger listed Toast Box Verify; quick entry `Vite Proxy Verify` stored as -4200 |

Not checked: the iOS Simulator against `wrangler dev` (expected to behave like the Bun server, since it is plain HTTP on 127.0.0.1); a Mac host.
