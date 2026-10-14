# Worker: name the "YNAB in play" test

- Revision: origin/main 6ec33a9 plus this commit.
- Change: the `ynabInPlay` local in `scheduled()` and the comment above it became `isYnabInPlay(explicitCron, config)`, whose doc says why the default YNAB cron time only means a YNAB sync when YNAB is configured. The condition is unchanged.
- Fixture: SQLite-backed fake D1 binding carrying the repo's D1 migrations, one fresh database per scenario, synthetic data (one cash account, one scheduled transaction). No network, no Cloudflare.
- Command: `bun .amp/in/artifacts/workerYnabInPlay/e2e.ts` runs the real Worker `scheduled()` entry point for eleven scenarios and prints what each did.
- Steps and expected: the default YNAB-time cron with no YNAB configuration materialises; with only a YNAB token, only a YNAB plan, an explicit YNAB cron or transition read-only it takes the YNAB branch (rejects with the missing-credentials message, since no credentials exist here); an explicit YNAB cron sends the default cron to materialisation; read-only refuses a non-YNAB cron; a missing cron is refused; one failing schedule beside a good one rejects after logging a count-only summary.
- Observed: `before.txt` was captured on unmodified main, `after.txt` on this commit, and `diff before.txt after.txt` is empty.
- Also: `bun test tests/d1.test.ts` in apps/api (80 pass, includes the Worker cron tests); `bun run --cwd apps/worker typecheck` clean. The iOS engine bundle does not include the Worker.
