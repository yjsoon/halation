# N-09: a deep-linked row outside the filters stays out of the footer

- Revision: branch `p-round4` on `hillclimb3` `9afef689`, after N-07. Change in `apps/web/src/pages/Transactions.tsx`: `footerRows` leaves out the linked row when the filters would not list it; the footer count, totals, search count and "Earliest here" use it. The row is still listed, highlighted and focused.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only. The earliest row is "Paging Row 047" (`txn_7e1c3da8…`, 11 Jan 2026), outside the Ledger's default range.
- Script: `.amp/in/orb-backup/n09.sh <width> <tag>` opens `/transactions?plan=local-plan&transaction=txn_7e1c3da8-10e1-447d-aa61-9d9abe2929f1`, scrolls to the footer and prints it.

| Run | Linked row shown | Footer |
|---|---|---|
| Before (fix stashed), 1440 | yes | 34 transactions · $1,450.00 in · $869.21 out · +$580.79 net · No older transactions. Earliest here: 11 Jan 2026. |
| After, 1440 | yes | 33 transactions · $1,450.00 in · $867.74 out · +$582.26 net · No older transactions. Earliest here: 3 Oct 2026. |
| After, 390 | yes | the same as 1440 |
| `/transactions` with no link, 1440 | n/a | 33 transactions · $1,450.00 in · $867.74 out · +$582.26 net · No older transactions. Earliest here: 3 Oct 2026. |

The footer under the link now equals the same view without it.
