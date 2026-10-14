# Worker: name the throw after a failed schedule

- Revision: origin/main c5e1fef plus this commit.
- Change: the inline `if (result.failure_count > 0) throw ...` and the comment above it in `scheduled()` became `failAfterScheduleFailures(failureCount)`, whose doc says why the Worker fails only after the count-only log. Same message, same condition, same order (log, then throw).
- Fixture and driver: the same eleven-scenario driver as `../workerYnabInPlay/` (SQLite-backed fake D1 carrying the D1 migrations, synthetic data, real Worker `scheduled()` entry point). Command: `bun .amp/in/artifacts/workerScheduledThrow/e2e.ts`.
- Relevant scenario: "one failing schedule beside a good one" (a schedule whose payee was deleted, next to a valid one). Expected: the good schedule is written, the log line carries only counts (`failure_count: 1`), and the run then rejects with "Scheduled materialisation completed with schedule failures". All other scenarios must be unchanged.
- Observed: `before.txt` (captured on unmodified main; the preceding Worker PR changed no behaviour) and `after.txt` are identical.
- Also: `bun test tests/d1.test.ts` in apps/api (80 pass, includes "Worker cron logs a count-only failure summary after materialising valid schedules"); `bun run --cwd apps/worker typecheck` clean.
