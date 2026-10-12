# Worker/API bug hunt: E2E evidence

Local-only stack: Wrangler 4.112.0 `wrangler dev --env preview --local` on a
miniflare D1 in a scratch directory, synthetic data, API token
`local-e2e-token` passed with `--var`. No remote Cloudflare resource was used.
`apps/web/dist` held a placeholder `index.html` only (not committed).

## Setup

```sh
cd apps/worker
wrangler d1 migrations apply howmuch-preview --local --env preview --persist-to <scratch>/wr
wrangler dev --env preview --local --port 8799 --ip 127.0.0.1 \
  --persist-to <scratch>/wr --var HOWMUCH_API_TOKEN:local-e2e-token --test-scheduled
B=http://127.0.0.1:8799/v1/plans/80bc6db0-d926-4635-a37a-1ba0787c4c4e
H='authorization: Bearer local-e2e-token'
curl -XPOST $B/accounts -H "$H" -d '{"account":{"id":"e2e-acct","name":"E2E Checking"}}'   # 201
```

## 1. D1 transaction writer client errors returned 500

Revision before fix: `c99b9f8`.

| Request | Expected | Observed before | Observed after |
| --- | --- | --- | --- |
| POST split whose lines total -2000 against -3000 | 400 | 500 `internal_server_error` | 400 `subtransactions must sum ...` |
| POST with `account_id: "missing-acct"` | 400 | 500 | 400 `Account not found` |
| PUT `/transactions/no-such-txn` memo | 404 | 500 | 404 `Transaction not found` |
| POST with `date: "01/10/2026"` | 400 | 500 | 400 `date must use YYYY-MM-DD` |
| POST valid `e2e-ok` -3000 | 201 | 201 | 201, account balance -3000 |

The Bun/SQLite stack already answered 400/404 for the same requests; only the
deployed D1 path lost the classification.

## 2. Impossible calendar dates were stored

Revision before fix: `6c0fe50`. The writers only checked the `\d{4}-\d{2}-\d{2}`
shape. `POST $B/transactions` with `date: "2026-19-45"` answered 201 and the row
was counted in `accounts.balance_milli`, while the `account_month_balances`
trigger computes `date('2026-19-01','+1 month')` as NULL and drops the row, so
net worth and the account balance disagree.

| Request | Expected | Before | After |
| --- | --- | --- | --- |
| POST date `2026-19-45` | 400 | 201 | 400 |
| POST date `2026-02-30` | 400 | 201 | 400 |
| POST date `2026-02-28` | 201 | 201 | 201 |
| PUT `e2e-ok` date `2026-04-31` | 400 | (accepted shape) | 400 |

## 3. Account create stored non-integer balances

Revision before fix: `a53aefa`. `POST $B/accounts` passed `balance` straight to
the INTEGER milliunit columns.

| Request | Expected | Before | After |
| --- | --- | --- | --- |
| `{"name":"Float acct","balance":"12.50"}` | 400 | 201, balance `12.5` (fractional milliunits) | 400 `account.balance must be integer milliunits` |
| `{"name":"Obj acct","balance":{"x":1}}` | 400 | 500 | 400 |
| `{"name":"Good acct","type":"cash","balance":125000}` | 201 | 201 | 201, balance 125000 |

## 4. Quick entry answered 500 for a missing or unparseable amount

Revision before fix: `6a57335`. `POST /api/mobile/quick-entry` (API token).

| Body | Expected | Before | After |
| --- | --- | --- | --- |
| no `amount` | 400 | 500 | 400 `amount is required` |
| `amount: "abc"` | 400 | 500 | 400 `amount must be a decimal amount` |
| `amount: "-4.20"`, payee `Kopi` | 201 | 201 | 201 |

## 5. Schedule moved back onto an already posted occurrence

Revision after fix: `79ceb77`. Schedule `e2e-sched` (monthly from 2026-08-31,
-1500 transfer to `e2e-save`) had posted 2026-08-31 and 2026-09-30 through
`GET /__scheduled?cron=5+16+*+*+*` (local date 2026-10-13), leaving
`date_next` 2026-10-31.

