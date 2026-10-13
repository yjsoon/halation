# Worker/API bug hunt round 6: E2E evidence

Local-only stack: Wrangler 4.112.0 `wrangler dev --env preview --local` on a
fresh miniflare D1 in a scratch directory, synthetic data, API token
`local-e2e-token` passed with `--var`. No remote Cloudflare resource was used.
`apps/web/dist` held a placeholder `index.html` only (not committed). The
scripts reuse `../worker-api-bug-hunt-r3/common.ts` (`BASE` overrides the port).

## Setup

```sh
cd apps/worker
wrangler d1 migrations apply howmuch-preview --local --env preview --persist-to <scratch>/wr6
wrangler dev --env preview --local --port 8861 --ip 127.0.0.1 \
  --persist-to <scratch>/wr6 --var HOWMUCH_API_TOKEN:local-e2e-token
BASE=http://127.0.0.1:8861 bun .amp/in/artifacts/worker-api-bug-hunt-r6/<script>.ts
```

Discovery: `body-fuzz.ts` drives every POST/PATCH/PUT body route through
`createHandler` over SQLite and over D1 (`tests/helpers/native-harness.ts`),
replacing the whole body and then each field in turn with `{}`, `[]`, objects,
arrays, numbers, booleans, null and odd strings, and lists each 500. Run from
`apps/api`: `bun ../../.amp/in/artifacts/worker-api-bug-hunt-r6/body-fuzz.ts`.
Before the fixes it listed 157 distinct 500s across both backends; after them
only the 20 for `POST /api/import/csv rows=<non-array>` remain (a deliberately deferred
item), see `body-fuzz-before.txt` and `body-fuzz-after.txt`. `big-writes-probe.ts` exercised the largest
writes each route allows on local D1 (100-item create, bulk patch, bulk
cleared, bulk delete, 300-row import and CSV, 60-line splits with and without
transfer lines); all answered 2xx.

The API suite (`bun test` in `apps/api`, 443 tests) passed after each fix.

## 1. Wrongly typed write bodies failed as 500 or stored junk

Revision before fix: `3c0292c`. Script: `typed-bodies-e2e.ts`. The "before"
run swapped `git show 3c0292c:apps/api/src/{http,transaction-batch}.ts` in and
let `wrangler dev` reload.

| Request | Expected | Before | After |
| --- | --- | --- | --- |
| `POST /payees` with body `null` | 400 | 500 | 400 |
| `PATCH /transactions/{id}` with body `null` | 400 | 500 | 400 |
| `PATCH` transaction `memo: {}` | 400 | 500 | 400 |
| `PATCH` transaction `memo: true` | 400 | 200, memo stored `"1.0"` | 400 |
| `PATCH` transaction `approved: "yes"` | 400 | 200, approved stored true | 400 |
| `PATCH` transaction `category_id: ""` | 400 | 500 (foreign key) | 400 |
| `PATCH` transaction `flag_color: 5` | 400 | 200, flag stored `"5.0"` | 400 |
| `POST` transaction `import_id: {}` | 400 | 500 | 400 |
| `POST` transaction `category_id: ""` | 400 | 500 | 400 |
| `POST /transactions/import` item `account_id: {}` | 400 | 500 | 400 |
| `POST /api/mobile/quick-entry` with a `null` split line | 400 | 500 | 400 |
| `POST /accounts` `name: {}` | 400 | 201, account named `[object Object]` | 400 |
| `POST /accounts` `type: {}` | 400 | 500 | 400 |
| Transaction after the bad edits | memo, approved, flag unchanged | memo `1.0`, approved true, flag `5.0` | unchanged |
| Valid edit `memo: ""`, `approved: true`, `flag_color: null` | 200 | 200 | 200 |

Result: before FAIL, after PASS.

## 2. D1 reports failed past 100 bound parameters

Revision before fix: `68c25f0`. Script: `report-many-ids-e2e.ts` (120
categories in one group, two categorised outflows of 2.50 and 1.50).

| Request | Expected | Before | After |
| --- | --- | --- | --- |
| `spending-breakdown` with 120 `category_ids` | 200, total 4000 | 500 `too many SQL variables` | 200, total 4000 |
| `income-vs-spending` with 120 `category_ids` | 200, spending 4000 | 500 | 200, 4000 |
| `income-vs-spending-groups` with 120 `category_ids` | 200, spending 4000 | 500 | 200, 4000 |
| `net-worth` with 111 `account_ids` | 200 | 200 | 200 |
| `age-of-money` with 111 `account_ids` | 200 | 500 | 200 |
| `spending-breakdown` with 111 `account_ids` | 200 | 500 | 200 |

Wrangler logged `D1_ERROR: too many SQL variables` for each 500 before the fix.
