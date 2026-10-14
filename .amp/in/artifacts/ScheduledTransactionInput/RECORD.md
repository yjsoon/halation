# ScheduledTransactionInput.subtransactions run record

- Base: origin/main 2047fff plus the two earlier commits (unrelated code). Change: `ScheduledTransactionInput.subtransactions` is required and set in the input literal (`isSplit ? lines : []`), replacing the trailing `if (!isSplit) input.subtransactions = []` and its comment.
- Fixture and command: as for ScheduleEditor, `.amp/in/artifacts/run-fresh.sh .amp/in/artifacts/ScheduleEditor/drive.cjs .amp/in/artifacts/ScheduledTransactionInput` (synthetic seed, schedules A plain and B split).
- Expected: identical observed behaviour and identical PATCH bodies to the previous commit; unsplitting B clears its lines on the server; saving plain A sends `subtransactions: []`.
- Observed: same six result lines as the ScheduleEditor record (`afterSaveA: A.lines=0`, `afterUnsplitB: B.lines=0`). `payloads.json` equals the previous commit's request bodies once object key order is ignored (checked with a node one-liner). The wire payload is unchanged, so `apps/api` and the iOS engine are unaffected.
- Also run: `bun run --cwd apps/web typecheck` (clean), `bun test apps/web` (413 pass).
