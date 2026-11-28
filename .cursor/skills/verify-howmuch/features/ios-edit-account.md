# iOS edit account

An existing account’s name, type, and icon can be edited on device, and the account can be closed, reopened or deleted. Accounts rows and the register title open **Edit Account**, which writes `PATCH /v1/plans/{id}/accounts/{account_id}` with `name`, optional `icon`, and `type` only when the classification changed. Balances do not change.

## Sub-features

- `ios-edit-account-open` opens **Edit Account** from an Accounts row or the register title.
- `ios-edit-account-type` changes Everyday Account from Checking to Savings and keeps the balance.
- `ios-edit-account-tracking` shows the Spending / Tracking note when a type move crosses the plan.
- `ios-edit-account-http` matches `type` `savings` and unchanged `balance` after save.
- `ios-edit-account-close` closes and reopens an account from **Close Account** / **Reopen Account**. It writes `PATCH` with `closed` only and moves the account under Closed.
- `ios-edit-account-delete` asks before **Delete Account**. An account with transactions, transfers or schedules is refused with `Close it instead`; an unused one is removed with its transfer payee.
- `ios-edit-account-rewards` shows **Payment reminders** and **Rewards** rows on a credit card. **Rewards** opens **Edit Rewards**; changed rules ask when they apply.

## How to get to it (user POV)

- On **Accounts**, long-press a row and choose **Edit Account**.
- On **Accounts**, VoiceOver **Edit Account** on a row.
- On an account register, tap the title or overflow **Edit Account**.

## Driving it with control-howmuch

Preconditions:

- `control-howmuch doctor` passes.
- [iOS connection](./ios-connection.md) signed in as `verifier` against this stack.
- Everyday Account is still listed as a checking account.

- **Open.** On `Accounts`, long-press `Everyday Account` and choose `Edit Account`. Sheet title `Edit Account`. Fields `Name`, `Type` (`Checking`), `Icon`.
- **Type.** Open `Type`. Choose `Savings` (under `Spending`). Type row then reads `Savings`. No Spending / Tracking note.
- **Save.** Trailing `Save` is enabled. Choose `Save`. Sheet dismisses. Everyday Account stays under `Cash`.
- **HTTP match.** `control-howmuch http GET /v1/plans/local-plan/accounts` includes Everyday Account with `type` `savings`, `on_budget` true, and the same `balance` as before the edit.
- **Tracking note.** Open **Edit Account** again. Change Type to `Mortgage`. Footnote `Moves the account from Spending to Tracking. Balances do not change.` Cancel without saving.
- **Rewards.** With `fixtures/rewards-tracker-export.json` imported, open **Edit Account** on Travel Card. Rows `Payment reminders` and `Rewards`, then the footnote `Rules change by reward period. Earlier periods keep their rules.` Tap `Rewards`. **Edit Rewards** opens. Change the earning rate and tap `Save`. A dialog `When do the rule changes apply?` offers `This period, from …`, `Next period, from …` and `Correct everywhere`. Choose `This period`. The snapshot shows a `ruleHistory` entry as in [rewards card edit](./rewards-card-edit.md). A credit card without rewards shows `Set Up Rewards`, which opens the editor with that account chosen.
- **Close.** Open **Edit Account** on Rainy Day Saver. Choose `Close Account`. The sheet dismisses and Rainy Day Saver is listed under `Closed`. `control-howmuch http GET /v1/plans/local-plan/accounts/acct-saver` shows `closed` true. Open it again and choose `Reopen Account`.
- **Delete refused.** On Rainy Day Saver choose `Delete Account`, then `Delete Account` in the alert. The sheet stays open with `This account has transactions, transfers or scheduled transactions. Close it instead to keep its history.`
- **Delete.** Add an account with no transactions, open **Edit Account**, choose `Delete Account` and confirm. It leaves Accounts, and the accounts list over HTTP no longer has it.
- **Proof.** Screenshot the open sheet with Type Savings (`artifacts/ios-edit-account/sheet.png`) and the HTTP JSON (`artifacts/ios-edit-account/account.json`).

## Gotchas

- Name and icon still save during transition read-only. A type change is locked and shows the sheet error.
- Imported YNAB types such as `personalLoan` stay as their humanised label until a kind is picked. The sheet notes `Imported as … Choose a type to classify it.` Picking one shows `Replaces the imported type “…”`.
- Changing type does not recategorise existing transfers.
- iOS Simulator is required. The web edits the same things from **Account settings** on the register.
