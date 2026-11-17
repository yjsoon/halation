# Scheduled and Quick entry parity fixes

Base: `b29e5d69` (origin/main fetched after the audit at `9562e4c8`). Each section was checked against the working changes committed alongside that section. No production access.

Setup: existing disposable `control-howmuch launch` stack `20261117T113404-3430`, browser first-owner setup, synthetic audit fixtures. `control-howmuch doctor` passed. Browser session `parity`, Chromium, 1440×1000 and 390×844 CSS pixels, DPR 2. iOS comparisons use source only.

## P-10: Escape and focus restoration

- Recipe: `.cursor/skills/verify-howmuch/features/scheduled-transactions.md`, editor cancellation extension.
- Before: open Add schedule, press Escape. DOM: `{editor:true, focus:"SELECT"}`.
- After, at both widths: open Add schedule, press Escape. DOM: `{editor:false, focus:"Add schedule"}`. Open an existing row's Edit, press Escape: `{editor:false, focus:"Edit No payee"}`. Uses the existing opener/fallback focus hook; no extra focus policy.
- Read-back: `control-howmuch http GET /v1/plans/local-plan/scheduled_transactions` retained exactly the two existing audit schedules, Named flag audit −2220 and Closed account audit −1230 milliunits. Cancellation did not write.
- Recording: `schedule-escape.webm` retained outside git beside this record.

## P-09: Closed account choices

- At both 1440 and 390 pixels, Add schedule offers only Choose account, Everyday Account and Travel Card. Transfer offers only Travel Card when posting to Everyday Account. Both new split-line transfer selectors also exclude the closed saver.
- Existing Closed account audit still selects `Rainy Day Saver (closed)`. Saved its memo as `P09 closed retained 1440`, then `P09 closed retained 390`, through the editor.
- `control-howmuch http GET /v1/plans/local-plan/scheduled_transactions` confirms account_id `acct-saver`, amount `-1230`, memo `P09 closed retained 390`. The existing schedule did not silently move to an open account.
- Existing closed transfer targets are retained per original schedule/line, rather than exposing every closed account to every new line. New account choices otherwise follow Quick entry's open-account rule.

## P-16: Named schedule flags

- At both widths, `/scheduled` shows `Audit Dining` beside No payee. DOM text and title both equal `Audit Dining`; document horizontal overflow is false. Inspected `named-flag-1440.png` and `named-flag-390.png`.
- Read-back: `control-howmuch http GET /api/import/rewards-tracker` returns Travel Card with `flagNames.red = "Audit Dining"`; `/v1/plans/local-plan/scheduled_transactions` retains `account_id: "acct-credit", flag_color: "red"` for Named flag audit. No write is needed to display the current account-specific name.

## P-12: Required date

