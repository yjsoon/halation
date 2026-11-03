# Starter categories after the first account

Fix revision: the commit that last changed this file; the E2E below was rerun there after the first fix commit 6a4e0e4 (branch `starter-categories-after-first-account`, based on origin/main 34d5dc8).
Source: Persona QA thread T-01a18296 uncommitted work (base 46f3de3, ancestor of 34d5dc8), recovered with download_thread_changes (capture cap_01a182dcb68977bf902fe239bff0c17c). Only the starter-category parts are taken: `apps/web/src/lib/starter-categories.ts`, the two create methods in `apps/web/src/api/client.ts`, and the seeding trigger in `apps/web/src/state/plan.tsx`. Other Persona onboarding changes are left out.

## Reproduction (Persona code merged onto 34d5dc8, unseeded SQLite stack)

- API `HOWMUCH_DB_PATH=/tmp/repro/howmuch.sqlite`, fresh database, no `demo:seed`; web via Vite.
- Browser: Set up Halation, user `verifier`, fake password, setup token. Lands on Ledger.
- `GET /v1/plans/local-plan/categories` already returns 4 `starter:local-plan:grp:*` groups with 14 categories, before any account exists.
- `POST /v1/plans/local-plan/import_snapshot` with a one-account snapshot: `HTTP 409 plan_not_empty` (`repro/import-after-setup.txt`).

## Red then green (`apps/web/src/lib/starter-categories.test.ts`)

Runs the real web helper against the real API handler (SQLite backend), with fetch routed into it and chosen POSTs dropped as network failures.

- On the Persona helper: 3 of 4 fail (a partial run is marked done; a failed group is marked done; starters added beside the user's own categories). The deleted-starter case passes.
- On the fix: 4 of 4 pass.

## E2E after the fix (fresh unseeded stack, `/tmp/fix`)

1. Setup in the browser, lands on Ledger. Categories: 0 groups (`fix/1-categories-after-setup.txt`, `fix/1-after-setup-empty-ledger.png`).
2. `/accounts/new`, Name `Everyday Fake`, Create account. Lands on the register. Categories: the 4 starter groups (4/4/2/4) (`fix/2-categories-after-first-account.txt`). The compose row's Category list offers Groceries, Salary and the rest (`fix/2-register-after-first-account.png`).
3. Two reloads: still 4 groups and 14 categories; browser marker `done` (`fix/3-counts-after-reloads.txt`).
4. New fresh database `/tmp/fix2`, storage cleared, setup again, then `import_snapshot` with the same snapshot: `HTTP 201`, imported 1 group, 1 category, 1 account (`fix/4-import-after-setup.txt`). Ledger reload adds nothing: groups `["grp-mine"]` (`fix/4-categories-after-import-and-load.txt`).
5. Creating a second account (`Second Fake`) on the imported plan adds no starters: groups `["grp-mine"]` (`fix/5-categories-after-account-on-imported.txt`).

Step 2 also checked the compose row's accessibility tree: 4 of the options Groceries, Salary, Travel and Housing are present.

Follow-up in this commit: the helper marks the plan pending before it reads categories, so a failed read straight after the first account still retries on the next load.

Final rerun: all five steps repeated on fresh databases at merge fdf7e8b (origin/main 754c643 merged in, disjoint iOS release-script changes), with the same results as above.

## Review round 1 fixes (Opus 5.5 high, thread T-01a1a17f)

- Medium: a stale `pending` marker could seed an empty plan on load (recreated server, same `local-plan`). The helper now reads accounts with categories and, when the plan has no live account, clears the marker and creates nothing.
- Low: permanent 4xx refusals (for example 409 ynab_mirror_plan) retried on every load. These now end the run as done. Network errors, 5xx, 401, 408 and 429 stay retryable.
- Low: the test comment now says it covers SQLite only.
- Red then green: the two new tests (pending marker on an account-less plan; YNAB mirror plan) fail on the round-1 helper (4 pass, 2 fail) and pass on the fix (6 pass).
- E2E rerun on fresh databases with the fix. Steps 1 to 3 gave the same results as above. Then the reviewer's case: the marker was set to `pending` in the browser, the server was recreated (`/tmp/fix2`) and setup run again. After setup and a reload, the marker was cleared (`null`), there were 0 groups (`fix/4-categories-after-setup-with-stale-pending.txt`) and `import_snapshot` returned 201. Steps 4 and 5 then held: groups stayed `["grp-mine"]` after load and after a second account.

## Other checks

- `cd apps/web && bunx tsc --noEmit`: clean.
- `bun test apps/web/src/lib apps/api/tests/plan-snapshot.test.ts apps/api/tests/category-management.test.ts`: 287 pass, 0 fail (after the review fixes).
