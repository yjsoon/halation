# Insights implicit report range: E2E record

- Revision under test: `559fc2afd70f3c1c35336ce9f638f1e46fe821a5` (branch `insights-implicit-range`); "before" is `origin/main` `90e54972999180eb349600b2862ded322873746c`.
- Fixture: `control-howmuch launch` (run `20261102T232136-6868`), seeded `fixtures/demo-ledger.json`, plan `local-plan`. Synthetic data only.
- Setup: one synthetic outflow with a mistyped year, posted through the API:
  `POST /v1/plans/local-plan/transactions {"transaction":{"account_id":"acct-everyday","date":"0010-04-26","amount":-12340,"payee_name":"Mistyped Year Shop","import_id":"e2e-mistyped-year-1"}}`
- Before: a copy of that database served by `bun apps/api/src/server.ts` from an `origin/main` worktree.
- After: the verify stack's API at the revision under test (same data).

## Steps and results

Both iOS Insights calls without `from` (`GET /api/reports/age-of-money?plan_id=local-plan&interval=month`, and the same for `net-worth`):

| Report | Before | After |
| --- | --- | --- |
| age-of-money | HTTP 400 `Reports support at most 3660 periods; use a coarser interval or shorter range` (`before-age-of-money.json`) | HTTP 200, 3661 periods `0010-04` .. `2026-11`; demo months Mar/Apr/May 2026 = 2 / 41 / 67 days; `0010-04` unmatched 12340 (`after-age-of-money.summary.json`) |
| net-worth | HTTP 400, same message (`before-net-worth.json`) | HTTP 200, 3660 periods `1721-12` .. `2026-11` (`after-net-worth.summary.json`) |

Web recipe `.cursor/skills/verify-howmuch/features/age-of-money.md` (`aom-open`, `aom-default-all`, `aom-history`): signed in as `verifier`, opened `/age-of-money` with no query. Title `Money age · Halation`, headline `67 days`, history Mar/Apr/May 2026 = 2 / 41 / 67 days, no error panel (`web-money-age-all.png`). The recipe's expected `67 days` matches.

Automated: `cd apps/api && bun test` 441 pass, 0 fail, including the new regression test in `tests/report-aggregates.test.ts` (fails on `origin/main` with the production message). `bun run check:ios-engine` (Bun 1.4.0): up to date.

iOS (Amp Mac satellite, macos-27, Xcode default, iOS Simulator): `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/LocalEngineTests -only-testing:HowMuchTests/LocalModeTests` at `559fc2a` with the rebuilt `howmuch-engine.js`: fresh build-for-testing, 14 tests, 0 failures, `** TEST EXECUTE SUCCEEDED **`. The bundled engine is byte-identical to a fresh `build:ios-engine` of this source (`check:ios-engine`: up to date).
