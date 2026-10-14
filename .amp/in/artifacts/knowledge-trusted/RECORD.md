# knowledgeTrusted -> validatedKnowledge: run record

- Revision: origin/main `2047fff` (baseline) versus the same tree with this change applied.
- Stack: `control-howmuch launch` (isolated SQLite under `/tmp`, own state root), synthetic `HowMuch Demo` plan, owner `verifier`. No production data.
- Fixture: each run POSTs two unapproved outflows (`Probe 1` $5.00, `Probe 2` $10.00) to Everyday Account with the disposable bearer token.
- Driver: Playwright (Chromium) script, steps below. Request log is every `/v1/` call after the bootstrap reads.

## Steps

1. A. Open Everyday Account from the sidebar. Read the "new to approve" pill. Open it (queue loads). Choose "Approve all". Read the pill and the server count.
2. C. A local write has just happened (approve all). Open Scheduled, then return to Everyday Account.
3. B. Open `/transactions?range=all&accounts=acct-everyday,acct-saver` with two fresh unapproved rows, read the pill, open it, approve all.

## Expected

The plan context now hands pages `validatedKnowledge` (null while provisional or after a local write) instead of making each page combine `ledgerKnowledge` with a trust flag. Behaviour must be unchanged: same pill text, same server count, and the same request sequence as the baseline, in particular Scheduled and the register refetching after the write instead of reusing a cached slot.

## Observed

- A: pill `2 new to approve`, server count 2; queue shows both Probe rows; after approve all the pill is gone and the server count is 0.
- C: Scheduled heading visible; Scheduled issues fresh `GET /scheduled_transactions` after the write; returning to the ledger refetches count and page; no pill.
- B: pill `2 new to approve` (counted from rows, no count endpoint call); gone after approve all, server count 0.
- Request logs `run-base.log` (origin/main) and `run-c1.log` (this change) are identical after dropping the row-order line (same-date rows come back in either order between runs).
- `bun run --cwd apps/web typecheck` passes; `bun test` in apps/web: 413 pass, 0 fail.

Screenshots: `A-queue.png`, `C-scheduled.png`. Repeat: launch a stack, run the three steps, compare the logs.
