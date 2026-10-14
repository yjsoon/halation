# Worker/API bug hunt round 3b: E2E evidence

Local-only stack: Wrangler 4.112.0 `wrangler dev --env preview --local` on a
fresh miniflare D1 in a scratch directory, synthetic data, API token
`local-e2e-token` passed with `--var`. No remote Cloudflare resource was used.
`apps/web/dist` held a placeholder `index.html` only (not committed). The
scripts reuse `../worker-api-bug-hunt-r3/common.ts` (`BASE` overrides the port).

## Setup

```sh
cd apps/worker
wrangler d1 migrations apply howmuch-preview --local --env preview --persist-to <scratch>/wr3b
wrangler dev --env preview --local --port 8834 --ip 127.0.0.1 \
  --persist-to <scratch>/wr3b --var HOWMUCH_API_TOKEN:local-e2e-token --test-scheduled
BASE=http://127.0.0.1:8834 bun .amp/in/artifacts/worker-api-bug-hunt-r3b/<script>.ts
```

"Before" runs swap the pre-fix file in (`git show HEAD:<path> > <path>`) and
let `wrangler dev` reload; "after" runs restore the fixed file.

## 1. Bulk transaction writes did not name the flag from the card

Revision before fix: `cc4392f`. Script: `bulk-flag-name-e2e.ts`.

`POST /transactions` with one `transaction` and `PUT/PATCH /transactions/{id}`
stamp `flag_name` from the account's rewards card, but the bulk
`POST /transactions` (`transactions: [...]`) and bulk `PATCH /transactions`
did not. A bulk recolour therefore kept the old colour's name, and the rewards
report (which labels a flag group from the stored name) showed the blue group
under the red flag's name.

| Step | Expected | Before | After |
| --- | --- | --- | --- |
| Card with `flagNames` red Dining, blue Travel; single POST red | Dining | Dining | Dining |
| Bulk POST (`transactions: [...]`) red | Dining | null | Dining |
| Bulk PATCH both rows to blue (one by `id`, one by `import_id`) | blue:Travel twice | blue:Dining, blue:null | blue:Travel twice |
| `GET /api/reports/rewards?group=flag` for the card | one group "Travel" (2 rows) | one group "Dining" (2 rows) | one group "Travel" (2 rows) |
