# unapprovedCountQuery hook extraction: run record

- Revision: origin/main `2047fff` plus the two earlier commits in this series; baseline log taken on `2047fff`.
- Stack: `control-howmuch launch` (isolated SQLite under `/tmp`), synthetic `HowMuch Demo` plan, owner `verifier`. No production data.
- Fixture: each run POSTs two unapproved outflows (`Probe 1` $5.00, `Probe 2` $10.00) to Everyday Account with the disposable bearer token.

## Steps

1. A. Open Everyday Account and read the "new to approve" pill (count endpoint), open it, choose "Approve all" (a local write), read the pill and the server count.
2. C. Open Scheduled and return to Everyday Account: the count must be re-read after the write, not reused.
3. B. Open `/transactions?range=all&accounts=acct-everyday,acct-saver`: two accounts, so the count endpoint is not used and the pill counts queue rows.

## Expected

`useUnapprovedCount` builds the cache key from named inputs, including `ledgerVersion` (validated knowledge and cache epoch), so the page no longer carries a comment on why unused-looking values sit in a key. Pill text, server counts and the request sequence are identical to the baseline: one `unapproved_count` request per mount for a single account, a new one after the approve-all write, none for two accounts.

## Observed

- Pill `2 new to approve`, server count 2; after approve all the pill is gone and the count is 0; the count is re-requested after the write and on returning from Scheduled; two-account scope makes no count request and shows `2 new to approve` from rows.
- `run-base.log` and `run-c3.log` are identical after dropping the row-order line.
- `bun run --cwd apps/web typecheck` passes; `bun test` in apps/web: 413 pass, 0 fail.

Screenshots: `A-badge.png`, `A-approved.png`.
