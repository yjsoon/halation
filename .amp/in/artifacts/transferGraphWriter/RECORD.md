# transfer graph writer: run record

- Revision: origin/main 116a29f plus this commit.
- Change: the rule "a new other side starts uncleared, except a schedule entered into a cash
  account" was spelled out four times (two in `repository.ts`, two in the D1 graph writer in
  `d1-transaction-repository.ts`) with a "as on SQLite" comment keeping them in step. It is now
  `newLinkedSideCleared` in `scheduled-transactions.ts`, called from all four sites, and the
  parity comment is gone. The remaining "as on SQLite" comments (category drop, transfer payee,
  mirror-owned fields) describe other rules and were left alone.
- Fixture and driver: `../createAccountReseed/e2e-clusters.{sh,mjs}`, local SQLite stack only.
  Step group c3 writes a transfer, edits it, writes a split with a transfer line, then creates
  and materialises a schedule into a cash account.
- Expected: transcript identical to `../createAccountReseed/before.txt`; in particular c3.a mirror
  `uncleared`, c3.c split mirrors `uncleared`, c3.d mirror in the cash account `cleared`.
- Observed: diff against before.txt is empty (`after.txt` here). `bun test` in apps/api: 410 pass, 0 fail
  (these include the D1 planner suites, which the HTTP stack does not exercise). Worker typecheck
  clean. Bun 1.4.0 engine rebuilt, `check` prints "The iOS engine is up to date."
