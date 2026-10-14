# Worker/API bug hunt round 7: E2E evidence

Revision under test: branch `claude/project-thread-xwo172` at `25d1645` plus the
round 7 commits. Local only: a fresh SQLite file in a temporary directory and
the Bun API server (`apps/api/src/server.ts`) on 127.0.0.1:8871 with API token
`local-e2e-token`, synthetic data. No remote service was used.

Discovery: a differential run of the same request sequences through
`createHandler` over SQLite and over D1 (`apps/api/tests/helpers/native-harness.ts`,
D1 migrations behind the fake binding) found the transfer move. Cross-plan id
probes found the rest. The API suite (`bun test` in `apps/api`, 443 tests)
passed after each fix.

## 1. SQLite plan scoping and a transfer moved into its own target

Script: `plan-scope-e2e.ts` (run from the repo root:
`bun .amp/in/artifacts/worker-api-bug-hunt-r7/plan-scope-e2e.ts`). It seeds plan
`q` (account `acc-q`, transaction `tx-q`, payee `payee-q`) into the file, starts
the server, and drives plan `p` over HTTP. The "before" run swapped
`git show 25d1645:apps/api/src/repository.ts` in for the run and restored it.

| Request | Expected | Before (`25d1645`) | After |
| --- | --- | --- | --- |
| PATCH transfer `tx-1` (Chk to Sav) `account_id: acc-sav` | 400 | 200; both sides in Sav, labelled a transfer to Sav, Chk lost its outflow | 400 |
| POST transaction id `tx-q` (plan q's) | 404, q untouched | 404, but `tx-q` rewritten onto plan p's `acc-chk` | 404, untouched |
| POST bulk create id `tx-q` | 404, q untouched | 404, rewritten | 404, untouched |
| POST import id `tx-q` | 404, q untouched | 404, rewritten (amount -7, memo "from p import") | 404, untouched |
| POST account id `acc-q` | 400, q untouched | 404, `acc-q` renamed "hijack" | 400, untouched |
| POST transaction on `acc-q` | 400 | 201, plan q's balance -5 | 400 |
| POST transaction with `payee-q` | 400 | 201, took q's payee | 400 |

Full output with the database rows: `plan-scope-before.txt`, `plan-scope-after.txt`.
Result: before FAIL, after PASS.

## 2. D1 account create naming another plan's account id

Script: `d1-account-id-probe.ts` (run from `apps/api`). On the D1 backend
`POST /v1/plans/p/accounts` with plan q's account id answered 500 (the write's
plan assertion failed) before the fix and 400 "Account belongs to another plan"
after; plan q's account is unchanged either way.
