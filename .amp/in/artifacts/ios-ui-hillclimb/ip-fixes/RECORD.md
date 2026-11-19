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

# Round 2: iPhone fixes (Opus 5.5)

- Base: `hc-integrated-r2e.bundle` head `8e173f31`; local branch `ios-ui-hillclimb-ip4`, not pushed.
- Commits: `d94d8683` (2IP-01), `d8f96e7f` (2IP-07), `4c2e0f36` (2IP-03), `66d6c938` (2IP-16), `b29d2584` (2IP-20), `00248341` (2IP-04). 2IP-08 has no commit.
- Setup: Mac satellite `macos-27`, `mac.large`, Xcode 27.3, iOS 27.3. The disposable verify stack runs on the orb, with port 36651 forwarded to the Mac. Synthetic ledger from `seed-audit.ts`, plus two synthetic transactions dated 2026-11-19 so the Assistant card shows Today's spending and the Inspect link. iPhone 18 Pro and iPhone SE (3rd generation) simulators with the base build, and a second pair with the head build, all signed in. Frames are axe accessibility frames in points (x, y, width, height). "ax5" is `accessibility-extra-extra-extra-large`; "default" is `large`.
- Default-size comparison: for every screen below, the frame lists of the base and head builds at the default size were compared on both phones (New, the selection bar with no pick and with one pick, Summary, Range Report, Customise Board, Assistant, Inspect). They are identical except: the Inspect dates (2IP-04), the SE's Customise list scroll offset in one capture (row frames identical), the SE's Range Report tab bar (minimised on scroll in the head capture; content frames identical), and tab bar image names that vary between runs.

### 2IP-01: register totals card

- Steps: SE, light, ax5. Accounts, New.
- Before: three columns. Money Out [137, 142, 102, 154], Money In [37, 167, 86, 102], -$59.30 [248, 220, 95, 157], $0.00 [32, 272, 95, 105], $59.30 [140, 297, 95, 105]. Labels and figures break inside words ("Mon / ey In", "$59. / 30").
- After: one under another, each figure on one line. Money In [32, 142, 168, 52], $0.00 [32, 195, 124, 53], Money Out [32, 256, 202, 52], $59.30 [32, 310, 152, 53], Net [32, 370, 66, 52], -$59.30 [32, 424, 171, 53]. 18 Pro ax5 the same at x 32. Dark SE ax5 checked.

### 2IP-07: selection bar

- Steps: SE, ax5. New, Select from the menu; then pick one row.
- Before: the hint [16, 394, 343, 248] (four lines). After a pick, "1 selected" [36, 417, 136, 174] reads "1 / se- / lected", Edit [182, 432, 116, 188] reads "E / di / t".
- After: the hint [16, 530, 343, 112] (two lines). "1 selected" [36, 434, 222, 58] on one line, the total under it, then Edit [36, 562, 162, 72] on one line and Clear selection [200, 572, 55, 55]. 18 Pro ax5: Edit [36, 755, 161, 73]. Dark SE ax5 checked.

### 2IP-08: New register title beside Approve all (not fixed)

- Before and after (unchanged): SE default, "New" [72, 28, 26, 21] drawn as "…" beside Approve all (2) [114, 20, 128, 36]. 18 Pro xxxl, "New" [72, 71, 19, 25] beside [107, 66, 151, 36]. SE xxxl, no title, button [80, 20, 151, 36]. 18 Pro default fits: "New" [72, 74, 36, 21], button [142, 66, 128, 36].
- Tried: a `ViewThatFits` label with "Approve all (2)" then "Approve all". The bar never offers the item less than its full width, so the first choice always fitted and nothing changed. Reverted.
- Why no fix: the bar squeezes the title, not the item. The only way to keep the count where the title fits is to compute the title's room in code: room = bar width − about 88pt leading − about 132pt (default) to 144pt (xxxl) trailing − the button label. That depends on iOS bar metrics, a fixed offset of the kind this round avoids. On the SE at xxxl even "Approve all" leaves the title about 22pt for about 45pt.

### 2IP-03: By Flag figures on Range Report and Summary

- Steps: SE, ax5. Rewards, Summary (and Range Report), scroll to By Flag.
- Before: Blue's amount [198, -65, 142, 126] breaks "$1,28 / 4.50"; labels cut to "Pur…", "Gre…".
- After: label on its own line, figures under it. Summary: $1,284.50 [36, -46, 250, 64], $57.80 · 1 txn [36, 20, 262, 52]; Purple, Green and Red whole. Range Report: Blue [52, 154, 100, 64], $1,284.50 [36, 220, 250, 64]. 18 Pro ax5: $1,284.50 [36, 123, 250, 63]. Dark SE ax5 checked.

### 2IP-16: Customise Board card names

- Steps: SE, ax5. Rewards, menu, Customise Board, scroll to Cards. The seed's first card is "Exposure Below".
- Before: name [99, 489, 108, 312] reads "Ex- / po- / sure / Below" beside the switch [218, 660, 63, 28] and reorder [288, 623, 52, 44].
- After: name [36, 546, 220, 188] reads "💳 / Exposure / Below", the switch under it [36, 334, 61, 28] after a scroll, reorder [288, 636, 52, 44]. A first version kept the icon in its own column and still broke "Expo- / sure"; the icon now runs inline in the name's text. Dragging the handle of Exposure Below below Exposure Urgent reordered the rows and the board; dragged back. Dark SE ax5 checked. Default size: Customise Board frames identical on both phones.

### 2IP-20: Summary caption

- Steps: SE, light, default. Rewards, Summary.
- Before: the "C" of "Current card periods…" is clipped by the section's rounded corner.
- After: the caption sits 4pt further in and the "C" is whole. The accessibility frame [16, 105, 343, 52] is the same because it includes the padding. This is a deliberate default-size change on both phones.

### 2IP-04: Inspect list

- Steps: SE, default and ax5. More, Assistant, Inspect on Today's spending card.
- Before (default): header "Recorded spending · 2026-11-19 to 2026-11-19", row "2026-11-19 · Joint Household Expenses Account · Groceries" [36, 306, 184, 34].
- After (default): header "Recorded spending · Today", row "Today · Joint Household Expenses Account · Groceries" [36, 306, 211, 34]. Text only; other frames unchanged.
- Before (ax5): details [36, 420, 160, 573] beside the amount [204, 524, 134, 174] ("$128. / 64").
- After (ax5): details [36, 268, 244, 261], amount under them on one line [36, 532, 218, 58]. 18 Pro ax5: amount [36, 422, 217, 59]. Dark SE ax5 checked.

## Checks (round 2)

- Fresh iPhone 18 Pro simulator, never opened by hand, `content_size large`; both accessibility settings written with `defaults write` immediately before the run. `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` at `00248341`:
  - `runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-19 02:40:49 +0000)`
  - `Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 186.472 (186.819) seconds`
  - First run; no rerun needed.
