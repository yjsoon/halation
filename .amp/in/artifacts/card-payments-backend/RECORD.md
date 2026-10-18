# Card payment reminders: backend E2E record

## Round 3 (R-B1, R-B2), rerun 2026-10-18

Base `4bf9205` plus the fix; the commit containing this section is the tested code. Bun/SQLite **67/67** (db `/tmp/howmuch-verify/20261018T142559-17435/howmuch.sqlite`, `db-bun.txt`), D1 path **71/71**.

| Fix | Setup (terms created 2026-10-18, statement day 3, gap 25) | Expected and observed at as_of 2026-11-05 |
|---|---|---|
| R-B1 | Card G owes S$300.00 at 3 Oct, S$200.00 more spent 1 Nov | control: carried (`previous_unpaid` 3 Oct, `overdue`); after a plain inflow (no transfer) of S$300.00 dated 20 Oct: `previous_unpaid` null, `unscheduled`, statement 200,000, owed now 200,000 |
| R-B2 | Card H owes S$300.00 at 3 Oct, unpaid by 28 Oct | control: carried, previous minimum 50,000; after a plain inflow of S$60.00 dated 4 Nov: carry cleared, `unscheduled`, owed now 240,000; at as_of 2026-10-30 the October cycle itself is still `overdue` |

## Review fix round (B1 to B7), rerun 2026-10-18

Base revision `4e1c86e` (branch head with the web and iOS commits) plus the backend fixes; the commit containing this section is the tested code. Same commands as below; the script was extended. Results: **Bun/SQLite 62/62**, **D1 path 66/66**, `bun test` 751 pass, `bun run verify:worker` (web typecheck, bundle, Worker dry run) clean, `check:ios-engine` up to date after a Bun 1.4.0 rebuild. Bun stack db: `/tmp/howmuch-verify/20261018T131751-9147/howmuch.sqlite` (persisted rows in `db-bun.txt`: seven `card_payment_terms.put` and one `.delete` receipt, terms rows with `created_at`).

New expectations (terms created on 2026-10-18; weekdays from Python `datetime`; 1 Mar 2027 is a Monday):

| Fix | Setup | Expected and observed |
|---|---|---|
| windows | Card A, statement day 3, gap 25 | current window 2026-10-04 to 2026-11-03, next 2026-11-04 to 2026-12-03 |
| B2 | Card D owes S$100.00 at 3 Sep (due 28 Sep, before the terms existed) | as_of 2026-10-01: `unscheduled`, not overdue; as_of 2026-10-05: `previous_unpaid` null |
| B3 | Card D owes S$500.00 at 3 Oct, transfer S$20.00 on 20 Oct | as_of 2026-10-21: `partial` paid 20,000, remaining 480,000; as_of 2026-10-29: `overdue` since 2026-10-28, paid 20,000 |
| B1 | same, as_of 2026-11-05 | current (3 Nov statement) `overdue` since 2026-10-28, `previous_unpaid` {2026-10-03, 2026-10-28, 500,000, 50,000}, default pay date 2026-11-05; next cycle carries nothing |
| B1 | transfer S$480.00 on 6 Nov | as_of 2026-11-07: `paid` 480,000, `previous_unpaid` null |
| B4 | Card E owes S$300.00 at 3 Oct; control overdue at 29 Oct; then a plain inflow (no transfer) of S$300.00 on 15 Oct | both cycles `settled`, owed now 0 |
| B5 | Card F, statement day 1, gap 28; Feb 2027 statement due Mon 1 Mar | as_of 2027-03-01: Feb cycle current, window 2027-02-02 to 2027-03-01, March window starts 2027-03-02; a transfer dated 1 Mar pays the Feb cycle; as_of 2027-03-02: March cycle current, nothing carried |
| B6 | Card A after the one-off S$1,234.56 schedule | next statement projection 165,440 (1,400,000 less the pending payment) |
| created_at | PUTs on Card C | set once (ISO UTC), kept on later PUTs, a sent-back value ignored; kept through the D1 snapshot round trip |

