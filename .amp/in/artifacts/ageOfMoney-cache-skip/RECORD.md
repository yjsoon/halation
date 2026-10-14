# Run record: age-of-money cache skip

- Revision: this commit on top of origin/main 79dfd7e.
- Change: the "skip the cache for category-group filters" decision is the named predicate `ageOfMoneyCacheable(filters)`; the inline workaround comment is gone, the reason lives on the predicate.
- Fixture: synthetic in-memory ledger (one account, two payees, one category group, income 2026-01-05, spend 2026-01-18), D1 migrations applied; no real data, no Cloudflare.
- Stack: real Worker request path (`createHandler` + D1 repository, reports and auth store) served over loopback HTTP on a SQLite-backed local D1 binding.
- Command: `bun .amp/in/artifacts/ageOfMoney-cache-skip/e2e.ts` (also runs the password-change checks, kept identical across the four records).
- Steps: set up owner; GET `/api/reports/age-of-money` twice; GET it with `category_group_ids=g` twice; POST a new spend; GET again.
- Expected: repeat identical with one `report_cache` row; group-filtered requests succeed and add no row; after the write the payload changes and the old row is replaced (still one row).
- Observed: all PASS (unfiltered rows=1, group-filtered rows=1, recomputed after write rows=1).
- Also: `cd apps/api && bun test` 410 pass, 0 fail; `bun run --cwd apps/worker typecheck` clean; iOS engine rebuilt with Bun 1.4.0 and `check` reports up to date.
