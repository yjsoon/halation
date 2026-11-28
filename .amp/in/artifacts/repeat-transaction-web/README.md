# Repeat an existing transaction from the web register: E2E record

Synthetic data only: the disposable stack from
`.cursor/skills/verify-howmuch/bin/control-howmuch launch` (plan `local-plan`,
seed `fixtures/demo-ledger.json`), owner `verifier` set up in the web app, and
the web app under Vite in agent-browser (Chromium 157) at 1440 × 900 and
390 × 844. Run on 28 Nov 2026 (Asia/Singapore) on base `2b381c7` plus this
round's working tree. "Before" is the same server with this round's web
changes stashed.

## Flow

1. Ledger, Everyday Account, double-click the date of `SP Services, 9 Apr 2026,
   Utilities, $124.50`. The row opens for editing.
2. Under the date input is a select labelled Repeat, reading `Does not repeat`
   (on a phone the cell's label reads `Date and repeat`). Choose `Monthly`.
3. Save. Toast `SP Services saved. Repeats monthly from 9 Dec 2026.` The
   register's Scheduled disclosure goes from absent to `1` without a reload.
4. Tekka Market, 7 Apr 2026: change the memo to `Fresh produce, weekly`,
   choose `Weekly`, Save. Toast `Tekka Market saved. Repeats weekly from
   1 Dec 2026.`; Scheduled `2`.
5. Raffles Medical, 18 Apr 2026: `Yearly`, Save. Toast `Raffles Medical saved.
   Repeats yearly from 18 Apr 2027.`; Scheduled `3`.

## Results

`GET /v1/plans/local-plan/scheduled_transactions` after steps 3 and 4:

```json
{"date_first":"2026-04-07","date_next":"2026-12-01","frequency":"weekly","amount":-96100,"payee_name":"Tekka Market","payee_id":true,"category_id":"cat-groceries","memo":"Fresh produce, weekly"}
{"date_first":"2026-04-09","date_next":"2026-12-09","frequency":"monthly","amount":-124500,"payee_name":"SP Services","payee_id":true,"category_id":"cat-utilities","memo":"Utilities"}
```

(`payee_id: true` means an ID was stored; the seed rows had payee names only,
so Save found or created the payee first.)

The transactions themselves: 9 Apr SP Services unchanged (`-124500`, memo
`Utilities`); 7 Apr Tekka Market saved with memo `Fresh produce, weekly`.

The first web run showed the Scheduled disclosure only after a page reload:
the register's schedule cache keeps settled rows across a local write. Its key
now carries a generation that the repeat bumps, as the Scheduled page does.

Next-date parity: `nextRepeatDate` in `apps/web/src/lib/schedules.ts` against
the server's `nextScheduledOccurrence`, 12 frequencies × 11 first dates (month
ends, 29 Feb, 30th, today, yesterday, a future date) × 5 todays: 660 of 660
identical; `never` gives null.

## Checks

- `CHROME_PATH=… scripts/check.sh` on the orb (web-only round, no iOS step):
  web and worker typechecks, `verify-ios-focus-zoom`, `bun test` (770 pass,
  0 fail), all exit 0; `check: pass`.
- `register-row-edit.test.ts` "seeds every posted draft field" now expects
  `repeat: "never"` in a posted row's draft.
