# refreshAfterBulk run record

- Base revision: origin/main 2047fff. Change: `runBulkWrite` wrapper in `apps/web/src/pages/Transactions.tsx`.
- Fixture: disposable stack from `.amp/in/artifacts/run-fresh.sh` (`control-howmuch launch`, private state root, synthetic `HowMuch Demo` seed). Owner `verifier` created through the setup form. Six synthetic rows `BulkVerify 1..6` on Everyday Account, dated 2026-10-14, seeded through the local API.
- Command: `.amp/in/artifacts/run-fresh.sh .amp/in/artifacts/refreshAfterBulk/drive.cjs <out-dir>`
- Steps and expected outcomes:
  1. Select rows 1-2, Mark cleared. Toast "Marked cleared 2 transactions."; selection bar gone; API `cleared` for both.
  2. Select rows 3-4, Categorise to Dining Out. Toast "Categorised 2 transactions."; API category Dining Out for both.
  3. Select rows 5-6, Delete, confirm dialog "Delete 2 transactions?", Delete transactions. Toast "Deleted 2 transactions."; dialog closed; rows gone on screen and from API.
  4. Select row 1, abort the `POST /transactions/cleared` request, Mark uncleared. Alert "Could not update this transaction." plus "may or may not have been updated"; selection kept; register re-read once; controls usable again (lock released).
- Observed after the change (also observed identically on the unchanged base 2047fff, run first for comparison):
  - `cleared: api=cleared,cleared selectionBarGone=true`
  - `categorised: api=Dining Out,Dining Out`
  - `deleted: api row5=undefined row6=undefined rowsOnScreen=0 dialogGone=true`
  - `failure: errorShown=true registerReReads=1`, bar still offers Mark cleared / Mark uncleared, alert text as above.
- Screenshots: `cleared.png`, `categorised.png`, `delete-confirm.png`, `deleted.png`, `failure.png` (this directory).
- Also run: `bun run --cwd apps/web typecheck` (clean), `bun test apps/web` (413 pass, 0 fail).
- Not covered: the reconciliation preview regeneration (needs an open reconcile sheet; the call site is unchanged and still goes through `refreshAfterBulk`).
