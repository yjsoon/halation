# Run record: D1 batchRead vs atomicBatch

- Revision: this commit on top of origin/main b26417c.
- Change: `D1Database.batchRead` and `atomicBatch` already share the private `sendBatch`; that shared helper is the shape that stops either entry point counting through the other, so the "Deliberately not via atomicBatch()" comment is deleted and `sendBatch`'s doc now says it backs both. The D1 snapshot/atomicity doc comments are kept. Statement order, transaction semantics and arguments are untouched.
- Fixture: synthetic ledger (see e2e.ts); real Worker request path over loopback HTTP on a SQLite-backed local D1 binding. No real data, no Cloudflare.
- Command: `bun .amp/in/artifacts/D1-batchRead-vs-atomicBatch/e2e.ts`.
- Steps: set up owner (atomicBatch writes: setup, session); POST two transactions (atomicBatch); GET the transaction list (batchRead: page and server_knowledge in one batch); remaining checks as in the other records.
- Expected: list returns both rows plus numeric `server_knowledge`; every other check passes.
- Observed: all PASS.
- Also: `cd apps/api && bun test` 410 pass, 0 fail (the counting-D1 tests cover per-entry-point round-trip counts); worker typecheck clean; iOS engine up to date, bundle unchanged (d1.ts is not in it).
