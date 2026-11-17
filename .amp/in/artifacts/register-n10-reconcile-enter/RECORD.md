# N-10: Enter reviews a reconciliation, and focus stays in the editor

- Revision: branch `p-round4` on `hillclimb3` `9afef689`, after N-09. Change in `apps/web/src/pages/Transactions.tsx`: the Reconcile editor's fields are a form whose submit is its main button (Review reconciliation, then Confirm reconciliation, which still needs the acknowledgement ticked); the review takes focus when it opens; with no opener to return to, Escape falls back to Add on the desktop and to Filters on a phone (Add is hidden there).
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only.
- Script: `.amp/in/orb-backup/n10.sh <width> <tag> <enter|click> [focus]` opens Travel Card, opens Reconcile, types -100.00 in Statement balance, presses Enter (or presses Enter on a focused Review reconciliation), prints the review state and focus, then presses Escape.

| Run | Review shown | Focus after | Escape focus |
|---|---|---|---|
| Before (fix stashed), 1440, Enter in Statement balance | no | INPUT | Add transaction |
| Before, 1440, Review reconciliation button | yes | BODY | BODY (editor stayed open) |
| After, 1440, Enter | yes | the review (`div.reconcile-review`) | Add transaction |
| After, 1440, button | yes | the review | Add transaction |
| After, 390, Enter | yes | the review | Filters (no opener) / Reconcile (opened from Reconcile) |
| After, 1440, Enter, opened from Reconcile | yes | the review | Reconcile |

## Completed end to end, 1440

Statement balance -64003.30, Enter: review shows Difference $0.00 and keeps focus. Ticked the acknowledgement, Enter on Confirm reconciliation:

```
toast: "Travel Card reconciled through 17 Nov 2026. 1 cleared transaction matched −$64,003.30."  focus: BUTTON:Reconcile
read back: acct-credit last_reconciled_date 2026-11-17
```
