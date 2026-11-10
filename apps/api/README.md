# HowMuch API

Shared ledger, import, report, and HTTP code for two runtimes: local Bun/SQLite and hosted Cloudflare Worker/D1. `/v1` is the YNAB-compatible surface; `/api` provides reports, imports, and quick entry.

```sh
bun run api:dev
bun test apps/api/tests
```

Useful local settings: `HOWMUCH_HOST` (bind address, default `127.0.0.1`; a non-loopback host needs `HOWMUCH_API_TOKEN`, as does any tunnel or reverse proxy to the loopback server) and `HOWMUCH_YNAB_BASE_URL` (YNAB API base URL for `/api/import/ynab`, default `https://api.ynab.com/v1`).

SQLite applies the migrations listed in `src/db.ts`, in order; a new file in `migrations/` runs only once it is added to that list. D1 applies every file in `d1-migrations/` (see [D1 Foundation](../../docs/d1-foundation.md)). The D1 payee schema deliberately permits distinct YNAB payee IDs to share a display name. The raw-object mirror preserves imported YNAB fields that are not yet normalised, including monthly targets, scheduled transactions, locations, and money movements. Imported schedules are copied into the schedule tables, which the API reads; the mirror is not. HowMuch has no budgeting, so month, assignment and target data is mirrored but never served. Scheduled transactions support HowMuch-local CRUD plus explicit, idempotent Enter Now and bounded owner catch-up through the effective `/v1` view. Account reconciliation has a read-only preview plus an exact, idempotent `POST /v1/plans/{plan_id}/accounts/{account_id}/reconcile` write, requiring a statement date, integer statement balance, and `Idempotency-Key`. Browser authentication uses a secure session cookie, native clients use opaque bearer sessions, and plan membership is enforced at the HTTP boundary. Signed-in browser users can create and revoke long-lived personal API tokens whose raw values are shown once and never stored; `HOWMUCH_API_TOKEN` remains for one-time owner setup and default-plan integrations.

Halation has no recurring YNAB sync: YNAB data arrives only through the one-off import. Production runs one cron, `5 16 * * *`, for scheduled materialisation. Preview and local development have no cron.
