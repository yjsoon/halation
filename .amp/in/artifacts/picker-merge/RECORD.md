# iOS picker merge

Revision: base `1eb5ca19`, this round's commit on top.

## What changed

The eight iOS payee and category pickers (transaction form, transaction split line, scheduled editor, scheduled split line) are now one `PayeePicker` and one `CategoryPicker` in `Pickers.swift`, each taking the current selection and an `onPick` closure. The scheduled editor and its split lines gain the inline search field, and their category list puts everyday groups before bookkeeping ones. Each surface keeps its rows: the transaction form keeps Recent, Create payee and `Transfer : X` transfers; split lines keep No Payee, Create and Transfers; scheduled pickers keep No Payee and `Transfer to X`, with no Create or Recent.

## Steps

A throwaway `SnapshotSurface` test on the iPhone SE (3rd gen) simulator, iOS 27.3, drove the real editors with synthetic payees (Lunch Shop, FairPrice Finest, a transfer payee for Travel). The test was deleted afterwards.

- Scheduled editor: open Payee, type `lun`, pick Lunch Shop; open Category, type `din`, pick Dining Out.
- Transaction form (account Everyday): open Payee, type `Noodle Bar`, pick Create payee; open Category, type `gro`, pick Groceries; reopen Payee, pick `Transfer : Travel`.

## Expected and observed

| Step | Expected | Observed |
| --- | --- | --- |
| Scheduled payee list | `Search payees`, No Payee, Payees, Transfers as `Transfer to Travel`, no Recent | matches |
| Scheduled search `lun` | only Lunch Shop, no Create row | matches |
| Scheduled search `din` | only Dining Out | matches |
| Scheduled editor after | Payee Lunch Shop, Category Dining Out | matches |
| Form payee list | `Search or add a payee`, Payees, `Transfer : Travel`, no No Payee | matches |
| Form search `Noodle Bar` | Create payee row; picking it sets the payee | matches |
| Form category `gro` | Groceries set | matches |
| Form transfer to Travel | category cleared (both on budget) | matches |

The white band under the pickers is the area kept for the software keyboard, which the test window does not draw.

## Checks

- `scripts/ios-xcodebuild.sh test`: 825 tests, 1 skipped (opt-in live Foundation Models), 0 failures.

## Captures

- `scheduled-editor.jpg`: payee list, `lun` search, `din` search, editor after.
- `transaction-form.jpg`: payee list, create `Noodle Bar`, after Groceries, after the transfer.
