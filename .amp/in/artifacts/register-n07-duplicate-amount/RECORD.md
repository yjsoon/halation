# N-07: Duplicate for today copies the amount with the currency's decimals

- Revision: branch `p-round4` on `hillclimb3` `9afef689`, after N-06. Change in `apps/web/src/lib/register-compose.ts`: `formatMilliunitsPadded` now pads to the plan currency's decimal places (two for cents, none for yen) instead of always two, and `duplicateComposeDraft` and `quickEntryCopy` use it. Quick entry gets the dot-decimal form, since its amount is a number field.
- The same helper formats the add row's amount on blur and the row editor's amounts, so under a yen plan they no longer show ".00" either.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan` (SGD), synthetic data only. Fixture: "N07 Bakery", Everyday, -42.10, Groceries.
- Script: `.amp/in/orb-backup/n07.sh <width>` opens the row editor on N07 Bakery, chooses Duplicate for today and prints the copied amount.

| Run | 1440 (add row Outflow) | 390 (Quick entry Amount) |
|---|---|---|
| Before (fix stashed) | 42.1 | 42.1 |
| After | 42.10 | 42.10 |

Saved from Quick entry at 390 ("N07 Bakery saved."), read back: `2026-11-17 -42100 cat-groceries acct-everyday`.
