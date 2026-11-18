# iOS UI hillclimb round 1: iPhone fixes (IP findings)

Thread: https://ampcode.com/threads/T-01a1ef35-4a13-7399-9187-757afdd8e608, lead thread T-01a1ef1e-bc1f-716a-a86e-c1f679fe24bb.

## Revision

- Base: `2258ef81` (`origin/main` at the time of the audit).
- Branch: `ios-ui-hillclimb-ip`, one commit per finding, each with a `Finding:` trailer. Not pushed.
- Fix commits, oldest first: `edf50541` IP-04, `18a7317a` IP-05, `ee582b8e` IP-06, `207bdb02` IP-07, `16d0465e` IP-13, `94fd886f` IP-12, `bf3c087c` IP-15, `c827d69a` IP-16, `eef33de2` IP-20, `914c28eb` IP-21, `1e6d26bd` IP-11, `d503d6a3` IP-09. This record is the commit after them.

## Setup

- Amp Mac satellite, image `macos-27`, Xcode 27.2, simulators on iOS 27.3: iPhone 18 Pro (`3C2BD67C`), iPhone SE (3rd generation) (`9A050B8E`), iPad Pro 13-inch (M5) (`AE947EB0`, accessibility enabled as in `apps/ios/AGENTS.md`).
- Disposable verify stack from `.cursor/skills/verify-howmuch/` on the orb, API on port 36651 forwarded to the Mac, signed in as the verify user `verifier`. Synthetic data only: the audit seed (`seed-audit.ts`), the 16-card rewards fixture, Exposure Below's minimum raised to 5,000 so it is unmet, and the Home Loan register in the plain header state.
- Build and install: `SIMULATOR_UDID=<18 Pro> scripts/ios-xcodebuild.sh build`, then `xcrun simctl install <udid> "$(… app-path)"` on each simulator.
- Text size with `xcrun simctl ui <udid> content_size large | extra-extra-extra-large | accessibility-extra-extra-extra-large`, appearance with `xcrun simctl ui <udid> appearance light|dark`, landscape with the Simulator's Device > Rotate Left. Taps and element frames (points) with `axe`.
- Screenshots are in `.amp/in/artifacts/ios-ui-hillclimb/ip-fixes/` on the orb (not in git), named `<device>-<appearance>-<size>-<screen>-before|after.png`. "Before" captures come from the unmodified `2258ef81` build (the audit's captures, or new ones where noted).

## Findings

### IP-04 (with the register half of PD-03): register rows and plain header at accessibility sizes

- Steps: SE, light, ax5. Accounts, Payments due band, Platinum Cashback Card; scroll to Yesterday. Then Accounts, Home Loan (plain header).
- Expected: payee, category, memo and amount whole; the header balance on one line.
- Before: "Sho…", "Shop…", amount as "-" / "$47." / "30" (`se-light-ax5-register-cashback-s1-before.png`). Home Loan header put the minus on its own line (`se-light-ax5-register-homeloan-before.png`).
- After: the row reads Shopee / Shopping / Desk lamp / -$47.30, each line whole, the status dot beside it (`se-light-ax5-register-cashback-after.png`; axe: `StaticText 'Shopee' [32, 282, 182, 64]`, `'-$47.30' [32, 461, 186, 58]`). Header reads "-$412,650.00" on one line (`StaticText '-$412,650.00' [16, 78, 343, 60]`, `se-light-ax5-register-homeloan-after.png`).
- Default size: 18 Pro rows unchanged, payee and amount side by side (`p18-light-default-register-cashback-after.png`; Home Loan header `[16, 124, 150, 26]`). iPad Pro 13-inch rows unchanged (`ipad-light-default-register-cashback-after.png`).

### IP-05 (with the Scheduled half of PD-03, and DU-10): scheduled rows

- Steps: SE, light. Accounts, Scheduled tile. At ax5, xxxl and default.
- Expected: payee, detail, amount and recurrence whole at every size.
- Before (ax5): "(No…", "Plati…", "-" / "$19." / "98", "Repe…" (`se-light-ax5-scheduled-before.png`). Before (xxxl): "Platinum Ca…", "Everyday Ac…", "Repeats mon…" (`se-light-xxxl-scheduled-du10-before.png`). Before (default): "Platinum Cashback Ca…", "Everyday Account · Tr…" (`se-light-default-scheduled-du10-before.png`). The xxxl and default "before" captures were taken on a build whose non-accessibility row matched `2258ef81` apart from a no-op frame.
- After (ax5): payee, "Platinum Cashback Card · Shopping", -$19.98 and "Repeats monthly" stacked and whole; the transfer reads "Transfer to Rainy Day Saver" / "Everyday Account · Transfer" / -$1,000.00 (`se-light-ax5-scheduled-after.png`, `se-light-ax5-scheduled-transfer-after.png`).
- After (xxxl and default): the detail line and the recurrence wrap instead of truncating (`se-light-xxxl-scheduled-du10-after.png`, `se-light-default-scheduled-du10-after.png`). At xxxl on the SE the payee still truncates to one line ("Transfer to…"), as register payees do.
- 18 Pro default: one-line rows except where the detail is longer than its column (`p18-light-default-scheduled-after.png`). iPad Pro 13-inch: one-line rows, unchanged (`ipad-light-default-scheduled-after.png`).

### IP-06: Insights Top Categories

- Steps: SE, light, ax5. Insights, scroll the Month to Date card to Top Categories.
- Expected: heading, names and figures whole.
- Before: "Top Cate-gories", "Utilit…", "$1,92" / "2.35" (`se-light-ax5-insights-s2-before.png`).
- After: "Top Categories" then "Spent"; each name with its dot, the figure under it (`se-light-ax5-insights-after.png`; axe: `'Top Categories' [32, 102, 291, 52]`, `'Utilities' [48, 221, 155, 58]`, `'$1,922.35' [48, 284, 232, 58]`).
- Default: 18 Pro pixel-identical to the audit capture below the status bar (`magick compare -metric AE -fuzz 2%`: 0 pixels; `p18-light-default-insights-after.png`). iPad unchanged (`ipad-light-default-insights-after.png`).

### IP-07: Rewards, unmet minimum's figure

- Steps: SE, light, ax5. Rewards, Exposure Below card.
- Expected: the figure on one line.
- Before: "$3,629.5" / "0 to minimum" (`se-light-ax5-rewards-below-before.png`).
- After: "$3,629.50" on its own line, then "to minimum", "12 days left" (`se-light-ax5-rewards-below-after.png`; axe: `'$3,629.50' [61, 314, 252, 60]`, `'to minimum' [61, 376, 238, 58]`).
- Default: 18 Pro reads "$3,629.50 to minimum" on one line as before (`p18-light-default-rewards-below-after.png`); iPad unchanged (`ipad-light-default-rewards-after.png`).

### IP-13: Range Report filter chips inset

- Steps: 18 Pro, light, default. Rewards, As of, Range Report….
- Expected: chips at the 16pt edge.
- Before: chips at x 37 over two rows (`p18-light-default-range-report-before.png`).
- After: `PopUpButton 'Date range, November 2026' [16, 151, 142, 30]`, all three chips on one row (`p18-light-default-range-report-after.png`).

### IP-12: New Account Type and Icon rows

- Steps: SE, dark, ax5. Accounts, New Account.
- Expected: Type and Icon stack like Name; no word breaks.
- Before: "Typ" / "e", "Che" / "ck-" / "ing" (`se-dark-ax5-new-account-before.png`).
- After: "Type", then the emoji, "Checking" and the chevron on one line; "Icon", then the emoji and chevron (`se-dark-ax5-new-account-after.png`; axe: `'Checking' [99, 368, 204, 60]`). An intermediate build without the one-line limit still showed "Check-ing", so the type name shrinks rather than breaks at accessibility sizes.
- Default: 18 Pro differs from the audit capture only by the text caret (78 pixels; `p18-light-default-new-account-after.png`). iPad unchanged (`ipad-light-default-new-account-after.png`).

### IP-15 (and DU-15): Assistant date format and the query card's inspect target

- Steps: 18 Pro, light, default. Accounts, More, Assistant.
- Expected: the app's date format.
- Before: "2026-11-18 – 2026-11-18 · All accounts" (`p18-light-default-assistant-before.png`).
- After: "Today · All accounts" (`p18-light-default-assistant-after.png`). `LedgerDate.friendlyString` is the register's format: "Today", "Yesterday", "Mon 16 Nov 2026". A single-day range shows one date.
- The inspect link in `CaptureConversationViews.swift` now has its 44pt frame and content shape inside the button label. Unconfirmed in the simulator: the query card needs an AI answer, which this setup does not have. It builds and the snapshot tests pass. The query card's own range text (L625) still uses ISO dates; that line was not assigned.

### IP-16: conversation composer margins

- Steps: 18 Pro, light, default. Assistant, New conversation.
- Before: content 12pt from the edges (`p18-light-default-assistant-conversation-before.png`).
- After: `Button 'Account for next message…' [16, 713, 280, 44]`, `Button 'Add manually' [304, 714, 82, 44]` (right edge 386 = 402 − 16) (`p18-light-default-assistant-conversation-after.png`).

### IP-20: scheduled editor's amount

- Steps: 18 Pro, light, default. Scheduled, Transfer to Rainy Day Saver.
- Before: a bare "1000.00" (`p18-dark-default-scheduled-editor-before.png`).
- After: "Amount" on the left, "1000.00" trailing (`p18-light-default-scheduled-editor-after.png`; axe: `StaticText 'Amount' [36, 532, 60, 20]`, `TextField 'Amount' '1000.00'`).

### IP-21: AI provider shows Back and Cancel

- Places the page opens: `SettingsView.swift` L342 pushes it with a `NavigationLink` (both Settings layouts use the same `assistantSection`); `AddTransactionsView.swift` L138 presents it as a sheet in its own `NavigationStack` (the sparkles button in a conversation); `CaptureSnapshotTests.swift` L2129 renders it as a root.
- Steps: 18 Pro, light, default. More, Settings, AI provider; then Assistant, New conversation, sparkles.
- Before: Back and Cancel together on the pushed page (`p18-light-default-ai-provider-before.png`).
- After: pushed page has `Button 'Settings' BackButton` and `Save AI settings`, no Cancel (`p18-light-default-ai-provider-after.png`). The sheet still has Cancel and Save (`p18-light-default-ai-provider-sheet-after.png`).

### IP-11 (and DU-13): keypad key and direction toggle

- Steps: SE, light, ax5. Add Transaction.
- Before: the key reads "d…"; the toggle reads "Out-flow" / "In-flow" (`se-light-ax5-add-transaction-before.png`).
- After: the key reads "done"; the toggle reads "− Outflow" and "+ Inflow", each on one line at the same size (`se-light-ax5-add-transaction-after.png`; axe: `Button 'done' [276, 581, 82, 52]`). The toggle is capped at `xxxLarge`, after a build with only a scale factor showed the two segments at different sizes. The amount's fixed 40pt size is unchanged.

### IP-09 (and DU-06): landscape keypad hides the amount

- Steps: 18 Pro, dark, default, rotated left (874 × 402pt). Add Transaction; type 1 2 3 4 5 6; rotate back to portrait.
- Expected: the amount stays visible while the keypad is up; the keypad stays where it is.
- Before: only the Outflow/Inflow control shows above the keypad; the amount is hidden (`p18-dark-default-landscape-add-transaction-before.png`).
- After: "−$0.00" shows above the keypad (`Button 'Amount' [366, 90, 141, 48]`, keypad from y 148) and stays visible as "-$1,234.56" while typing (`p18-dark-default-landscape-add-transaction-after.png`, `…-typed-after.png`). Rotating back to portrait shows the form from the top (`p18-dark-default-add-transaction-after.png`). On the SE in portrait at ax5 the form opens at the same position as before (`Button '− Outflow'` at y 117 before and after; an intermediate build that scrolled with no anchor moved it up 27pt and was replaced).
- Scroll-into-view was enough, so the keypad was not moved and its 52pt keys are unchanged. Not checked on the Duo's closed display in landscape; there the amount should land in the 120pt or so above the keypad in the same way.

## Checks

- `SIMULATOR_UDID=3C2BD67C-A31D-4197-8D40-533D0D9B66C7 scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` at `d503d6a3`:
  - `Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 193.755 (194.101) seconds`
  - `runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 17:16:02 +0000)`
  - `** TEST EXECUTE SUCCEEDED **`

## Left as found

- The plain header's "Working −$1,089.51 including posted scheduled" line (`RegisterView.swift` about L1000) still breaks after the minus on the SE at ax5. It is outside the assigned lines.
- The Home Loan empty state's "No Transactions" title truncates on the SE at ax5. Not an assigned finding.
