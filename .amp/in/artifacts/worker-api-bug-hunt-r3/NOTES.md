# Worker/API bug hunt round 3: E2E evidence

Local-only stack: Wrangler 4.112.0 `wrangler dev --env preview --local` on a
fresh miniflare D1 in a scratch directory, synthetic data, API token
`local-e2e-token` passed with `--var`. No remote Cloudflare resource was used.
`apps/web/dist` held a placeholder `index.html` only (not committed).

## Setup

```sh
cd apps/worker
wrangler d1 migrations apply howmuch-preview --local --env preview --persist-to <scratch>/wr3
wrangler dev --env preview --local --port 8833 --ip 127.0.0.1 \
  --persist-to <scratch>/wr3 --var HOWMUCH_API_TOKEN:local-e2e-token --test-scheduled
bun .amp/in/artifacts/worker-api-bug-hunt-r3/<script>.ts
```

"Before" runs swap the pre-fix file in (`git show HEAD:<path> > <path>`) and
let `wrangler dev` reload; "after" runs restore the fixed file.

## 1. A rewards subcategory rename left the old flag name on existing rows

Revision before fix: `577b68f`. Script: `subcategory-retitle-e2e.ts`.

A new transaction is stamped from the card's subcategory names overridden by
its colour names (`cardFlagNames`), but a card edit only restamped existing
rows from the explicit colour names, so a subcategory rename never reached the
rows it had named. The rewards report groups by the stored name.

| Step | Expected | Before | After |
| --- | --- | --- | --- |
| Create card, red subcategory "Dining"; POST red transaction | `flag_name` Dining | Dining | Dining |
| PATCH card, red subcategory renamed "Food"; GET that transaction | Food | Dining | Food |
| POST another red transaction | Food | Food | Food |
| `GET /api/reports/rewards?group=flag` for the card | one group "Food" | one group "Dining" (2 rows) | one group "Food" (2 rows) |
