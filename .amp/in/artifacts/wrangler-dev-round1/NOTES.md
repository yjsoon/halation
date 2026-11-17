# #370 round 1: local development and verify-howmuch on `wrangler dev`

- Revision: origin/main 9562e4c8 plus the round 1 working tree (env `local` in `apps/worker/wrangler.jsonc`, `scripts/local-worker.sh`, HTTP demo seed, `control-howmuch` and `dev:stack` on the Worker).
- Stack: `control-howmuch launch` (orb, Linux) and again on an Amp Mac satellite (macOS 27, Bun 1.4.4). Launch took 11 s on the orb and 5 s on the Mac. `doctor` printed `ok health={"ok":true}`, `ok web_title=Halation` and `ok d1=/tmp/howmuch-verify/<run-id>/d1`.
- Seed: `fixtures/demo-ledger.json` through the API. Balances Everyday 198008500, Saver 421500000, Travel Card -64830800, identical to the old SQLite `demo:seed`. Plan `local-plan` / `HowMuch Demo`.

## Recipes (orb, browser)

| Recipe | Steps | Observed |
| --- | --- | --- |
| first-owner-setup | wrong token, create owner, `/plan`, sign out, sign in | wrong-token alert text as recipe; `Ledger · Halation` after create; `/plan` lands on Ledger; `/api/auth/status` `setup_required:false`; sign in restores Ledger |
| first-owner-setup `setup-blocked` | `local-worker.sh start` with no token | `setup_required:true, setup_blocked:true` |
| quick-entry | `/add`, 6.80 Toast Box Verify, Save spend | `Toast Box Verify saved.`, Saved this session; API `amount -6800`, `acct-everyday` (quick-entry.json) |
| register-compose | Everyday register, + Add transaction, Inline Toast Verify, outflow 4.20, Save | `Inline Toast Verify saved.`; row 17 Nov 2026 $4.20; API `-4200` (register-compose.json) |
| scheduled-transactions | empty state, Add schedule -18.50 monthly, Enter now | `No active schedules.`; listed −$18.50 `Verify schedule`; `Entered 17 Nov 2026 … The schedule has advanced.`; API `-18500` (scheduled-entered.json) |
| rewards-card-edit | `/rewards/new`, Travel Card, UOB, rate 1, Save; edit, Delete card | card stored on `acct-credit` (rewards-created.json); after delete the store is `[]` |
| spending-breakdown | API Mar to May 2026; page `?range=all` | total 3292300 with Groceries (spending-report.json); page All shows $3,299.10 = recipe's $3,292.30 + today's $6.80 quick entry; Utilities largest |

## Mac satellite

- `ios-connection`: Simulator app (fresh `scripts/ios-xcodebuild.sh build`) → Connect to a server → `http://127.0.0.1:<api_port>` showed `Setup required` with no setup-token field. After owner setup, Sign in showed `Signed in as verifier`; Save opened Accounts with Everyday Account $198,008.50, Rainy Day Saver $421,500.00, Travel Card -$64,830.80. `/v1/plans` → `local-plan` / `HowMuch Demo`.
- `bun run dev:stack` (zsh): Worker `/health` ok on the chosen port; Vite on localhost:5173 proxied `/api/auth/status` (setup_blocked true without `.dev.vars`, as documented).
- `control-howmuch cleanup` on both hosts left no `workerd` process.

## Checks

`scripts/check.sh`: `bun test` 810 pass, 0 fail; web and worker typechecks; focus-zoom lint.
