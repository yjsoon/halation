# Account settings and tracking accounts on the web: E2E record

Revision: uncommitted work on top of 9a9703ac (main), 2026-11-14.
Stack: `control-howmuch launch` (disposable SQLite seeded from `fixtures/demo-ledger.json`), owner `verifier` via first-owner setup. agent-browser, 1440x900 at 2x, light then `set media dark`.

| Step | Expected | Observed |
| --- | --- | --- |
| `/accounts/new`, Name `Verify Car Loan`, Type `Car loan`, Amount owed `12000`, Create account | Note under Type says tracking; account listed under Tracking | Note "Tracking account: loans and assets you keep an eye on but don’t spend from. Listed under Tracking."; API `type:autoLoan, on_budget:false`; sidebar Tracking group |
| Register of Verify Car Loan, choose **Account settings** | Account band with Name, Type, Favourite, Close account, Delete account | Present (accessibility snapshot: textbox Name, combobox Type, checkbox Favourite, buttons Close account / Delete account) |
| Rainy Day Saver (has transactions): Delete account, confirm | Refused, account kept | Alert "This account has transactions, transfers or scheduled transactions. Close it instead to keep its history."; DB `deleted=0` |
| Rainy Day Saver: Type `Other asset` | Note says move Budget to Tracking | "Moves this account from Budget to Tracking. Balances do not change." |
| Save | Type and on-budget persisted | API `type:otherAsset, on_budget:false`; sidebar moves it under Tracking; icon followed the new type default |
| Tick Favourite | Favourites group appears in sidebar | Favourites group with Rainy Day Saver |
| Close account | Closed, under Closed, out of Favourites, no new entries | DB `closed=1`; sidebar Closed group; favourites `[]`; + Add transaction disabled |
| Reopen account | Open again | Button reads "Close account" again |
| Travel Card (dark) | Account band plus Payment reminders and Rewards | All three bands rendered |
| Verify Car Loan (dark, no transactions): Delete account, confirm | Deleted, back to Ledger | URL `/transactions?range=all&accounts=all`; sidebar no longer lists it; DB account `deleted=1` and `Transfer : Verify Car Loan` payee `deleted=1` |

Checks: `bun test` 810 pass, 0 fail (includes new D1 test "D1 account close and delete keep any account with history", which fails with the split-transfer guard removed); web and worker typecheck clean; iOS engine bundle rebuilt with bun@1.4.0.

## Round 3: deleting an empty card account removes its rewards card (2026-11-16)

Revision: uncommitted on top of bf059773. Fresh `control-howmuch launch` stack, light theme, 1440x900 at 2x.

| Step | Expected | Observed |
| --- | --- | --- |
| New account `Verify Spare Card`, type Credit card, no balance | Created | Register opens for it |
| `POST /api/rewards/cards` with card `card-verify-spare` linked to it | Card exists | 201; rewards list `["card-verify-spare"]` |
| Account settings > Delete account | Confirmation mentions rewards | "… Otherwise, close it. Its rewards setup is removed too." |
| Confirm | Account and card gone | Back on Ledger; rewards cards `[]`, snapshot cards `[]`; DB `rewards_tracker_cards.deleted=1`, account `deleted=1`; Rewards page shows "Add your first reward card" |

`D1 account close and delete keep any account with history` now also asserts that only the deleted account's card goes; it fails without the change (one extra card received).
