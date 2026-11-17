# Quick entry split rework and Scheduled focus

Base: `53be3b42`. Disposable stack `20261117T113404-3430`, Chromium browser session `parity`, 390 and 1440 CSS pixels, DPR 2. No production access. This supersedes the P-04a signed-input and derived-total behaviour recorded in verification.md.

## P-04a: Keep the receipt total and use direction buttons

- Before: type 9.99, enable Split categories. DOM returned `{total:"-9.99",locked:true,direction:false,lines:["-9.99","0"],saveDisabled:false}`.
- After: entered Amount remains editable, Spend/Income/Transfer remains visible, both new lines default to the entry direction with blank positive amount fields, and Save spend/Save income remains the label. Outflow/Inflow buttons select the sign without typing a minus.
- At both widths, entered and saved through the UI, with distinct parent memos `P04 rework {plain|mixed|zero|income} {390|1440}`: plain Spend 9.99 = 4.99 Outflow + 5.00 Outflow, Spend 10 = 15 Outflow + 5 Inflow, Spend 0 = 5 Outflow + 5 Inflow, Income 10 = 5 Outflow + 15 Inflow. Plain case did not touch either direction button. Each showed `✓ Lines match the total.` and enabled Save.
- Read-back: `control-howmuch http GET '/v1/plans/local-plan/transactions?since_date=2026-11-17'`. Both widths persisted parent/children milliunits: −9990 / [−4990, −5000]; −10000 / [−15000, 5000]; 0 / [−5000, 5000]; 10000 / [−5000, 15000]. Category IDs persisted as cat-dining/cat-groceries.
- Controls at both widths: ordinary total 0 disables Save; split line 0, −1 and 1.234 each disable Save. Spend 10 with 10 and 5 Outflow shows `−$5.00 left to assign.` and disables Save. Returning to one category keeps Amount 10 and Spend, rather than replacing it with the allocated 15.
- At 390, Tab reached Category, Amount, Outflow, Inflow, Payee / memo, Payee, Memo, Remove line in order. All control bounds were within x=37..353; payee/memo fields were 316px wide, amount 88px, direction buttons 67.6/58.7px wide and at least 44px tall. No document horizontal overflow. Expanded and three-line states were visually inspected.
- Existing optional payee/memo still persists: parent memo `P04 rework controls 390`, total −10000, children −15000 with payee `Rework split payee` and memo `Receipt allocation`, +6000 and −1000 with null payees. Its API contract and controls are unchanged; only grid rows move to make room for line direction.
- Inspected screenshots: split-rework-plain-390.png, split-rework-zero-1440.png and split-rework-controls-390.png. All eight case/width combinations were captured. Recording split-directions.mp4 shows pointer navigation, changing a line to Inflow and opening/closing its optional fields. Returning to one category was verified through the DOM checks above.
- No iPhone keyboard claim is made from Chromium. Quick entry no longer requires a minus key. Existing signed fields in Scheduled and register were left unchanged as requested.

## S-11: Restore focus when payment terms replace their opener

- Before: Scheduled → Set up payment reminders → set statement day 15 → Save terms. After the Payments due panel refreshed and the dialog closed, `document.activeElement.tagName` was `BODY`.
- After at 1440 and 390: the same flow focuses `Schedule payment for Travel Card`, the panel's first control, once the dialog closes and both queries finish. Removal of the last terms returns focus to Set up payment reminders. Editing existing terms and Cancel retain focus on `Payment terms for Travel Card`.
- `control-howmuch http GET /v1/plans/local-plan/card_payment_terms` confirmed `account_id: acct-credit`, statement days 16 (1440) and 15 (390), then 17 after editing. The recorded final setup persisted day 19 with enabled true and due_gap_days 25.
- Only ScheduledTransactions.tsx changes. CardTermsDialog.tsx and CardPaymentsPanel.tsx remain untouched. Restoration does not override an existing focused control, and Add schedule is the fallback if no panel control exists.
- Captures: terms-focus-1440.png, terms-focus-390.png and terms-focus.mp4. Browser accessibility/DOM checks, not the screenshots alone, establish the focus destination.

## VP-01: Include closed transfer accounts in schedule entry checks

- Base: integrated `06322e8b`, fetched from the lead's hillclimb-2.bundle and branched as parity-review-fixes. Continued on the same disposable stack; doctor passed.
- Through the UI, reopened Rainy Day Saver, created `VP01 plain` (Everyday Account → saver, −15), `VP01 split` (−15 transfer to saver and −5 ordinary allocation) and `VP01 open` (Everyday Account → Travel Card, −15), then closed the saver. Before, all three offered Enter now and neither transfer target carried a closed label.
- After, at 390 and 1440, plain/split schedules expose only Edit and Delete. Both their transfer labels say `Transfer to Rainy Day Saver (closed)`. Everyday Account remains unlabelled as it is open. Editing the saved plain transfer still retains its labelled closed target. The all-open schedule retains Enter now.
- Entered the all-open schedule once at each width. `control-howmuch http GET /v1/plans/local-plan/transactions` returned two reciprocal pairs for `VP01 open`: −15000 on acct-everyday and +15000 on acct-credit, with matching transfer account IDs. Filtering acct-saver and sorting by ID before and after gives byte-identical JSON (`cmp`: `Closed-account transactions unchanged`). Neither closed-target schedule was materialised.
- Code checks the posting account, parent transfer account and every split transfer account. The label belongs to the actual closed account, not the open posting account. No API changes.
- Inspected vp01-after-390.png and vp01-after-1440.png, with matching before captures. Both show the plain/split/open cases without clipping or overlap.

## VP-09: Withhold the match tick for incomplete split lines

- On integrated base `06322e8b`, entered Spend 12 with 7 Outflow, 2 Inflow, 7 Outflow, then added an empty fourth line. Before: `{summary:"✓ Lines match the total.", disabled:true}`. Only the split summary changes, leaving the draft and validation code untouched.
- At 390 and 1440 after the fix, empty or zero fourth line yields `{summary:"", disabled:true}`. Removing it and changing the third line to 6 yields `{summary:"+$1.00 left to assign.", disabled:true}`. Restoring 7 yields `{summary:"✓ Lines match the total.", disabled:false}`. No new copy was added.
- Saved the complete three-line entries with memos `VP09 complete 390` and `VP09 complete 1440`. `control-howmuch http GET /v1/plans/local-plan/transactions` confirms both parents at −12000 milliunits and children [−7000, +2000, −7000]. No incomplete entry was submitted.
- Matching before/after captures exist at both widths; inspected the narrow incomplete and desktop complete states. The pointer recording vp09-summary.mp4 shows adding and removing an empty line. Media remains untracked.
