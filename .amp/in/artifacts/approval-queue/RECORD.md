# approvalQueue loader extraction: run record

- Revision: origin/main `2047fff` plus the `validatedKnowledge` commit before it; baseline log taken on `2047fff`.
- Stack: `control-howmuch launch` (isolated SQLite under `/tmp`), synthetic `HowMuch Demo` plan, owner `verifier`. No production data.
- Fixture: each run POSTs two unapproved outflows (`Probe 1` $5.00, `Probe 2` $10.00) to Everyday Account with the disposable bearer token.

## Steps

1. A. Open Everyday Account, read the "new to approve" pill (queue must not be requested yet), open the pill, choose "Approve all".
2. C. Open Scheduled and return to Everyday Account.
3. B. Open `/transactions?range=all&accounts=acct-everyday,acct-saver` (no count endpoint for two accounts, so the queue loads eagerly), read the pill, open it, approve all.
4. Retry path: route every `type=unapproved` page to `has_more: true` with a different `server_knowledge` each time, open the two-account register.

## Expected

The queue is fetched by `fetchUnapprovedQueue` and gated by a single `approvalQueueNeeded` flag instead of an inline loop that repeated the condition. Pill text, server counts and the request sequence are identical to the baseline. In the retry path every pass is rejected, three attempts are made per mount, and the register shows "Transactions changed while the approval queue was loading. Try again."

## Observed

- A, B, C: same pill text and counts as baseline (`2 new to approve`, server count 2, then none and 0). Single-account queue request appears only after the pill is opened; the two-account queue is requested on load.
- `run-base.log` and `run-c2.log` are identical after dropping the row-order line.
- Retry path: 12 queue requests (2 effect runs under StrictMode x 3 attempts x 2 pages) and the error text is visible (`retry-error.png`). This path was observed on the new code only.
- `bun run --cwd apps/web typecheck` passes; `bun test` in apps/web: 413 pass, 0 fail.

Screenshots: `A-queue.png`, `B-multi.png`, `retry-error.png`.
