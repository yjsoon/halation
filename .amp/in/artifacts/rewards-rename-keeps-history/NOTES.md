# Rewards colour rename keeps old transaction names

Recipe: `rewards-card-edit` (web), plus the Ledger register and the Rewards **By flag** table.

- Base: `main` at `f9cd9712` with this round's working-tree change (card save no longer rewrites `transactions.flag_name`; readers prefer the row's stored name; group by flag keys on colour plus name).
- Stack: `control-howmuch launch` (run `20261107T142321-11063`), disposable SQLite under `/tmp/howmuch-verify/`, seed `fixtures/demo-ledger.json`. Owner `verifier` created through the setup form. No production data.

## Steps and results

1. Create the card through the API: `POST /api/rewards/cards` with `{"plan_id":"local-plan","card":{"id":"card-travel","name":"Travel Card","issuer":"UOB","type":"cashback","ynabAccountId":"acct-credit","featured":true,"earningRate":1,"flagNames":{"red":"Dining","blue":"Online"}}}`. Response `flagNames` = `{"red":"Dining","blue":"Online"}`.
2. Record the Travel Card flagged rows from SQLite (`id, date, flag_color, flag_name, server_knowledge`) and the plan's `server_knowledge` (37).
3. Open `/rewards/card-travel`, set **Red name** to `Food`, choose **Save card** (`01-editor-rename-red-to-food.png`). The editor closes to `Rewards · Halation` 618 ms after the click. The stored card reads `{"red":"Food","blue":"Online"}`.
4. Read the same rows again. Expected: no change. Observed: `diff` reports the before and after output identical. All four rows keep `flag_name` (three `Dining`, one `Online`) and the same `server_knowledge`; the plan's `server_knowledge` stays 37.
5. Create a new red transaction through `POST /v1/plans/local-plan/transactions` (`txn-e2e-new-red`, Synthetic Bistro, -45.00, `flag_color: "red"`). Response `flag_name` = `Food`.
6. Open the Travel Card register (`/accounts/acct-credit`). Expected: Synthetic Bistro shows `Food`; Candlenut, Scoot and Grab keep `Dining`; MUJI keeps `Online`. Observed in page text and `02-register-old-dining-new-food.png` (Grab is off-screen in the capture but present in the page text with `Dining`).
7. Open Rewards, choose **Historical range** then **All**. Expected: the **By flag** table splits red into its two names. Observed (`03-rewards-by-flag-dining-and-food.png`): `Dining $601.90 3`, `Online $228.90 1`, `Food $45.00 1`.

Before the change, the same rename rewrote every red row on the account to the new name (the retitle on save), which the replaced unit tests asserted.