- At both widths, fill amount 1.12 and payee `P12 date {width}`. Clear the native date with Backspace, ArrowRight, Backspace, ArrowRight, Backspace (the browser automation's date `fill` does not update React state reliably and was not used as proof).
- DOM result: `{date:"", valid:false, disabled:true, error:"Choose a date."}`. The local field message remains until a date is chosen.
- Choose Today, Save spend, wait for `.status-panel-success`. `control-howmuch http GET '/v1/plans/local-plan/transactions?since_date=2026-11-17'` returns exactly one P12 date 1440 and one P12 date 390, each date 2026-11-17 and amount −1120 milliunits. No blank-date row was written.
- Inspected date-required-1440.png and date-required-390.png.

## P-05: Optional payee in Quick entry

- At both widths, create Spend and Income for 1.05, leave payee blank and use memo `P05 {Spend|Income} {width}`. Save enabled, followed by Saved. Read-back using the transactions endpoint above confirms null payee names and −1050/+1050 milliunits respectively.
- Control: at both widths create Transfer 1.05 to Travel Card with `P05 Transfer {width}`. Read-back confirms paired −1050/+1050 rows and the reciprocal transfer account IDs. Transfer still requires its selected target; its gate is unchanged.
- The register compose side is owned by the register worker and is not changed here. The existing quick-entry recipe's mandatory-payee assertions are superseded by this explicitly requested behaviour.

## P-04a: Signed and zero-net splits

- At both widths, Quick entry → Split categories. Parent amount is derived and disabled; signed lines use the Scheduled wording, `Use a minus sign for outflow.` Save has no contradictory Spend/Income direction.
- Created three entries per width, memo `P04 {mixed|zero|positive} {width}`. Read-back from the transactions endpoint confirms: −15 + 5 → −10000 milliunits; −5 + 5 → 0; −5 + 15 → +10000. Each persisted child retains its own sign. The API may return child lines in a different order.
- Ordinary amount zero still disables Save. `abc` and `1.234` split lines disable Save with `Every split line needs a valid signed amount.` Clearing a line with Control+A/Backspace does too. Automation `fill ''` alone changes DOM without the React event, so was not accepted as evidence.
- Use one category after −5 + 15 yields Income and amount 10. After each successful split save, focus returns to Amount after it becomes editable again.
- Both viewports have no document horizontal overflow. Inspected the mixed split at 390 and zero-net split at 1440; all six combinations were captured. No per-line transfers added.

## P-04b: Optional split payees

- Optional Payee / memo disclosure keeps the default split compact. At both widths create three lines −15, +5, 0; open the first two disclosures and set a new payee `Audit split payee {width}` and existing payee MUJI respectively. Leave the third payee empty. Add a memo on the first line and save with parent memo `P04 payees {width}`.
- Transactions read-back confirms parent −10000, children −15000 with the new payee and memo, +5000 with MUJI, and 0 with null payee. No server change or separate payee-creation request needed.
- At 390, expanded inputs are 316 CSS pixels wide, and at 1440 they are 434 pixels. No document horizontal overflow. Inspected both full-page captures, including the three-line Remove control; recorded disclosure/edit/save interaction.
- Outside the two owned pages/styles: added only optional `payee_name` to `QuickEntrySplitLine` in `apps/web/src/api/types.ts`.

## R-06: Date and Memo each retain a full row

- Reproduced at 721: Date label width 0, native input width 8 CSS pixels. Fix assigns both fields a full flex row instead of only Memo.
- Checked 390, 720, 721, 800, 801, 1024 and 1440. Date/input widths respectively: 342/230, 460/348, 460/348, 460/348, 460/340, 460/340, 460/340. At every width Memo is below Date and document horizontal overflow is false.
- At 721 changed the native date using ArrowRight/ArrowUp and saved amount 1.06, memo R06 date control. Transactions read-back confirms date 2026-11-18 and amount −1060, not merely a visible date field.
- Captured every width and before/after at 721; inspected the breakpoint layouts.

## R-09: Escape on schedule confirmations

- Before, Escape left both Enter now and Delete confirmations open. At both widths after the fix, Escape closes each and restores focus to `Enter No payee now` or `Delete No payee` respectively.
- Escape clicks the existing Cancel button, so its disabled-during-write guard and focus path apply without a second cancellation implementation.
- Schedule read-back retains both original IDs, `deleted:false` and next date 2026-11-17. No occurrence was entered or deleted by cancellation.

## R-10: Focus after a schedule leaves the list

- Reproduced by creating and deleting R10 before: after the list refreshed, focus was BODY despite two remaining rows.
- At both widths created one-off −1.10 schedules `R10 Delete {width}` and `R10 Enter {width}`, then confirmed the corresponding action. After each refresh, focus is on an action in a remaining row, never BODY. The destination is the following row, or previous row at the end.
- Transactions read-back confirms exactly R10 Enter 1440 and R10 Enter 390 at −1100. Schedule read-back retains only the two original active schedules, so both delete and one-off completion genuinely removed their rows.
- Restoration waits for the refreshed list and does not steal focus if the user has moved it elsewhere. Recurring Enter restores its own row.
- Extended checks: at both widths deleting the last schedule and entering the last one-off schedule produce `{rows:0, focus:"Add schedule"}`. Read-back returns `R10 last Enter 1440` and `R10 last Enter 390`, both −1100 on 2026-11-17, and no active schedules after clean-up. Entering the monthly Travel Card schedule at 390 advanced it to 17 December and restored its own Enter now action.

## R-08: Closed schedules cannot be entered

- At both widths the saved Rainy Day Saver schedule reads `Rainy Day Saver (closed)` and exposes only Edit and Delete. The open Travel Card schedule retains Enter now, Edit and Delete. Inspected both closed-schedule captures.
- `control-howmuch http GET '/v1/plans/local-plan/transactions?since_date=2026-11-17'` followed by filtering `account_id == "acct-saver"` returns 0 rows. No closed-account occurrence was posted. The existing schedule remains editable without moving its account (P-09).
- This is a web control guard, matching the daily server run; no server change.

## R-12: New payees in Scheduled remain open

- Not implemented, as requested by the conditional scope: iOS `ScheduledTransactionEditorView.swift` lines 345–355 and 680–690 passes `allowsCreate: false` to both parent and split PayeePicker controls. iOS does not offer new payees in this editor either. A web-only enhancement remains a product decision.
