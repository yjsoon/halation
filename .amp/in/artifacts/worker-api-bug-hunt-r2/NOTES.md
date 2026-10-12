# Worker/API bug hunt, round 2: E2E evidence

Local-only stack, as in round 1: Wrangler 4.112.0
`wrangler dev --env preview --local` on a miniflare D1 in a scratch directory,
synthetic data, API token `local-e2e-token` passed with `--var`. No remote
Cloudflare resource was used. `apps/web/dist` held a placeholder `index.html`
only (gitignored, not committed). Base revision: `41a61b5`.

## Setup

```sh
cd apps/worker
wrangler d1 migrations apply howmuch-preview --local --env preview --persist-to <scratch>/wr
wrangler dev --env preview --local --port 8799 --ip 127.0.0.1 \
  --persist-to <scratch>/wr --var HOWMUCH_API_TOKEN:local-e2e-token --test-scheduled
```

Each script below runs with `bun <script> <tag>` from the repository root
against that Worker; the tag keeps reruns apart in one database.

## 1. D1 dropped the category of a transfer to a tracking account

Script: `tracking-transfer-e2e.ts`. A checking account pays a mortgage
(tracking, `on_budget: false`) through the mortgage's transfer payee with a
category. YNAB, and the SQLite store, keep that category so the payment
counts as spending; only transfers between two budget accounts lose it. The
D1 writer dropped the category on every auto-linked transfer, and rewrote the
other side without its category whenever the tracking side was edited (so a
YNAB-imported categorised payment lost its category on the first edit there).

| Step | Expected | Before (`41a61b5`) | After |
| --- | --- | --- | --- |
| POST categorised transfer to mortgage | 201, category kept | 201, `category_id` null | 201, kept |
| GET the row | category kept | null | kept |
| Spending breakdown for that day and account | 30000 in the category | total 0, no groups | 30000, "Mortgage payment" |
| PATCH memo on the mortgage side, GET checking side | category kept | null (never stored) | kept |

The mortgage-side edit was also checked on both stores through the API
harness (`nativeHarness`) with a category already stored: SQLite kept it,
D1 wiped it before the fix and keeps it after.

## 2. Account create made every type on-budget

Script: `account-kind-e2e.ts`. `docs/api-contract.md` documents the create
body as `name`, `type`, `balance`, `icon` and says `on_budget` is derived from
`type`, but `POST /accounts` stored `on_budget = 1` whenever the body left it
out, so a mortgage or asset account created through the API counted as a
budget account (and its transfers lost their category).

| POST body | Expected GET `on_budget` | Before (`89c8643`) | After |
| --- | --- | --- | --- |
| `type: "mortgage"` | false | true | false |
| `type: "otherAsset"` | false | true | false |
| `type: "savings"` | true | true | true |
| `type: "checking", on_budget: false` (explicit) | false | false | false |

## 3. Reading an unknown account id created the account

Script: `ghost-account-e2e.ts`. `GET /v1/plans/{plan}/accounts/{id}` went
through `getAccount`, which called `ensureAccount` first, so any token
holder reading a mistyped or stale id inserted an "Imported account" row and
its transfer payee (without a server-knowledge bump) and got 200.

| Step | Expected | Before (`f57208d`) | After |
| --- | --- | --- | --- |
| GET unknown account id | 404 | 200, "Imported account ghost-be" | 404 "Account not found" |
| List accounts | no such row | row present | absent |
| List payees | no transfer payee for it | present | absent |

## 4. D1 copied the source's cleared state onto a new transfer's other side

Script: `mirror-cleared-e2e.ts`. The SQLite store, and the D1 writer for a
split's transfer line, create the other side of a transfer `uncleared` (or
`cleared` for a scheduled transfer into cash), because the source's state says
nothing about the target account's statement. The D1 writer for a plain
transfer copied `input.cleared` instead, so recording a cleared payment marked
the savings side cleared (and a reconciled source would mark it reconciled),
which inflates the target's cleared balance and lets it be reconciled unseen.
The same applied whenever a transfer was retargeted to another account.

| Step | Expected | Before (`c8cf180`) | After |
| --- | --- | --- | --- |
| POST transfer checking to savings, `cleared: "cleared"` | 201, source cleared | 201, cleared | 201, cleared |
| GET savings side | `uncleared` | `cleared` | `uncleared` |
| Savings cleared / uncleared balance | 0 / 40000 | 40000 / 0 | 0 / 40000 |

A SQLite/D1 parity probe through the API harness (delete either side, drop a
split's transfer line, delete a split parent, amount and date edits on either
side, retarget, bulk delete) matched on every step after the fix apart from
generated ids.
