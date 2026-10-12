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
