# Web UI hillclimb: lead's integration checks

Text record of the checks the lead thread ran in a browser while integrating the workers' fixes. Each worker's own record sits beside its commits (`parity-fixes/`, `report-fixes/`, `register-*/`). Screenshots are not in git; they are in the thread and the audit artifact.

- Revision: the integrated branch on `origin/main` `b29e5d69`, at the head named beside each check. Final head for this record: the commit that adds it.
- Stack: `control-howmuch launch` (disposable local API and web, SQLite), first owner created in the browser, plan `local-plan`, synthetic accounts Everyday Account, Rainy Day Saver and Travel Card with the repository's synthetic March to May 2026 rows.
- Browser: Chromium through `agent-browser`, device pixel ratio 2, at 1440 x 900 and 390 x 844 unless a width is named.
- Read-back: `control-howmuch http GET /v1/plans/local-plan/transactions/<id>`; amounts are milliunits.

## Fixture added through the UI

1. Quick entry (`/add`), Transfer, 50, dated 10 Oct 2026, Everyday Account to Rainy Day Saver.
2. Quick entry, Spend, 40, dated 10 Oct 2026, Everyday Account, no payee, no category.
3. Quick entry, Spend 10 on 17 Nov 2026 split as 15 out and 5 in ("Lead split check").

## Report and register agree (P-07, VR-01, VR-02, LEAD-04)

- Steps: open `/income?range=all&accounts=all`; read the Oct 2026 row; follow its link; then open the same month without `flow`.
- Expected: the linked Ledger's footer equals the report row and leaves out the transfer between two accounts; the plain month includes both sides of it.
- Observed: report row `Oct 2026 $0.00 $40.00 −$40.00`. Link `/transactions?from=2026-10-01&to=2026-10-31&accounts=all&flow=activity`, footer `1 transaction · $0.00 in · $40.00 out · −$40.00 net`. Plain month: `3 transactions · $50.00 in · $90.00 out · −$40.00 net`. March, April, May and November footers equal their report rows (for example May `$5,700.00 in · $451.80 out · +$5,248.20 net`).
- Filter summary on the linked Ledger at 1440 and 390: `1 Oct 2026 to 31 Oct 2026 · All accounts · All categories · Uncategorised transfers not shown`; a Spending category link ends `Outflows only`; a plain register has neither. No horizontal overflow.
- Clear filters on the linked Ledger removes `flow`.

## Remembered report scope stays in reports (S-05, L-01)

- Steps: set `accountIds: ["acct-credit"]` in `howmuch.view-prefs.v1`; open each page with no query.
- Observed: Spending, Income v spending, Net worth and Money age read `1 account`; `/rewards`, `/transactions` and `/scheduled` open on all accounts. From the Travel Card register the sidebar's Rewards and Scheduled links are `/rewards` and `/scheduled`.

## Report ranges that end today (P-06, VP-05)

- Observed at `9afef689`, 1024 wide: All on Spending gives `/spending?accounts=all&range=all`, summary `To 17 Nov 2026 · All accounts · All categories`, no Clear filters; This month gives `from=2026-11-01` with no `to` and stays highlighted; Last month gives both dates and shows Clear filters.

## Charts (VP-02, VP-03)

- Observed at 1024: Net worth 5 axis labels, smallest gap 83.8 px; Money age and Income 8 labels, smallest gap 45.9 px; none clipped; one tab stop per chart.

## Account switching (L-03, L-04, L-09)

- Steps: Travel Card register, type `Grab` in Search, open Reconcile, choose Rainy Day Saver in the sidebar.
- Observed: heading `Rainy Day Saver`, Reconcile closed, Search empty. An account's own register shows no Clear filters for its account.

## Account settings focus (VR-03) and add row payee (VR-06)

- Steps at 1440 and 390: rename Rainy Day Saver, focus Save, press Enter; rename back and click Save; rename and press Enter in Name.
- Observed: focus on the Name input after all three, at both widths. The add row's Payee has `required=false`; Date keeps `required=true`.

## Editing a posted split (P-03)

- Steps at 1440: Enter on the 40.00 row, `+ Split categories`, line 1 25, line 2 14 Groceries, Save; then 15, Save.
- Observed: with 14, Save is refused with `+$1.00 left to assign.` and the editor stays open; with 15 the status reads `✓ Lines match the total.` and the save reads back `amount -40000, category_id null`, lines `-15000 cat-groceries` and `-25000 null`. Focus returns to the row.
- Steps at 390: Enter on the row, `Use one category`, Groceries, Save.
- Observed: read-back `amount -40000, category_id cat-groceries`, no lines. No horizontal overflow; the Outflow and Inflow control is 120 px wide.

## Duplicate for today on a phone (P-01) and moving a row (P-02, N-06)

- At 390, Duplicate for today on the 40.00 Groceries row opens `/add` with amount `40`, date `2026-11-17`, Everyday Account, Groceries, `Save spend` enabled; after a reload the form is empty.
- At 1440 the Ledger row editor has one Account control. Choosing Travel Card and Save shows `Entry saved to Travel Card.` at the bottom right (toast 837 to 880 px, header balance 49 to 88 px) and reads back `account_id acct-credit`. Moved back afterwards.

