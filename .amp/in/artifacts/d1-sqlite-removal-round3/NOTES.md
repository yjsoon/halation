# #370 round 3: delete the bun:sqlite ledger path

Revision: rebased on origin/main b795a668 (first checked on 3d9eb8e2, then 9bfd27a8, 2c80350e and 1ee099dd; the engine bundle was regenerated after each rebase). Synthetic data only.

## What went

- `apps/api/src/server.ts` (the Bun server and `bun run api:dev`), `src/db.ts` (SQLite migration runner), `src/reports.ts` (synchronous reports) and `apps/api/migrations/` (the 27 SQLite migrations).
- `SQLiteAuthStore`, `SqliteRepositoryDatabase`, the `transaction()` member of `RepositoryDatabase` and `D1Database`, and the SQLite fallback in `createHandler` (it now requires `repo`, `reports` and `auth`).
- The 41 `LedgerRepository` methods `D1LedgerRepository` overrode, and their private helpers. `LedgerRepository` is now an abstract base holding the shared read paths and a few plain-statement writes (account preferences, Rewards Tracker data, YNAB transfer relinking), with the guarded D1 writes as abstract members.
- `ApiConfig.dbPath`, `port`, `hostname` and `loadConfig` (`HOWMUCH_DB_PATH`, `HOWMUCH_PORT`, `HOWMUCH_HOST`), which only the Bun server read.
- The engine's `bun:sqlite` shim: the bundle builds byte-identically without it.

The error classes moved to `src/errors.ts`.

## Tests

- `bun test`: 767 pass, 0 fail. Per file against round 2's run: the only drop is `read-round-trips.test.ts` 3 to 2, the nested-batch test for `SqliteRepositoryDatabase`, which no longer exists. Every other difference is a test added by the two commits since round 2.
- `read-round-trips`: the round-trip budget is now measured on D1 alone (it compared D1 against the SQLite base repository).
- `report-aggregates`: the aggregate-backed net worth and age of money are still checked against an independent full-history scan. That scan is the retired `ReportService.netWorth` and `ageOfMoney`, kept test-only in `tests/helpers/reference-reports.ts`.
- `d1.test.ts` rewards: the SQLite comparison is gone; each case already asserted its own expected values.
- `account-basics`: seeds owners through `D1AuthStore`.

## End to end

- `wrangler dev` (`scripts/local-worker.sh prepare` then `start` on port 18788, synthetic token): `/api/auth/status` reports setup required; `GET /v1/plans` lists the prepared plan; `POST /v1/plans/local-plan/accounts` creates Cash with a balance of 10000 milliunits; `GET /api/reports/net-worth` returns net worth 10000 for it.
- `bun run smoke`: health, user, plans, accounts, categories, transactions, spending report, net-worth report and quick entry all ok.
- YNAB API chain against the synthetic stub (as round 2): 6 transactions imported, 0 balance mismatches; parity verified, 20 source objects; bootstrap validated 6 transactions. Loading this bootstrap and round 2's into fresh D1 databases gives identical plans, accounts, payees, categories, transactions, subtransactions, schedules, raw objects and sync cursor; only generated IDs and `source_ref` differ.
- YNAB web export (`import:ynab-export --register Register.csv`): 6 imported, 0 failed, 1 inferred pair, 3 accounts, Everyday 827.50, Old Card 0, Savings 100.00, as in round 2.

## Review

A Claude Code review on Fable 5.2 found nothing blocking. Fixed from it: SQLite sentences left in `docs/api-contract.md`, `docs/architecture.md` and `docs/frontend/brief.md`; the `LedgerRepository` comment now names the writes it still owns; a type check that could no longer fail was removed; `read-round-trips.test.ts` lost its single-caller repository parameter. It also found that the first HowMuchTests run had set the wrong simulator accessibility defaults.

## Checks

At b795a668 (main's three new commits touch iOS Swift, web and a script, not the API or engine; the rebase was clean):

- web and worker typecheck: pass
- verify-ios-focus-zoom, verify-ios-confirm-presentation, verify-ios-disclosure-chevron: pass
- build-ios-engine check (bun 1.4.0): up to date
- bun test: 769 pass, 0 fail
- bun run smoke: all nine steps ok
- HowMuchTests on an Amp Mac satellite (accessibility defaults set, cold build): 822 tests, 1 skipped, 0 failures

At 1ee099dd:

- web and worker typecheck: pass
- verify-ios-focus-zoom, verify-ios-confirm-presentation, verify-ios-disclosure-chevron: pass
- build-ios-engine check (bun 1.4.0): up to date
- bun test: 769 pass, 0 fail
- bun run smoke: all nine steps ok
- HowMuchTests on an Amp Mac satellite (accessibility defaults set, cold build): 822 tests, 1 skipped, 0 failures

At 2c80350e:

- web and worker typecheck: pass
- verify-ios-focus-zoom, verify-ios-confirm-presentation, verify-ios-disclosure-chevron: pass
- build-ios-engine check (bun 1.4.0): up to date
- bun test: 768 pass, 0 fail (767 before main's 2c80350e added one)
- bun run smoke: all nine steps ok
- HowMuchTests on an Amp Mac satellite (accessibility defaults set as `apps/ios/AGENTS.md` says, cold build): 822 tests, 1 skipped, 0 failures

At 9bfd27a8:

- HowMuchTests on an Amp Mac satellite (`scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`, simulator with `AccessibilityEnabled` and `ApplicationAccessibilityEnabled` set as `apps/ios/AGENTS.md` says): 822 tests, 1 skipped, 1 failure, `CaptureSnapshotTests.testAddTransactionDatePickerDoesNotResizeSheet`. It passed twice when rerun alone, and the whole `CaptureSnapshotTests` suite then passed 30 of 30. The earlier run's OCR failure in `testDescribeManualAndImageStatesRenderIsolatedContent` came from the wrong accessibility defaults and passes here.