Changed from the first run: a zero-owed Card C past its due date is now `settled` (B4) rather than `unscheduled`; the overdue state carries `since` and `paid_amount`.

---


- Base revision: `73e67313f9eb52626c9fdcee41e6dfc10ef60048` (branch `claude/project-thread-gnrkc7`) plus the uncommitted backend change recorded here; the commit that contains this file is the tested code.
- Date of run: 2026-10-18 (container clock UTC; host time zone UTC).
- Data: synthetic only. Accounts "Card A ending 0000 <run>", "Account B <run>", "Card C ending 1111 <run>", payee "Shop A". No production data, no remote D1, no Wrangler deploy.
- Principal: the default-plan API token on every request, which is what local mode (the phone engine) authenticates as.

## Stacks

1. **Bun/SQLite** (the self-hosted and dev server, `LedgerRepository`): isolated stack from the verify-howmuch skill.

   ```sh
   export PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH"
   control-howmuch launch      # seeds fixtures/demo-ledger.json into /tmp/howmuch-verify/<run>/howmuch.sqlite
   control-howmuch doctor      # ok health={"ok":true}, ok web_title=Halation
   bun .amp/in/artifacts/card-payments-backend/e2e.ts --base http://127.0.0.1:51031 --token howmuch-verify-bootstrap --plan local-plan
   control-howmuch cleanup
   ```

2. **D1 path** (the Worker and the phone engine, `D1LedgerRepository` with guarded commands): the real `createHandler` served over loopback HTTP on an in-memory SQLite carrying every `apps/api/d1-migrations/*.sql`, through the repo's fake D1 binding, `timeZone: "Asia/Singapore"`.

   ```sh
   bun .amp/in/artifacts/card-payments-backend/e2e.ts --d1
   ```

The same script runs the same steps in both modes; the D1 mode also round-trips the exported snapshot into a second, empty D1 instance and reads the `write_commands` receipts. Full request and response bodies: `http-log-bun.txt`, `http-log-d1.txt`.

## Expected values (derived independently of the module)

Weekdays checked with Python's `datetime`: 2026-10-28 Wednesday, 2026-11-28 Saturday, 2025-12-28 Sunday, 2026-01-28 Wednesday, 2026-03-22 Sunday, 2026-03-20 Friday, 2026-04-22 Wednesday.

Card A: statement day 3, gap 25, rule `next`, pay 2 working days before. Register: 20 Sep −S$200.00, 2 Oct −S$934.56, 3 Oct −S$100.00 (on the statement day, so included), 10 Oct −S$165.44 (after it).

| Check | Expected |
|---|---|
| as_of 2026-10-18, current | statement 2026-10-03, due 2026-10-28 (3 Oct + 25, a Wednesday), last safe 2026-10-26 (Mon), statement balance 1,234,560, minimum 50,000 (3% is 37,040, the S$50 floor wins), owed now 1,400,000, `unscheduled` |
| as_of 2026-10-18, next | statement 2026-11-03, due 2026-11-30 (28 Nov is a Saturday, moved to Monday), last safe 2026-11-26 (Thu), statement balance so far 1,400,000 |
| as_of 2026-01-02 (year boundary) | current statement 2025-12-03, due 2025-12-29 (28 Dec Sunday to Monday), last safe 2025-12-25; next statement 2026-01-03, due 2026-01-28 |
| as_of 2026-10-29, nothing paid | `overdue`, default pay date 2026-10-29 |
| one-off schedule Account B to Card A, 2026-10-26, −1,234,560, `never`, key `card-pay:<card>:2026-10-03` | `scheduled` with that schedule id, pay date 2026-10-26, amount 1,234,560, funding Account B; the next cycle stays `unscheduled`; still `scheduled` (not overdue) at 2026-10-29; an identical retry returns the same schedule id |
| owner materialise through 2026-10-26, as_of 2026-10-27 | `posted`, approved false, amount 1,234,560, date 2026-10-26 |
| approve the card-side row | `paid` with that transaction id, amount 1,234,560, date 2026-10-26; owed now 165,440 |

Card C: statement day 31, gap 22, rule `previous`, no transactions.