## Scheduled (VP-01, N-01)

- A schedule from Everyday Account transferring to Rainy Day Saver reads `Transfer to Rainy Day Saver` and keeps Enter now while both accounts are open.
- With one schedule at 390, 721, 800, 890 and 1001 wide: Enter now, Edit and Delete are inside the viewport and the page does not scroll sideways; at 1001 to 1100 the table wrapper's `clientWidth` equals its `scrollWidth`.
- Deleting the last schedule by keyboard returns focus to Add schedule.

## Rewards (VS-03, VS-04, VS-05, N-11)

- Added a card on Travel Card (earning rate 1) through Add card.
- At 390: Select, then Escape with focus on Done, leaves Select mode with focus on Select.
- In the card editor, Enable flag subcategories and Add flag twice: each row has a `Colour name` field; Save shows `Name the red colour on this card.` in view with focus on `Flag 1 colour name`; no horizontal overflow.
- Changing Issuer and Save card lands on `/rewards` with focus on the `Rewards` heading.

## Reconciled rows (N-02, N-10, LEAD-05)

- Steps at 1440 on Rainy Day Saver: mark `Broker transfer on 15 Mar 2026` cleared; Reconcile; type the cleared balance (421500.00) and press Enter; tick the acknowledgement; Confirm reconciliation. Without reloading, read the row's controls, then Enter on the row, change Inflow to 701 and press Enter.
- Expected: Enter reviews the reconciliation; the row reads Reconciled at once; the change asks first.
- Before LEAD-05 (at the head with N-02): after the same steps on the 24 May row its control still read `Mark Broker transfer on 24 May 2026 uncleared`, and changing 850 to 851 saved with no question (read-back `amount 851000, cleared reconciled`). After a reload the same edit asked.
- After LEAD-05: message `Rainy Day Saver reconciled through 17 Nov 2026. 1 cleared transaction matched $421,500.00.`; the row's controls read `Reconciled` with no reload; the edit shows `Save transaction changes?` with focus on Cancel; Escape closes it, keeps the editor open and returns focus to the Inflow field.
- `bun test apps/web/src/lib/register-rows.test.ts`: the new case failed before the fix (`5 pass, 1 fail`) and passes after (`6 pass, 0 fail`).

## Other second-audit items seen on the way

- N-12: an October Ledger shows no Scheduled group.
- N-15: with one row selected and nothing else open, Escape clears the selection and focuses select-all.
- N-16: two chosen accounts give the title and heading `Selected accounts`.

## Checks

- `scripts/check.sh` at `f9ecdecf`: `check: exit=0: bun test` (`821 pass`, `0 fail`, `Ran 821 tests across 69 files.`), `bun run --cwd apps/web typecheck`, `bun run --cwd apps/worker typecheck` and `bun scripts/verify-ios-focus-zoom.ts` all `exit=0`; `check: pass`.

## Limits

- Chromium only: no Safari, no phone hardware, no software keyboard (see LEAD-03 in the audit).
- The lead re-ran a sample of each worker's flows, not every one; the workers' records hold the rest.

## T-04: Scheduled names a split schedule as the register does

- Base revision: 767ea37a. Disposable stack, user `verifier`, plan `local-plan`, Chromium at DPR 2.
- Before (third audit, f9ecdecf): Scheduled's Category cell read "Uncategorised" for a split schedule, while the register's Scheduled group read "Split · 2 lines".
- Steps: Scheduled, Add schedule, tick "Split this schedule", line 1 amount -12.00 with payee Cold Storage, line 2 amount -8.00 with payee MUJI, Memo "T04 split", Add schedule.
- API read-back (`GET /v1/plans/local-plan/scheduled_transactions`): the new schedule has `amount: -20000`, `category_name: null` and two subtransactions of -8000 and -12000.
- Observed at 1440: "17 Nov 2026 No payee T04 split Everyday Account Split · 2 lines Monthly −$20.00", with the two split lines beneath. At 390: "Everyday Account · Split · 2 lines · Monthly".
- Control: the unsplit schedule with no category still reads "Uncategorised" at both widths.
- The Ledger's Scheduled group reads "Split · 2 lines" for the same schedule.
- `bun run --cwd apps/web typecheck`: `$ tsc --noEmit`, exit 0.

## Third audit round, integrated

