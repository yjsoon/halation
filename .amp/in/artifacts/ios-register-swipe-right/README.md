# Register right swipe on approved rows

- Base: `01c76430` (main at the time), rebased before landing. Change in `apps/ios/HowMuch/Views/RegisterView.swift`.
- Stack: `control-howmuch launch` (isolated SQLite, seeded `fixtures/demo-ledger.json`), owner `verifier`. SimplyGo (`txn-2026-05-bus`) set to `approved: false` through the local API. No production data.
- Device: Amp Mac satellite, iOS 27.2 simulator, iPad Pro 11-inch (M5) in landscape with the sidebar beside the register. Gestures were driven with `axe swipe`.

## Cause

Approved rows had no leading swipe action, so the List ignored a right swipe and the row's button took the touch as a tap and opened the transaction editor. On unchanged main, an 80pt right swipe and a fast right swipe on Cold Storage (approved, uncleared) both opened the editor.

## Change

A right swipe now does what the status circle does: Approve on a new row, Clear on an uncleared row, Unclear on a cleared row, nothing on a reconciled row. Confirm Amount stays beside them for rows to confirm.

## Steps and outcomes

| Row | Gesture | Observed |
| --- | --- | --- |
| Cold Storage, approved and uncleared | 80pt right, fast right | Clear opens; editor does not open |
| Cold Storage | full swipe right | API `cleared: "cleared"` |
| Cold Storage, cleared | 80pt right | Unclear opens |
| Cold Storage, cleared | full swipe right | API `cleared: "uncleared"` |
| SimplyGo, new | 80pt right | Approve opens, as before |
| Cold Storage | 80pt left | Delete opens, as before |

`scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on iPhone 17 Pro: `Executed 825 tests, with 1 test skipped and 0 failures` (before rebase; rerun after rebase recorded in the landing report).

## Files

- `before-approved-right-opens-editor.png`: unchanged main.
- `after-approved-right-clear.png`, `after-cleared-right-unclear.png`, `after-new-right-approve.png`.