| Check | Expected |
|---|---|
| as_of 2026-03-10 | current statement 2026-02-28 (31 clamped), due 2026-03-20 (28 Feb + 22 = Sunday 22 Mar, moved back to Friday), last safe 2026-03-18; next statement 2026-03-31, due 2026-04-22 |
| balance zero | statement balance 0, minimum 0, `unscheduled` even past the due date (2026-03-25) |
| as_of 2028-03-05 | statement 2028-02-29 (leap year) |
| `enabled: false` | no cycles for the card |

Writes and validation: PUT fills every default; an exact retry with the same `Idempotency-Key` returns 200 without moving `server_knowledge`; the same key with another body is 409; a checking account, `statement_day` 32, an unknown field, `fixed` without an amount, the card funding itself and a missing funding account are 400 and leave the terms unchanged; a missing card is 404; `as_of=2026-02-30` is 400. DELETE returns the removed terms, an exact retry replays the same body, then GET and an unkeyed DELETE are 404. Without `as_of` the view uses today in the configured zone (UTC on this Bun host, Asia/Singapore in the D1 run). The plan snapshot export carries `card_payment_terms`; importing it into an empty D1 plan reports `card_payment_terms: 2`, returns identical terms and derives the same paid cycle.

## Observed

Bun/SQLite stack (`http://127.0.0.1:51031`, db `/tmp/howmuch-verify/20261018T120142-2005/howmuch.sqlite`): **46/46 passed**. D1 path: **50/50 passed** (the extra four are the snapshot round trip and the receipts). Sample response (Bun, after the schedule was created):

```json
{"data":{"as_of":"2026-10-18","cycles":[{"account_id":"acct_505a4c3d-…","cycle":"current","statement_date":"2026-10-03","due_date":"2026-10-28","last_safe_pay_date":"2026-10-26","default_pay_date":"2026-10-26","statement_balance":1234560,"minimum_due":50000,"current_balance":1400000,"coverage":{"state":"scheduled","scheduled_transaction_id":"scheduled_be689203fe3999632a10dead","pay_date":"2026-10-26","amount":1234560,"funding_account_id":"acct_cc842137-…"}},{"account_id":"acct_505a4c3d-…","cycle":"next","statement_date":"2026-11-03","due_date":"2026-11-30","last_safe_pay_date":"2026-11-26","default_pay_date":"2026-11-26","statement_balance":1400000,"minimum_due":50000,"current_balance":1400000,"coverage":{"state":"unscheduled"}}],"server_knowledge":50}}
```

Persisted rows on the Bun stack (`db-bun.txt`): the `card_payment_terms` row for Card A (Card C's was deleted), `card_payment_terms.put` and `.delete` audit receipts, `schema_migrations` holding `024_card_payment_terms`, and the table plus both ownership triggers. D1 run: `write_commands` holds `card_payment_terms.put` and `card_payment_terms.delete` receipts.

Schema probe (`bun .amp/in/artifacts/card-payments-backend/trigger-probe.ts`, output in `trigger-probe.txt`, D1 migrations on an empty database): terms for a card under another plan, a funding account from another plan, a deleted funding account and a card funding itself are rejected by the ownership triggers; `fixed` without an amount and `statement_day` 0 are rejected by CHECK constraints.

## Other verification

- `bun test`: 751 pass, 0 fail (existing suites, including `apps/api/tests/d1.test.ts`, which now also applies `0021`).
- `bunx tsc --noEmit -p apps/worker`: clean. `bun run verify:worker`: web typecheck and bundle, then `wrangler deploy --dry-run` succeeded.
- `bun run build:ios-engine` and `bun run check:ios-engine` with Bun 1.4.0 (the version the script pins): "The iOS engine is up to date."
- No isolated unit test was added. Every date rule (month-end clamp, leap year, both weekend rules, year boundary, working days back) is reachable through `as_of` on the real route, and is checked above with independently derived dates.
- Not covered: the iOS Simulator and web UI (no client UI exists yet); viewer-role reads and refused writes use the existing plan authorisation unchanged and were not re-driven.