- Head before this record: 8b1ea712, 113 commits on `origin/main` b29e5d69. Disposable stack, user `verifier`, plan `local-plan`, Chromium at DPR 2.
- `scripts/check.sh` at 8b1ea712: `check: pass`, exit 0 (`bun test`, the web and worker typechecks, the iOS focus zoom check).
- T-01 (911823e1, with the lead's edit folded in). A posted split of two lines, line 1 with Payee / memo open: the open line is 168 px tall and the closed line 61 px at 1440, 1024 and 721, with Category 25 px from the top of each. At 390 the lines are 291 and 151 px. No horizontal overflow at any of the four widths. Lead's edit: the closed Payee / memo summary sat 18 px above the centre of the controls beside it and now sits within 5 px; the line's amount is right-aligned in the figures face, as the row's own Outflow and Inflow are.
- T-02 (15d51d59). Typing "T02 enter" in line 1's Memo and pressing Enter closed the editor; the API read back line 1 `amount: 5000, memo: "T02 enter"` and line 2 `amount: -15000`. With a third line added, Remove line on the last line left focus on "+ Add line"; Remove line on the first left focus on "Split line 1 category"; Escape then cancelled the editor and the API read back the same two lines.
- T-03 (8b1ea712). Signed out, opened `/transactions?accounts=acct-credit`, signed in with Enter: focus ended on the H1 "Travel Card" with the reward masthead shown.
- T-06 (af385f3a). On Travel Card's editor with no flags, Add flag took red and the Add flag from category picker moved to Orange. With Red picked again, Groceries and rate 2, Add flag from category added no row and showed "Could not add this flag. Active flag colours must be unique." under the button, with the picker's `aria-describedby` set to it.
- T-07 (6acd9872). Save card with flag 1's Reward value empty: "Could not update this card. Reward value is required." in that row, focus in "Flag 1 reward value" with `aria-invalid="true"` and `aria-describedby="flag-1-error"`, in view. Nothing was saved.
- T-05 (d022fbda). A stored card shows no Colour names box and its flag note reads "These are the same colour tags as the ledger. None is Unflagged spend."
- T-09 (24068028) rests on the worker's record; the lead read the diff only.

## iPhone Safari check (LEAD-03, SF-01, SF-02)

- Revision: 97ec1d70 for the "before" observations, 38819d1d for the "after" ones. Disposable stack, user `verifier`, plan `local-plan`.
- Device: Safari in the iOS Simulator on an Amp Mac satellite (macos-27 image, Xcode 27.3), iPhone 17 Pro, iOS 26.5, 402 by 874 points, hardware keyboard disconnected. The page was the orb's Vite server through its HTTPS portal; over plain `http://localhost` Safari drops the session cookie, which is marked `Secure`.
- Driven with `xcrun simctl openurl` and `axe tap` on the on-screen keys. A simulator, not phone hardware.

### LEAD-03: amounts that need a minus sign

- Before: Scheduled, Add schedule, tap Amount: the keypad shows the digits, a decimal point and delete, and no minus key. New account, tap Current balance: the same keypad, under the note "If it is below zero, start with a minus sign, such as -20."
- After: the same two fields and Reconcile's Statement balance open the full keyboard, whose "123" layer has a "-" key. Typing - 1 2 . 5 0 on that keyboard into Scheduled's Amount and choosing Add schedule added a schedule; `GET /v1/plans/local-plan/scheduled_transactions` read back `amount: -12500, frequency: "monthly", date_next: "2026-11-18"` and the header count went from 2 to 3.
- New account in Chromium at 390: Current balance has `inputMode="text"`; with Type set to Credit card the field is "Amount owed" with `inputMode="decimal"` and the note "Enter what you owe today."
- Cost: the full keyboard opens on letters, so every amount in these fields takes one more tap ("123") on a phone.

### SF-01: full-width date fields ran past the form's right edge

- Before: Reconcile's Statement date and Scheduled's First date and Next date were wider than the form, with their right border off screen and the date centred.
- After: each is as wide as the fields around it with the date at the left; tapping Statement date still opens Safari's calendar. The reward card editor's empty Anchor date, Promotional start and Promotional end keep the height of the other fields.
- Chromium at 1440 on the reward card editor: date fields measure 45 by 232 before and after, and the two screenshots differ by 0 pixels.

### SF-02: the row editor's fields were system blue

- Before: on the Ledger at phone width, the row editor's Date, Account and Category read in Safari's blue.
- After: they read in the ink colour. Chromium computed colours for the row's date, select and text fields: `rgb(35, 29, 31)` in light and `rgb(243, 234, 236)` in dark, each equal to `--ink`.

### Also looked at in Safari, no fault seen

Sign in, Scheduled's list, Quick entry, the Ledger with Filters open, Spending, Income, Net worth and Rewards, each at the top and one screen down, light mode only.

### Checks

`scripts/check.sh` on the tree committed as 38819d1d: `check: pass`, exit 0 (`bun test` 821 pass and 0 fail, the typechecks, the iOS focus zoom check).

### LEAD-03, Reconcile on the unchanged code

- A second run on a new Mac satellite, same device (iPhone 17 Pro, iOS 26.5, hardware keyboard disconnected), with `pages/Transactions.tsx`, `pages/ScheduledTransactions.tsx` and `pages/NewAccount.tsx` put back to 97ec1d70 in the worktree for the run and restored to 09aa9f09 afterwards.
- Steps: Travel Card's register, Reconcile, tap Statement balance.
- Observed: the keypad shows the digits, a decimal point and delete, and no minus key. With the first run this covers all three fields on the unchanged code: Scheduled's Amount, Reconcile's Statement balance and New account's Current balance.
- The page under test was the web app on the disposable stack through the orb's HTTPS portal, not a bare test page.
- b1c5fe6a is one of two possible fixes and waits for YJ's choice.