1. `PATCH $B/scheduled_transactions/e2e-sched` `{"date_next":"2026-09-30"}` -> `date_next` 2026-09-30.
2. Trigger the cron again.

Expected: run finishes, no duplicate occurrence, `date_next` 2026-10-31.
Observed: log `{"event":"scheduled_materialization","through_date":"2026-10-13","occurrence_count":0,"failure_count":0,"has_more":false}`,
`date_next` 2026-10-31, still two +1500 rows in `e2e-save`. Before the fix the
same-day run spun forever; the isolated regression test in `apps/api/tests/d1.test.ts`
reproduces that spin (capped) and the stranded-advance case.

## 6. Schedules that can never occur were accepted

Revision before fix: `8264c6f`. `POST $B/scheduled_transactions` with
`transfer_account_id` equal to `account_id` answered 201; the next
`GET /__scheduled?cron=5+16+*+*+*` failed with "Scheduled materialisation
completed with schedule failures" (500), and would every day after.

| Request | Expected | Before | After |
| --- | --- | --- | --- |
| `transfer_account_id` = own account | 400 | 201, cron fails daily | 400 `transfer_account_id must be a different account` |
| `payee_id` = own account's transfer payee | 400 | 201, cron fails daily | 400 `Payee is a transfer to the scheduled transaction's own account` |
| transfer to `e2e-save` from 2026-11-01 | 201 | 201 | 201 |
| cron after deleting the bad schedule | `failure_count` 0 | | `failure_count` 0 |

## 7. CSV inflow hidden behind a "$0.00" outflow cell

Revision before fix: `cfe9ced`. Register exports (YNAB's included) fill the
unused money column with `$0.00`. Script: `csv-e2e.ts` in this folder
(`bun csv-e2e.ts <tag>`), which posts two rows to `POST /api/import/csv` for
`e2e-acct` and reads `GET $B/accounts/e2e-acct/transactions?since_date=2026-10-01`.

| Row | Expected amount | Before (`before`) | After (`after`) |
| --- | --- | --- | --- |
| outflow `$0.00`, inflow `$50.00` | 50000 | 0 (imported) | 50000 (imported) |
| outflow `$12.34`, inflow `$0.00` | -12340 | -12340 | duplicate of the `before` row (same date, payee and amount), as designed |

## 8. Editing one side of a transfer wiped the other side's flag

Revision before fix: `4b45c88`. Script: `mirror-flag-e2e.ts <tag>`. It creates
a -7000 transfer from `e2e-acct` to `e2e-save` (transfer payee), sets
`flag_color: green, flag_name: Groceries` on the mirror, then PATCHes only the
memo of the source side and reads the mirror back. The D1 writer rewrote the
mirror row with null flag, import and source fields (SQLite keeps them).

| Step | Expected | Before (`before`) | After (`after`) |
| --- | --- | --- | --- |
| flag the mirror | 200 green/Groceries | 200 green/Groceries | 200 green/Groceries |
| PATCH source memo | 200 | 200 | 200 |
| mirror flag after | green/Groceries | null/null | green/Groceries |

The same held for the linked side of a split transfer line: after the parent
split was edited (`linked-flag-e2e.ts`), its flag came back null before the
fix and `red`/`Dining` after.

## 9. Rewards flag rename failed halfway on a split transfer's linked side

Revision before fix: `4b45c88` plus fix 8. Script: `retitle-e2e.ts <tag>`
creates account `retitle-acct-<tag>` with one plain unflagged -4000 row, a
split in `e2e-save` whose -2000 line transfers into that account, then
`POST /api/rewards/cards?plan_id=…` with `flagNames: {unflagged: "Base rate"}`.

| Check | Expected | Before (`before`) | After (`after2`) |
| --- | --- | --- | --- |
| POST card | 201 | 400 `This transaction is the linked side of a split line` | 201 |
| card stored | yes | yes (despite the 400) | yes |
| plain row `flag_name` | Base rate | null | Base rate |
| linked row `flag_name` | Base rate | null | Base rate |

`linked-flag-e2e.ts retitle-acct-after2` then confirms the linked side still
refuses a memo edit (400), accepts a flag edit (200 red/Dining), and follows
a parent split edit to 2500 with its link and flag intact; account balance
-1500.
