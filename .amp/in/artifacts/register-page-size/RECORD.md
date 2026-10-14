# REGISTER_PAGE_SIZE shares the API's page maximum

Revision: base `2047fff` (origin/main) plus this commit. Fixture: `control-howmuch launch` stack with the
demo ledger plus 700 synthetic Everyday Account rows (`seed.mjs`, Sep-Oct 2026, payees `Synthetic payee N`).

Steps (`register-paging.mjs <web_url> <out_dir> <label>`, `before` with the web constant hard-coded to 250, `after` with it taken from `@howmuch/register-query`):
1. Sign in as `verifier`, open `/transactions?range=all&accounts=all`.
2. Record every `GET .../transactions` request's `limit` and `offset` and the rows rendered.
3. `GET /v1/plans/local-plan/transactions?limit=9999`.

Expected: unchanged paging, three pages of 250 at offsets 0, 250, 500, and 700 rows rendered; the API still
rejects limits above the shared maximum. Observed: `before.json` and `after.json` are byte-identical (`cmp`):
`limit=250` at offsets 0, 250, 500, 700 rows, no Load more needed. `limit=9999` returns
`400 limit must be between 1 and 250`. One earlier `after` run showed an extra offset-500 request right
after a hot reload of the edited file; two reruns were clean and identical to `before`.
Also: `bun run --cwd apps/web typecheck` clean, `bun test` 896 pass (api and web).
Screenshots: `before.png`, `after.png`.
