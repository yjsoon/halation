# createAccount reseed: run record

- Revision: origin/main 35e3632 plus this commit (branch refactor/workaround-clusters).
- Change: `createAccount` delegates to `withOpeningBalance` for id-less bodies; the cross-plan
  account-id guard is one helper (`assertAccountIdNotInOtherPlan`) shared by `ensureAccount`
  and `upsertAccount`. The guard in `ensureAccount` now runs before the no-op insert (same outcome).
- Fixture: two local API processes on one temp SQLite file (default plans `plan-a` and `plan-b`,
  token `tok`), synthetic accounts only. Nothing remote is touched.
- Steps: `./e2e-clusters.sh <worktree> after.txt` (script and driver in this directory). The
  transcript is the HTTP responses plus selected SQLite rows, ids normalised.
- Expected: transcript identical to `before.txt` (captured on unmodified origin/main), in particular
  c1.a balance 5000 (server-minted id folds balance), c1.b balance 7000, c1.c 400 "Account belongs to
  another plan", c1.f 400 "Account not found".
- Observed: `diff before.txt after.txt` is empty. `cd apps/api && bun test`: 443 pass, 0 fail.
  `bun run --cwd apps/worker typecheck`: clean. Bun 1.4.0 `build-ios-engine.ts check`: up to date.
