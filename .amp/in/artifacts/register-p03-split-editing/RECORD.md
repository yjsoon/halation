# P-03: editing a posted split from the register

- Revision: branch `p-round3` on `hillclimb` `0e1f6bad`, after the VR-05 commit.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only.
- Write path: the existing `PATCH /v1/plans/{plan}/transactions/{id}` with the whole `subtransactions` set (saved lines keep their `id`; new lines have none; `[]` unsplits). No server change.
- Labels, all already in Quick entry (`pages/QuickEntry.tsx`) or iOS: "+ Split categories", "Use one category", "Split categories", "+ Add line", "Remove line", Outflow and Inflow, "Payee / memo", "✓ Lines match the total.", "left to assign.", "A split transaction needs at least two lines.", "Enter a valid signed amount for every split line.".
- Steps: open `/transactions?range=all&accounts=acct-everyday`, focus the row, press Enter, use the split editor in the band below the row, Save, then `GET /v1/plans/local-plan/transactions?since_date=...`. Scripts: `.amp/in/orb-backup/p03open.sh` and `p03lib.sh`.

## Cases and read-back

1. Edit lines and add a line, 1440. A two-line split had its amount, payee and memo changed and a third line added. Read back three lines with the edited values.
2. Remove a line, 390. With one line removed the editor said "+$1.00 left to assign." and Save was refused with the same sentence; after correcting the amount it saved. Read back two lines.
3. Ordinary to split with a transfer line, 390 (`c8ff979d`, -40.00, Everyday). "+ Split categories" seeds line 1 with the whole amount; line 1 set to 30.00 Groceries, line 2 to 10.00 with payee "Transfer : Rainy Day Saver". While line 2 had no amount the status stayed empty (it never says the lines match while one is empty); with both amounts it read "✓ Lines match the total.". Read back:
   ```
   c8ff979d 2026-11-17 -40000 Activity Test Grocer cat= None
      line sub_66dd39 -30000 None cat-groceries xfer= None
      line sub_fc62a3 -10000 Transfer : Rainy Day Saver xfer= acct-saver txn_65c08b
   ```
   The same conversion was also made at 1440 earlier in the round (line with transfer `acct-saver` and its mirror).
4. Split back to ordinary, 1440 (same row). "Use one category" brought back the row's Category select; chose Groceries and saved. Read back `c8ff979d -40000 cat= cat-groceries` with no lines, and Rainy Day Saver has no transaction dated 17 Nov from the removed transfer line (its mirror was deleted).
5. A split on a reconciled row, 390. `PATCH` set "Split Test Market" (-9.99: Groceries -4.99, Dining Out -5.00) to `cleared: reconciled`. In the editor: memo on line 1, line 2 to 3.00 (status "+$2.00 left to assign."), "+ Add line", line 3 2.00 Dining Out with payee "Corner Kiosk" ("✓ Lines match the total."). Read back:
   ```
   txn_5ce1f9cc 2026-11-10 -9990 Split Test Market cat= None cleared= reconciled
      line sub_b5f76e -4990 None cat-groceries Reconciled split memo
      line sub_dab07f -2000 Corner Kiosk cat-dining None
      line sub_fccf06 -3000 Split Line Bistro cat-dining lunch part
   ```
   The saved lines kept their ids, payee and memo; the row stays reconciled and its total is unchanged.

## Existing test updated

`apps/web/src/lib/register-row-edit.test.ts`: the expected posted draft now includes `splitLines: null`, since every posted draft carries its split lines.
