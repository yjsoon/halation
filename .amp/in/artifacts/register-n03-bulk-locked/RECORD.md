# N-03: the selection bar says reconciled rows stay locked

- Revision: branch `p-round4` on `hillclimb3` `9afef689`, after the N-02 commit. Changes in `apps/web/src/pages/Transactions.tsx` (bulk bar) and `apps/web/src/styles/app/register.css` (`.register-bulk-note`).
- iOS (`RegisterView.swift:860-876`): the Mark Cleared and Mark Uncleared section has the header "Reconciled transactions stay locked" whenever a picked row is reconciled, and both are disabled when every picked row is. The web now does the same: the sentence (no full stop, as the iOS header) follows the two buttons and describes them (`aria-describedby`), and both are disabled when every selected row is reconciled.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only. Fixture: "N03 Kiosk" on Everyday, uncleared, created by `POST /v1/plans/local-plan/transactions`; the account already has reconciled rows.
- Script: `.amp/in/orb-backup/n03.sh <width> <tag>` ticks two rows whose Cleared cell is "Reconciled", reads the bar, ticks N03 Kiosk as well, reads the bar, chooses Mark cleared, then reads back both rows.

## Before (fix stashed), 1440

```
locked only: note null, Mark cleared enabled, Mark uncleared enabled
mixed:       note null, both enabled
Mark cleared -> "Marked cleared 1 transaction."  (nothing said about the two skipped rows)
```

## After, 1440 and 390 (same output at both widths)

```
locked only: note "Reconciled transactions stay locked", Mark cleared disabled, Mark uncleared disabled, aria-describedby register-bulk-locked
mixed:       note "Reconciled transactions stay locked", both enabled
Mark cleared -> "Marked cleared 1 transaction."
read back: N03 Kiosk cleared; Split Test Market reconciled
```

At 390 the sentence takes its own full-width line under the buttons.
