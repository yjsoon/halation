# Web, scripts and docs bug hunt (round 5, confirming)

Revision: `f8b7072` (`claude/project-thread-xwo172`, rounds 1 to 4 merged).
No code change in this round; every probe ran against that revision.

## Setup

Disposable stack from `.cursor/skills/verify-howmuch`, own state root:

```sh
export PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH"
HOWMUCH_VERIFY_STATE_ROOT=<scratch>/verify control-howmuch launch
# web http://127.0.0.1:40859, api http://127.0.0.1:56871, plan local-plan
```

Synthetic data: one schedule, `POST /v1/plans/local-plan/scheduled_transactions`
(Idempotency-Key `r5-sched-gym-1`, bootstrap token)
`{"scheduled_transaction":{"account_id":"acct-everyday","date_first":"2026-11-01","frequency":"monthly","amount":-25000,"category_id":"cat-health","memo":"Synthetic gym"}}`.
The Jev call is answered by a Playwright route (suggests `cat-shopping`, since
the first Everyday row is already Groceries in the seed).

Run: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PW_STATE=<scratch>/pw-state.json node <probe>.mjs`

## Results

| Probe | Observed |
| --- | --- |
| `crawl.mjs` every route plus five filter variants | no page errors, no rendered NaN/undefined/Infinity |
| `bulk-delete-all-focus.mjs` delete the only row in a one-day range (seeded `txn-2026-05-bus`) | open: Cancel; after delete and re-read: "+ Add transaction" (enabled); toast "Deleted 1 transaction."; API `GET .../transactions/txn-2026-05-bus` 404 |
| `editor-focus.mjs` (round 4 probe) | schedule Edit and Add, Reconcile (both Cancels), review, bulk Delete: focus into the panel on open, back to the opener on Cancel |
| `editor-save-focus.mjs` (round 4 probe) | schedule Save: focus "Add schedule" (the row re-renders on refetch), API memo "Synthetic gym 15"; review Apply: toast "Categorised 1 transaction.", focus "+ Add transaction" |

Checks: `bun run typecheck` and `bun test` in `apps/web` (404 pass).
