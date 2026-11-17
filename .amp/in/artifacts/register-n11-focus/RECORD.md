# N-11 (register part): focus after Create account and after approving the last new row

- Revision: branch `p-round4` on `hillclimb3` `9afef689`, after N-10. Changes in `apps/web/src/pages/NewAccount.tsx` (navigates with `state: { focusHeading: true }`) and `apps/web/src/pages/Transactions.tsx` (the register heading takes focus when asked; approving the last row of the approval list leaves the list and focuses that row).
- Not in this commit: first-owner setup (`state/plan.tsx`) and Save card (`RewardCardEdit.tsx`), which belong to other workers.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only.

## Create account

Script `.amp/in/orb-backup/n11a.sh <width> <name>`: open `/accounts/new`, type a name, Create account, print the address and focus.

| Run | Lands on | Focus |
|---|---|---|
| Before (fix stashed), 1440 | `/transactions?accounts=acct_6133e061…&range=all` | BODY |
| After, 1440 | `/transactions?accounts=acct_bcbe9839…&range=all` | H1 "N11 Wallet Wide" |
| After, 390 | `/transactions?accounts=acct_8f93304e…&range=all` | H1 "N11 Wallet Phone" |

Read back: `GET /v1/plans/local-plan/accounts` lists N11 Wallet Before, N11 Wallet Wide and N11 Wallet Phone, all `checking`.

## Approving the last new row

Script `.amp/in/orb-backup/n11b.sh <width> <tag>`: `POST` two unapproved rows (N11 Interest A and B) on Rainy Day Saver, open its register, choose "N new to approve", then "Approve all (N)", and report.

| Run | Pills after | Rows listed | Focus |
|---|---|---|---|
| Before (fix stashed), 1440 | "Showing new transactions · clear" still pressed | 0 (the empty "No transactions match these filters" state) | BODY |
| After, 1440 | none (nothing left to approve) | 16, the full register | TR of N11 Interest A |
| After, 390 | none | 18 | TR of N11 Interest B |

Toast in every run: "N transactions approved." Read back: every N11 Interest row `approved: true`.
