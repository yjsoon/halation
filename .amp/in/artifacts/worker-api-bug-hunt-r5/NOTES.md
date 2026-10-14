# Worker/API bug hunt round 5: E2E evidence

Local-only stack: Wrangler 4.112.0 `wrangler dev --env preview --local` on a
fresh miniflare D1 in a scratch directory, synthetic data, API token
`local-e2e-token` passed with `--var`. No remote Cloudflare resource was used.
`apps/web/dist` held a placeholder `index.html` only (not committed). The
script reuses `../worker-api-bug-hunt-r3/common.ts` (`BASE` overrides the port).

## Setup

```sh
cd apps/worker
wrangler d1 migrations apply howmuch-preview --local --env preview --persist-to <scratch>/wr5
wrangler dev --env preview --local --port 8851 --ip 127.0.0.1 \
  --persist-to <scratch>/wr5 --var HOWMUCH_API_TOKEN:local-e2e-token
BASE=http://127.0.0.1:8851 bun .amp/in/artifacts/worker-api-bug-hunt-r5/<script>.ts
```

Discovery drove the same request sequences through `createHandler` over
SQLite and over D1 (`tests/helpers/native-harness.ts`): rewards flags on
posted schedules, account rename and transfer payees, viewer/editor/owner
gates, auth lifecycle (setup, token login, personal token, password change,
logout, revoke), snapshot export/import round trip across both backends,
category rename/delete, quick entry with split transfer lines, and the daily
cron with one failing schedule among good ones.

## 1. A posted schedule occurrence had no flag name

Revision before fix: `f8b7072`. Script: `schedule-flag-name-e2e.ts`. The
"before" run swapped `git show HEAD:apps/api/src/repository.ts` in and let
`wrangler dev` reload.

A typed transaction on a rewards card's account takes the card's name for its
flag colour; an occurrence posted from a flagged schedule (owner catch-up or
the daily cron, which share `prepareScheduledOccurrence`) did not.

| Step | Expected | Before | After |
| --- | --- | --- | --- |
| Rewards card on a credit card account, `flagNames: { red: "Dining" }` | 201 | 201 | 201 |
| Typed red transaction on that account | `flag_name` Dining | Dining | Dining |
| Red `never` schedule, `POST /scheduled_transactions/materialize` through 2026-09-30 | 1 occurrence | 1 | 1 |
| Posted occurrence `flag_name` | Dining | null | Dining |

The API suite (`bun test` in `apps/api`, 443 tests) passed after the fix.
