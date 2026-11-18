# #370 round 2: scripts and tests on the D1 path

Revision: rebased on origin/main 5a34c539 for landing (script runs were at 1016972f on 2258ef81; main's later commits do not touch the API or scripts). Synthetic data only.

## YNAB API chain (import:ynab -> verify:ynab-parity -> bootstrap:ynab-d1)

Fixture: a local stub of the YNAB API on 127.0.0.1 (token `synthetic-token`) serving one plan with two accounts, a salary, a purchase, a transfer pair, a split with a transfer line, and a monthly schedule.

```
YNAB_TOKEN=synthetic-token YNAB_BASE_URL=http://127.0.0.1:18999/v1 bun scripts/import-ynab.ts --db out.sqlite --no-backup
bun scripts/verify-ynab-parity.ts --db out.sqlite --plan-json plan.json --settings settings.json
bun scripts/ynab-d1-bootstrap.ts --db out.sqlite --out out-bootstrap.sql
```

The same chain was run on this branch (D1 repository over a local D1 binding) and on origin/main (SQLite repository):

| | this branch | origin/main |
|---|---|---|
| import | 6 transactions, 0 balance mismatches | 6 transactions, 0 balance mismatches |
| parity | verified, 20 source objects | verified, 20 source objects |
| bootstrap | validated 6 transactions | validated 6 transactions |

Loading both bootstrap files into fresh D1 databases and comparing every ledger table gave identical plans, accounts, payees, categories, transactions, subtransactions, schedules, raw objects and sync cursor. The only differences are generated IDs (import session, import rows, source events) and the `source_ref` that points at the session.

Not covered: the source fixture had a deleted transaction at first. Both branches then failed parity (ledger 6, source 7) and bootstrap, so that is existing behaviour and not part of this round.

## YNAB web export (import:ynab-export)

Register.csv with 6 rows, including a pair `Transfer : Savings` / `Transfer : Everyday` and a `Transfer : Old Card` row whose account has no rows of its own.

- this branch: 6 imported, 0 failed, 1 inferred pair, 3 accounts (Old Card created empty), Everyday 827.50, Savings 100.00
- origin/main: 6 imported, 0 failed, 1 inferred pair, 2 accounts, same balances

## Smoke

`bun run smoke` on the D1 path: health, user, plans, accounts, categories, transactions, spending report, net-worth report and quick entry all ok.

## Checks at the landed head (on 5a34c539)

- web and worker typecheck: pass
- verify-ios-focus-zoom, verify-ios-confirm-presentation, verify-ios-disclosure-chevron: pass
- build-ios-engine check (bun 1.4.0): up to date
- bun test: 767 pass, 0 fail
- HowMuchTests on an Amp Mac satellite (scripts/ios-xcodebuild.sh test, fresh build-for-testing): 822 tests, 1 skipped, 0 failures. A run before the rebase had two CaptureSnapshotTests timing failures that passed when rerun alone.
