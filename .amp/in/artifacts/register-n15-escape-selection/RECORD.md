# N-15: Escape clears a row selection

- Revision: branch `p-round4` on `hillclimb3` `9afef689`, after N-13. Change in `apps/web/src/pages/Transactions.tsx`: a document keydown listener, active only while rows are selected and no row editor, add row, confirmation, Reconcile editor, suggestion review, Account settings or card terms is open, clears the selection on Escape. It also steps aside for an open dialog, the phone drawer, the accounts menu, the icon picker and an open payee list. Focus stays where it was unless it was in the selection bar (which goes), when it moves to select-all, or Filters on a phone.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only. Selection is local state, so there is no write to read back.
- Script: `.amp/in/orb-backup/n15.sh <width>` on the Everyday register: ticks two rows and presses Escape in four situations, reporting the selection, editor, drawer and focus.

## Before (fix stashed), 1440

```
picked, focus on a row box: × 2 selected
  Escape: × 2 selected (unchanged)
```

## After

| Situation | 1440 | 390 |
|---|---|---|
| Focus on a row's checkbox, Escape | selection cleared, focus stays on that checkbox | the same |
| Focus on Mark cleared in the bar, Escape | cleared, focus to "Select all visible transactions" | cleared, focus to Filters |
| Row editor open, Escape twice | first closes the editor (selection kept, focus on the row), second clears | the same |
| Drawer open (phone), Escape twice | n/a | first closes the drawer (selection kept, focus on Open menu), second clears |
