# N-13 (register part): amount placeholders follow the plan's currency

- Revision: branch `p-round4` on `hillclimb3` `9afef689`, after N-12. `apps/web/src/lib/money.ts` gains `amountDecimalDigits`, `amountStep` and `amountPlaceholder`; Quick entry (`pages/QuickEntry.tsx`, amount and split line amounts, placeholder, step and the split line's minimum), New account (`pages/NewAccount.tsx`), the add row (`components/RegisterComposeRow.tsx`), the row editor and split editor (`components/RegisterEditableRow.tsx`) and Reconcile (`pages/Transactions.tsx`) use them. `lib/register-compose.ts` takes its digit count from the same helper.
- Not in this commit: the Settings note under Currency (`pages/Settings.tsx:306`), which belongs to another worker.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only. The plan was switched to JPY with `PATCH /api/plans/local-plan/settings` (`decimal_digits: 0`, `¥`) and back to SGD afterwards.
- Script: `.amp/in/orb-backup/n13.sh <width>` prints each visible amount field's placeholder (and Quick entry's step) on `/add`, `/accounts/new`, the Everyday register's add row (desktop only) and row editor, and Reconcile.

| Run | Quick entry | New account | Add row | Row editor | Reconcile |
|---|---|---|---|---|---|
| Before (fix stashed), JPY, 1440 | 0.00, step 0.01 | 0.00 | 0.00, 0.00 | 0.00, 0.00 | 0.00 |
| After, JPY, 1440 | 0, step 1 | 0 | 0, 0 | 0, 0 | 0 |
| After, JPY, 390 | 0, step 1 | 0 | (no add row on a phone) | 0, 0 | 0 |
| After, SGD, 1440 | 0.00, step 0.01 | 0.00 | 0.00, 0.00 | 0.00, 0.00 | 0.00 |

Under JPY the row editor still shows a stored 42.10 as "42.1", since an amount saved with more decimals than the currency keeps them.
