# ensureTransferPayee: run record

- Revision: origin/main 35e3632 plus the createAccountReseed commit plus this commit.
- Change: removed two catch blocks in `ensureTransferPayee` that handled a payee-name collision
  (suffix the name on insert, keep the stale label on rename). Migration 006 dropped any unique
  index on payee names, leaving only `idx_payees_one_transfer_per_account`, which a name suffix
  cannot satisfy, so neither catch could do its job; a real failure now surfaces instead of being
  retried or swallowed.
- Fixture and driver: `../createAccountReseed/e2e-clusters.{sh,mjs}` (two local API processes on
  one temp SQLite file, synthetic data). Step group c2 creates two accounts both named "Twin",
  renames an account, and seeds an account whose `transfer_payee_id` points at a payee that does
  not exist yet (the mid-import path, which is kept).
- Expected: transcript identical to `../createAccountReseed/before.txt` (origin/main). The
  baseline already shows two payees named "Transfer : Twin" (c2.c): the suffix branch never ran.
- Observed: `diff before.txt after.txt` is empty (`after.txt` here). `bun test` in apps/api: 443 pass.
  Worker typecheck clean. Bun 1.4.0 engine rebuilt, `check` prints "The iOS engine is up to date."
