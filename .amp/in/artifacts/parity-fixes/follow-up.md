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
