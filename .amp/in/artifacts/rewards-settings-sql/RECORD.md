# Rewards report: snapshot settings read in SQL

## Revision

Code under test: `f6a79a56` on branch `rewards-settings-sql` (base `c9d75ae7`, `origin/main` at the time). This record and the copied script are the only later changes, under `.amp/in/artifacts/`.

## Fixture and setup

Fresh disposable stack: `control-howmuch launch` (seeds `fixtures/demo-ledger.json` into a private SQLite file under `/tmp/howmuch-verify/`). The script sets up the owner through the API, signs in, imports `fixtures/rewards-tracker-export.json` through Settings → Rewards import in the browser, then drives `/rewards`. Synthetic data only. The local stack serves reports through `ReportService` (bun:sqlite); the D1 `AsyncReportService` path is covered by `apps/api/tests/d1.test.ts` and was also checked on Miniflare's workerd D1 (see below).

## Commands

```sh
export PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH"
control-howmuch launch && control-howmuch doctor
PLAYWRIGHT_PATH=/tmp/pw/node_modules/playwright \
CHROME_PATH=$HOME/.agent-browser/browsers/chrome-156.0.8078.73/chrome \
  node .amp/in/artifacts/rewards-settings-sql/recipe.mjs
control-howmuch cleanup
```

Playwright 1.56.1 with the orb's Chrome for Testing 156. `recipe.mjs` is `rewards-skyline/recipe.mjs` with two added checks after the HTTP read.

## Expected and observed

The whole `features/rewards.md` flow (empty page, import, Travel Card as of 24 May 2026 at 1440 and 390, slip, Historical range, grid, payee grouping, card menu, batch edit, hide until next period) plus:

- `GET /api/reports/rewards?plan_id=local-plan&group=payee&to=2026-05-24` returns `miles_valuation` equal to the fixture's `settings.milesValuation` (read from the fixture file, not the code): expected `0.015`, observed `0.015`.
- `totals.reward_dollars` equals `miles × 0.015 + cashback`: observed `1033.1 × 0.015 = 15.4965`.
- The page shows the Miles group as `1,033 mi · $15.50` (`travel-card-open-1440.png`).

Result: 62 of 62 checks passed, no page errors (`recipe/checks.json`). The HTTP report is in `recipe/report.json`.

## Isolated checks

- `bun test apps/api`: 442 pass, 0 fail, including the new `D1 and SQLite rewards read snapshot settings with JSON.parse semantics` (14 payload shapes on both services). That test passed on `c9d75ae7` before the change and fails against plain `json_extract` and against the query without its `json_valid` guard.
- Miniflare 4.20260714 workerd D1 ran the same projection: object settings returned as JSON text; string, number, array-envelope and `null` payloads gave NULL settings; malformed and JSON5 payloads gave `payload_valid = 0`.
- `bun run typecheck` in `apps/worker`: clean.
