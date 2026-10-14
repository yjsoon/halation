# Run record: handleAuth password-change rate key

- Revision: this commit on top of origin/main e7a5e08.
- Change: the per-account key and its CHECK-constraint rationale moved into `passwordChangeRateKey(userId)`; the inline comment block in `handleAuth` is gone. Key and scope are byte-identical (`username`, sha256 of `pwchange:<id>`).
- Fixture: synthetic ledger and owner `verifier`; real Worker request path over loopback HTTP on a SQLite-backed local D1 binding. No real data, no Cloudflare.
- Command: `bun .amp/in/artifacts/handleAuth-password-change-rate-key/e2e.ts`.
- Steps: set up owner; 12 failed sign-ins (anonymous); sign in with the right password; then 11 POSTs to `/api/auth/password` with a wrong current password using the owner's session.
- Expected: sign-in returns 429; the first ten password changes return 401 (own counter untouched by sign-in failures), the eleventh 429; `login_rate_limits` holds three separate rows (ip, sign-in username, pwchange key).
- Observed: 429; `401 x10, 429`; three rows (ip 13, username 13, username 11). All PASS.
- Also: `cd apps/api && bun test` 410 pass, 0 fail; worker typecheck clean; iOS engine rebuilt (Bun 1.4.0) and up to date.
