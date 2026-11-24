# Repeat an existing transaction: E2E record

Synthetic data only: the disposable stack from
`.cursor/skills/verify-howmuch/bin/control-howmuch launch` (plan `local-plan`,
seed `fixtures/demo-ledger.json`), signed in from the iOS Simulator as
`verifier`. Run on 23 Nov 2026 (Asia/Singapore) on an Amp Mac satellite,
Xcode 27.3, iOS 27 simulators iPhone 17 and iPhone SE (3rd generation), base
`ff538a1` plus this round's working tree. "Before" is the app built from
`ff538a1` alone.

## Flow

1. Accounts, Everyday Account, open `SP Services, Utilities, -$124.50`
   (9 Apr 2026, payee stored by name only, no payee record).
2. The row under Account reads `Date & Schedule` (was `Date`). Tap it.
3. The Date & Schedule screen shows the calendar and, under it,
   `Repeat: Does not repeat`. Choose `Monthly`.
4. The footnote reads `This transaction stays as it is. Saving adds a
   scheduled transaction from 9 Dec 2026, listed in Scheduled.`
5. Back: the form row shows the date with `Monthly` on a second line.
6. Save. Toast `Saved. Repeats monthly from 9 Dec 2026`. The register's
   Scheduled disclosure counts 1.

## Results

`GET /v1/plans/local-plan/scheduled_transactions` after Save:

```json
{ "date_first": "2026-04-09", "date_next": "2026-12-09", "frequency": "monthly",
  "amount": -124500, "payee_id": "payee_…", "payee_name": "SP Services",
  "category_id": "cat-utilities", "memo": "Utilities", "deleted": false }
```

`GET /v1/plans/local-plan/transactions/txn-2026-04-utilities` is unchanged:
date `2026-04-09`, amount `-124500`, memo `Utilities`, not deleted.
`GET /v1/plans/local-plan/payees` now lists `SP Services` (found or created by
`POST /payees`, which returns an existing payee of the same name).

The first run, before the payee lookup was added, stored `payee_id: null`;
that is why Save now resolves a name-only payee first.

Next-date parity: the client's `ScheduleFrequency.firstOccurrence` and the
server's `nextScheduledOccurrence` were run over 12 frequencies × 10 first
dates (month ends, 29 Feb, 30th, today, yesterday) × 4 floors: 480 of 480
identical.

Layout: iPhone 17 and iPhone SE, light and dark, form and Date & Schedule
screen before and after, plus the Monthly state. On the SE the row drops the
weekday (`9 Apr 2026`) rather than truncating.

## Checks

- `scripts/check.sh` on the Mac, clean clone at `ff538a1` plus the three
  changed files: web and worker typechecks, `verify-ios-confirm-presentation`,
  `verify-ios-disclosure-chevron`, `bun test`, and
  `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`, all exit 0;
  `check: pass`.
- Rebased onto `021734a` (floating Save). The one conflict was the Save
  button's modifiers: main's removal of the 50% disabled opacity is kept, with
  this round's `isSavingSchedule` guard added. `scripts/check.sh` rerun on the
  Mac at `021734a` plus the same three files (identical SHA-1s): same six
  steps, all exit 0, `check: pass`; HowMuchTests 822, 0 failures, 1 skipped.
- HowMuchTests: 822 executed, 0 failures, 1 skipped (opt-in live model test),
  simulator accessibility settings on.
