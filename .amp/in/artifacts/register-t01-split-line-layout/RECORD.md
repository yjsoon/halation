# T-01: an open Payee / memo no longer stretches a split line

- Revision: branch `p-round5` on `hillclimb5` `767ea37a`. Changes in `apps/web/src/components/RegisterEditableRow.tsx` (the Payee and Memo fields are wrapped in `div.split-line-memo-fields`) and `apps/web/src/styles/app/register.css`: the two columns move to that div, since a `<details>` element's children are not its grid items; above 720 pixels Category, Amount, Outflow or Inflow, Payee / memo and Remove line sit in one row, and an open Payee / memo takes a full-width row under them. The phone layout is unchanged apart from the class the single column is set on.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only. Layout only, no write.
- Script: `.amp/in/orb-backup/t01.sh <width> <tag> [row]` opens the row editor on a split on the Everyday register and measures each line: height, the offset of Category, Amount and Outflow or Inflow from the line's top, and the left offsets of the Payee and Memo fields.
- Fixtures: "Split Test Market", three lines, each with a payee or memo (all open); "Activity Test Split Shop", two lines, one open and one closed.

| Run | Line height | Category / Amount / Outflow top | Payee, Memo left |
|---|---|---|---|
| Before (fix stashed), 1440, three open | 185 | 149 / 148 / 151 (pinned to the bottom) | 585, 585 (stacked) |
| After, 1440, three open | 168 | 25 / 23 / 27 | 0, 531 (two columns) |
| After, 1024, three open | 168 | 25 / 23 / 27 | 0, 463 |
| After, 721, three open | 168 | 25 / 23 / 27 | 0, 310 |
| Before, 1440, one open and one closed | 185 and 61 | 149 / 148 / 151, then 25 / 23 / 27 | stacked |
| After, 1440 and 721, one open and one closed | 168 and 61 | 25 / 23 / 27 on both | 0, 531 (721: 0, 310); the closed line keeps Payee / memo in its row |
| Before and after, 390 | 341 | 25 / 23 / 67 | 0, 0 (one column, unchanged) |

The 168 pixels of an open line at 1440 are its content (a row of controls, the Payee / memo summary and one row of two fields), with no empty block above the controls.
