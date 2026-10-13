# Worker/API bug hunt round 4: E2E evidence

Local-only stack: Wrangler 4.112.0 `wrangler dev --env preview --local` on a
fresh miniflare D1 in a scratch directory, synthetic data, API token
`local-e2e-token` passed with `--var`. No remote Cloudflare resource was used.
`apps/web/dist` held a placeholder `index.html` only (not committed). The
scripts reuse `../worker-api-bug-hunt-r3/common.ts` (`BASE` overrides the port).

## Setup

```sh
cd apps/worker
wrangler d1 migrations apply howmuch-preview --local --env preview --persist-to <scratch>/wr4
wrangler dev --env preview --local --port 8841 --ip 127.0.0.1 \
  --persist-to <scratch>/wr4 --var HOWMUCH_API_TOKEN:local-e2e-token
BASE=http://127.0.0.1:8841 bun .amp/in/artifacts/worker-api-bug-hunt-r4/<script>.ts
```

Discovery used a scratch script that drives the same request sequence through
`createHandler` over SQLite and over D1 (the `tests/helpers/native-harness.ts`
fake binding) and diffs a projection of transactions, accounts, payees,
schedules, reports and a snapshot export/import round trip.

## 1. A D1 transfer named only by its account had no payee

Revision before fix: `6fdf04e`. Script: `transfer-schedule-payee-e2e.ts`.

The web schedule editor saves a transfer as `transfer_account_id` with
`payee_id: null` (plain schedules and split lines alike). SQLite posts each
occurrence with the target's `Transfer : <name>` payee; the D1 writer left the
posted row and the split transfer line with no payee.

| Step | Expected | Before | After |
| --- | --- | --- | --- |
| Create a plain transfer schedule and a split schedule with one transfer line (both `payee_id: null`) | 201, 201 | 201, 201 | 201, 201 |
| `POST /scheduled_transactions/materialize` through 2026-09-30 | 2 occurrences | 2 | 2 |
| Posted plain row `payee_id` / `payee_name` | target's transfer payee | null / null | `payee_transfer_…` / `Transfer : Sched to …` |
| Posted split transfer line `payee_id` / `payee_name` | line target's transfer payee | null / null | `payee_transfer_…` / `Transfer : Sched line …` |

## 2. POST /payees answered 500 for a missing name and saved blank names

Revision before fix: `ca084a1`. Script: `payee-name-e2e.ts`. The "before" run
swapped `git show HEAD:apps/api/src/http.ts` in and let `wrangler dev` reload.

| Step | Expected | Before | After |
| --- | --- | --- | --- |
| `{ payee: {} }` | 400 | 500 "An internal error occurred" | 400 "payee.name is required" |
| `{ payee: { name: "   " } }` | 400 | 201, blank payee saved | 400 |
| `{ payee: { name: "  Landlord <run>  " } }` | 201, trimmed | 201, untrimmed | 201, `Landlord <run>` |
| Payees added | 1 | 2 | 1 |

The API suite (`bun test` in `apps/api`, 443 tests) passed after each fix.
