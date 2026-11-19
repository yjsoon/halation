# iPhone Duo fixes for the iOS UI hillclimb: record

Round 1 of the hillclimb found 17 faults on the iPhone Duo (DU-01 to DU-17 in the "iOS UI hillclimb" artifact). This records the fixes assigned to the Duo worker: what was changed, how each was proven in the simulator, and what was left alone.

## Revision

- Base: `origin/main` at `2258ef81`.
- Branch: `ios-ui-hillclimb-du`, local only, not pushed.
- Code under test: `8b86134a` (the last code commit). The commit that adds this record changes no code.

| Finding | Commit | Result |
| --- | --- | --- |
| DU-02 | `26b7d8d8` | Fixed |
| DU-08 | `09ab67f1` | Fixed |
| DU-04 (category rows) | `2bd4befa` | Fixed |
| DU-12 | `dad40b25` | Fixed at default and large sizes; one word still hyphenates at the largest accessibility size |
| DU-16 | `8b86134a` | Fixed |
| DU-11 (four controls) | none | No fault: the tap regions are already 44pt or more |
| DU-17 | none | Not changed: no small fix for either half |

## Setup

- Mac satellite, image `macos-27`, Xcode 27.3 beta. Simulators on iOS 27.3: iPhone Duo, iPhone 18 Pro, iPad Pro 13-inch.
- The disposable verify stack from `.cursor/skills/verify-howmuch/SKILL.md` ran on the orb with its API port forwarded to the Mac, seeded with the synthetic audit ledger (`seed-audit.ts` from the hillclimb kit). No production host was used.
- Builds: `SIMULATOR_UDID=<udid> scripts/ios-xcodebuild.sh build`, installed with `xcrun simctl install`. The "before" app is a build of `2258ef81`.
- The simulators were driven with `axe` (tap, swipe, hinge, rotate, screenshot, element frames in points).
- Captures are named by device, posture, rotation, appearance, text size and screen. They are in `.amp/in/artifacts/ios-ui-hillclimb/du-fixes/` (`before/`, `after/`, `pairs/`, `du17-not-changed/`) and the audit's Duo captures are in `.amp/in/artifacts/ios-ui-hillclimb/duo/`. None are in git.
- The closed-Duo default-size set, the large-text sets, the DU-02 set and the iPad pair in `after/` were taken from a build that differed from `8b86134a` only by two accessibility modifiers on the Income vs Spending summary row, which were then removed. The Income vs Spending capture was taken again from `8b86134a` and is identical pixel for pixel. The posture, dark and iPhone 18 Pro sets are from `8b86134a`.

## DU-02: a card under Settings > Reminders closed Settings

Cause, confirmed in the simulator before the fix: the sheet hung on the Reminders section, so every row in the section presented it. With the base build, tapping a card logged "Attempt to present" 7 times on the Duo's open display and 6 times on the iPhone 18 Pro, and Settings closed.

Fix: each card row presents its own sheet (`Payments/RemindersSettingsSection.swift`).

Steps: More, Settings, scroll to Reminders, tap a card, change Due by one day, Save. Then read `GET /v1/plans/local-plan/card_payment_terms`.

Expected: Payment reminders opens over Settings, Save returns to Settings, and the API holds the new value.

Observed after the fix:

| Display | Card | Change | Sheet title and card name | API `due_gap_days` after Save |
| --- | --- | --- | --- | --- |
| Closed, portrait | Platinum Cashback Card (no terms yet, row read "Set up") | 25 to 24 | Payment reminders, Platinum Cashback Card | 24 (new record; row now reads "On") |
| Closed, portrait | Travel Card | 25 to 26 | Payment reminders, Travel Card | 26 |
| Open, landscape | Platinum Cashback Card | 24 to 25 | Payment reminders, Platinum Cashback Card | 25 |
| Open, landscape | Travel Card | 26 to 25 | Payment reminders, Travel Card | 25 |

Settings stayed open after every Save (its title and Done were still on screen). The log stream filtered on "Attempt to present" recorded no line during the four runs. On the iPhone 18 Pro the sheet also opens over Settings.

Side effect on the disposable stack: Platinum Cashback Card now has payment terms, so it also appears in the payments due band.

Before: `before/duo-open-landscape-light-default-du02-settings-closed-after-tap.png`. After: `after/duo-*-du02-*.png`.

## DU-08: the sky ended in a straight edge at the trailing column

Fix: the Rewards sky ignores the horizontal safe area as well as the top (`Views/RewardsView.swift`). The register's sunrise keeps its frame and gets the system's background extension, placed before the safe-area modifier (`Views/RegisterView.swift`).

Steps: open Rewards, then Accounts, Travel Card. Repeat in every posture.

Expected: the sky continues under the bar column with no hard edge, and the sun, the horizon line and every label stay where they were.

Observed after the fix:

- Closed portrait, closed landscape (both rotations), open landscape, open portrait, book pose and tabletop pose (both rotations), light: the sky runs under the column in both screens. Closed portrait in dark: the same.
- Element frames on the closed display are the same before and after for Rewards (light) and the Travel Card register (dark), apart from the day count in "Resets in 12 days". Nothing moved under the column.
- iPhone 18 Pro, default size: Rewards and the register show no pixel above 4% difference outside the status bar and home indicator.
- iPad Pro 13-inch, portrait: Rewards is identical pixel for pixel. The register column is unchanged; the only differences are noise at the sidebar's edge, where the Accounts list sat at a different scroll position in the two captures.

Rejected: widening the register's sunrise the same way moved the sun under the column's status icons. The background extension placed after the safe-area modifier drew a mirrored band across the top.

Before: `duo/closed-portrait-light-default-register-travel.png`, `duo/closed-portrait-light-default-rewards.png`. After: `after/duo-<posture>-light-default-{rewards,register-travel}.png`. Pairs: `pairs/du08-*.png`.

## DU-04: share and count wrapped one character per line (category rows)

Fix: in a category row the meter, share and count have their own full-width line under the name and amount. When they do not fit on one line the meter goes above the labels, and at accessibility sizes the amount goes under the name (`Views/ReflectDetails.swift`, the category row only; the group heading is PD-05 and was not touched).

Steps: Insights, Month to Date, scroll to the category groups.

Expected: "27% · 1 txn" on one line in every row.

Observed after the fix:

- Closed portrait, default size, light and dark: every share and count is on one line (before: "· 1 txn" broke over two lines in Holiday).
- Closed portrait at `extra-extra-extra-large` and `accessibility-extra-extra-extra-large`, and open landscape at the largest size: one line in every row. At the largest size the name, the amount and the meter line stack.
- iPhone 18 Pro, default size: no pixel differs on either page.
- The row's accessibility label now reads name, amount, share, count (before: name, share, count, amount).

Still wrong at the largest size and not part of this fix: the group heading's share (PD-05) and the three-figure summary above the groups.

Before: `duo/closed-portrait-light-default-report-mtd-2.png`, `duo/closed-portrait-light-ax5-report-mtd-2.png`. After: `after/duo-*-report-mtd*.png`. Pairs: `pairs/du04-*.png`.

## DU-12: Payment reminders values wrapped beside their steppers

Fix: a stepper's value goes under its title when title and value do not fit on one line beside the stepper (`Payments/CardPaymentTermsSheet.swift`). No wording changed.

Steps: Accounts, Travel Card, Actions, Edit Account, Payment reminders.

Expected: "25 days after statement" and "2 working days before" on one line each.

Observed after the fix:

- Closed portrait, default size: both values are on one line under "Due" and "Pay on". "Remind me 7 days before" fits and stays on one line.
- `extra-extra-extra-large`: the values take two lines under their titles with no word broken.
- `accessibility-extra-extra-extra-large`: the values sit under their titles, where before they were squeezed beside them and broke as "work-ing" and "be-fore". "statement" still hyphenates once ("state-ment") in the 180pt left beside the stepper.
- iPhone 18 Pro, default size: element frames are identical. The only pixel differences are in the glass highlights of Cancel and Save, which also differ between two captures of the same build.

Before: `before/duo-closed-portrait-light-{default,xxxl,ax5}-payment-terms*.png`. After: `after/duo-closed-portrait-light-{default,xxxl,ax5}-payment-terms*.png`. Pairs: `pairs/du12-*.png`.

## DU-16: "Savings rate" wrapped and its figure dropped a line

Fix: the four summary columns align on the top of their figures, so a title that wraps grows upwards (`Views/IncomeVsSpendingPeriodDetailView.swift`).

Steps: Insights, Income vs Spending.

Expected: the four figures on one line.

Observed after the fix:

- Closed portrait, default size: the four figures share a top edge at y 214 (before: three at y 198 and 59.6% at y 214). The three one-line titles moved down a line to sit above their figures.
- iPhone 18 Pro, default size: no pixel differs and the element frames are identical.

Rejected: aligning by the last text baseline fixed the Duo but moved Income and Spending by 1pt and Net by 2pt on the iPhone. Giving the columns layout priority over the spacers did not stop the title wrapping.

Not checked: VoiceOver's reading order on the closed Duo. The Savings rate column now starts 16pt higher than the others and the accessibility dump lists it first.

Before: `duo/closed-portrait-light-default-report-ivs.png`. After: `after/duo-closed-portrait-light-default-report-ivs.png`. Pairs: `pairs/du16-*.png`.

## DU-11: four small tap targets (no change)

The audit measured these controls by their accessibility frames. Tapping the base build at and beyond the edges of each frame showed the tap regions are larger than the frames, so there was nothing to fix and no commit.

| Control | Frame at `2258ef81` (x, y, w, h) | Taps that worked | Taps that did not |
| --- | --- | --- | --- |
| "Not reconciled yet", plain register header | 16, 150, 104, 14 | y 137, 157, 177; x 118, 124 | y 132, 182; x 140 |
| Clear, filter banner | 309, 208, 38, 18 | y 197 to 243; x 303 to 362 | y 190 |
| Clear selection | 20 by 20, centre 336, 607 | 20pt each way; y 633; x 310 | y 581; x 362 |
| New Group, empty Account Groups | 147, 446, 97, 28 | y 434 to 486; 6pt outside each side | not probed further out |

The other DU-11 and PD-07 controls were measured the same way in the audit and may be the same.

## DU-17: the keyboard over the last line of content (no change)

Both halves were looked at again on the closed display at the default size. Neither has a small fix, and no code was tried.

- Empty search. The "No Results" message ends at y 411 and the keyboard starts at y 374. The list scrolls: at the end of its travel the message sits at y 264 to 313 and is fully readable. The empty state is already the first row under the "0 matching transactions" line, so there is nothing to align to the top; its height is the system empty state's own.
- New Account. The keyboard's Done button (y 332 to 368) covers the end of the balance hint (y 335 to 351). The form scrolls: 20pt up and the hint sits at y 315 to 331, clear of the button.

A real fix would scroll the content in step with the keyboard, move the keyboard's Done, or replace the system empty state with a shorter one. Each is more than a small correction.

Captures: `du17-not-changed/`.

## iPhone 18 Pro at the default text size

Compared before and after for every changed screen, ignoring the status bar and the home indicator:

| Screen | Pixels over 4% different | Element frames |
| --- | --- | --- |
| Rewards | none | identical |
| Travel Card register | none | identical |
| Payment reminders (two pages) | glass highlights on Cancel and Save only | identical |
| Month to Date (two pages) | none | identical; category row labels read in a new order (see DU-04) |
| Income vs Spending | none | identical |
| Settings, Reminders | "Set up" became "On" for Platinum Cashback Card (data changed by the DU-02 proof) | otherwise identical |

## Test suite

`SIMULATOR_UDID=<iPhone 18 Pro> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` at `8b86134a`:

- `runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 18:12:06 +0000)`
- `Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 189.170 (189.503) seconds`
- `** TEST EXECUTE SUCCEEDED **`

No unit tests were added.

## Files touched

`Payments/RemindersSettingsSection.swift`, `Payments/CardPaymentTermsSheet.swift`, `Views/RewardsView.swift`, `Views/RegisterView.swift` (the sunrise header only), `Views/ReflectDetails.swift` (the category row, and one line near L469 that reads the text size for it), `Views/IncomeVsSpendingPeriodDetailView.swift`. Nothing outside the assigned list.

## Second round: R-D9, R-D10 and R-D11

Three faults seen in passing during the Duo review of the integrated round 1 fixes, all on the closed display at `accessibility-extra-extra-extra-large`.

### Revision and setup

- Base: `7c421f52` (the lead's bundle `hc-integrated-r1c`). Branch `ios-ui-hillclimb-du2`, local only, not pushed.
- Code under test: `8da1debd`. The commit that adds this section changes no code.
- Setup as above: the same disposable stack, seed and simulators. Three builds were compared: `2258ef81` ("base"), `7c421f52` ("before") and the fixed build ("after").
- The R-D10 and R-D11 captures come from a build whose `ReflectView.swift` is identical to `8da1debd` but whose Payments due heading was an earlier draft. Every R-D9 capture and both default-size Accounts comparisons were retaken on the final build.
- Frames are `[x, y, width, height]` in points from `ui.sh`. Captures are in `.amp/in/artifacts/ios-ui-hillclimb/du-fixes2/f3/` (`base/`, `before/`, `after/`, `lead/`, `pairs/`), not in git.

| Finding | Commit | Older than this round? |
| --- | --- | --- |
| R-D9 | `83dafcc2` | No. At `2258ef81` the title read "Payments / due" with no word broken, because the Accounts content was wider than its column (DU-01). Once the content was kept inside the column, the title had too little width. Which commit caused it was inferred, not bisected. |
| R-D10 | `17d99cc4` | Yes. `2258ef81` breaks the same figures in the same way. |
| R-D11 | `8da1debd` | Yes. The title's frame is the same at `2258ef81`. |

### R-D9: the Payments due heading broke inside the word

Fix: at accessibility sizes the icon, the title and the count stack (`Payments/PaymentsDueBand.swift`, the heading only).

Steps: set the text size, launch, open Accounts.

Expected: "Payments" is never hyphenated.

| State | Before (`7c421f52`) | After |
| --- | --- | --- |
| Closed, portrait, light, largest size | `[97, 82, 159, 187]`, "Pay- / ments / due" | `[20, 137, 336, 63]`, one line, count under it at `[20, 204, 44, 55]` |
| Closed, portrait, dark, largest size | not captured | same frames as light |
| Open, landscape, light, largest size | `[97, 82, 156, 187]`, three lines (on `79e3f937`, same file) | `[20, 137, 246, 125]`, "Payments / due" |
| Book pose, landscape, light, largest size | not captured | `[20, 137, 336, 63]`, one line |
| iPhone 18 Pro, light, largest size | not captured | `[20, 244, 336, 63]`, one line |
| Closed, `extra-extra-extra-large` | `[58, 82, 148, 28]` (on `79e3f937`) | `[58, 82, 148, 28]` |
| Closed Duo and iPhone 18 Pro, default | `[50, 82, 113, 20]` and `[50, 168, 113, 20]` | identical frames; no pixel differs outside the clock |

At `2258ef81` the closed display gave `[67, 82, 246, 125]`, "Payments / due".

A first draft kept the icon beside the title. It fixed the closed display but still gave "Pay- / ments / due" in the open display's 340pt Accounts column, so the icon went above the title as well.

### R-D10: the Net Worth card broke its figures

Fix: at accessibility sizes Assets and Debts sit under their labels, and the total and both figures stay on one line, shrinking to fit only when they must (`Views/ReflectView.swift`, `netWorthContent`).

Steps: set the text size, launch, open Insights, scroll to Net Worth.

Expected: no figure breaks inside the number.

| Figure, closed, portrait, light, largest size | Before | After |
| --- | --- | --- |
| Total | 317 x 137, "$295,004.4 / 9" | 317 x 62, one line, about 10% smaller than its full size |
| Assets | 161 x 117 beside the label, two lines | 291 x 59 under the label, one line, full size |
| Debts | 161 x 175 beside the label, three lines | 313 x 59 under the label, one line, full size |

Also seen after the fix: closed dark at the largest size (same layout); open landscape at the largest size (total 353 x 69 at full size); iPhone 18 Pro at the largest size (total 337 x 66). At `extra-extra-extra-large` on the closed display the frames equal those on `79e3f937` (figures 125 x 25 and 134 x 25, beside their labels). At the default size on the closed Duo and the iPhone 18 Pro the frames are identical and no pixel differs outside the clock.

### R-D11: "Income vs Spending" broke as "Spend- / ing"

Fix: at accessibility sizes the card's icon sits above its title, so the title has the card's width (`Views/ReflectView.swift`, `ReflectCard`). This applies to all four Insights cards.

Steps: set the text size, launch, open Insights, scroll to Income vs Spending.

Expected: "Spending" is never hyphenated.

| Card title, closed, portrait, light, largest size | Before | After |
| --- | --- | --- |
| Income vs Spending | 233 x 233, "Income / vs / Spend- / ing" | 233 x 117, "Income vs / Spending" |
| Net Worth | 203 x 117, two lines | 224 x 59, one line |
| Month to Date | 220 x 117, two lines | 158 x 117, two lines |
| Age of Money | 214 x 117, two lines | 153 x 117, two lines |

Cost: Month to Date and Age of Money keep two title lines and gain the icon's row, so each header is about 55pt taller. Income vs Spending's header is about 60pt shorter and Net Worth's is unchanged.

Also seen after the fix: closed dark, open landscape and iPhone 18 Pro at the largest size, each reading "Income vs / Spending". At the default size on the closed Duo and the iPhone 18 Pro the title frames are identical (168 x 18), and no pixel differs outside the clock on the Insights and Net Worth captures. The Income vs Spending capture was taken at a different scroll offset, so it was compared by frames only.

Not fixed: the card's legend still truncates to "Spen..." on the closed display at the largest size. It is the same at `2258ef81`.

### The lead's two corrections on the Duo

- `414e6de7`, closed, portrait, light, largest size, Everyday Account register, the Vanguard row (row `[32, 197, 278, 289]`, texts ending at x 260, status control `[314, 320, 44, 44]`). Taps in the blank space at (300, 217), (300, 466) and (302, 281) each opened the transaction. A tap on the status control changed it from "Mark Vanguard uncleared" to "Mark Vanguard cleared" without opening the form, and a second tap changed it back.
- `0440ddf3`, light, default. Open flat the Accounts column is 340pt and the register starts at x 356; in the book pose 456pt and x 512. The bar buttons sit at New Account `[160, 28, 40, 40]`, More `[216, 28, 40, 40]` and Hide Sidebar `[276, 28, 40, 40]` open, and at x 276, 332 and 392 in the book pose; Search is `[889, 130, 27, 36]`. `79e3f937`, `7c421f52` and the fixed build gave the same frames at each step of: launch open, close, open, book pose, open.
- In that session the Accounts title was the small inline one (`[20, 38, 75, 21]`) on every build, `2258ef81` included, where an earlier capture of `79e3f937` showed the large title. The cause was not found; it does not differ between builds.

### Tests

`SIMULATOR_UDID=<iPhone 18 Pro> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` at `8da1debd`, simulator at the default text size, light:

- `runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 20:21:27 +0000)`
- `Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 184.005 (184.367) seconds`

### Not checked

- The tabletop pose and the closed display in landscape.
- R-D10 and R-D11 in the book pose.
- Dark, except the closed display at the largest size.
- iPad: only the Payments due frames were read at the largest size (`[20, 141, 246, 126]`, count under the title); the Insights cards were not reached and nothing was seen in a capture.
- `83dafcc2` and `17d99cc4` were not built on their own; only `8da1debd` was built and tested.

## Third round: 2DU-01, 2DU-02, 2DU-03, 2DU-05 and 2DU-06

Five faults from GPT-6 Astra's round 2 audit of the combined branch on the iPhone Duo, and one check with no fix (2DU-04).

### Revision and setup

- Base: `7fb53016` (the lead's bundle `hc-integrated-r2`). Branch `ios-ui-hillclimb-du3`, local only, not pushed.
- Code under test: `8a091f0b`. The commit that adds this section changes no code.
- Setup as above: the same disposable stack and seed on the orb, on a new Mac satellite (`macos-27`, `mac.large`) with the API port forwarded. iPhone Duo and iPhone 18 Pro simulators on iOS 27.3.
- Three builds were compared: `2258ef81` (for 2DU-04 and one probe), `7fb53016` ("before") and the fixed build ("after"). The fixed build was made from the five uncommitted edits, which were then committed unchanged, one file per commit.
- Frames are `[x, y, width, height]` in points from `ui.sh`. "Largest size" is `accessibility-extra-extra-extra-large`. Captures are in `.amp/in/artifacts/ios-ui-hillclimb/du-fixes3/f4/` (`before/`, `after/`, `probe/`, `du04/`, `pairs/`), not in git.
- All five faults reproduced on `7fb53016` before any edit, in light. Astra saw them in dark.

| Finding | Commit | File |
| --- | --- | --- |
| 2DU-01 | `ff88ead2` | `Payments/CardPaymentScheduleSheet.swift` |
| 2DU-02 | `6b79973e` | `Views/ReflectDetails.swift` |
| 2DU-03 | `7a9e2785` | `Views/CaptureConversationViews.swift` |
| 2DU-05 | `92fe4bff` | `Views/RegisterView.swift` |
| 2DU-06 | `8a091f0b` | `Views/RewardsImportView.swift` |

### 2DU-01: Schedule payment broke its titles and amounts

Fix: at accessibility sizes the amount sits under its title, on one line.

Steps: set the text size, launch, Accounts, "Schedule payment for Platinum Cashback Card", scroll to Minimum.

Expected: no title breaks inside the word and no amount inside the figure; the whole row still selects.

| State | Before (`7fb53016`) | After |
| --- | --- | --- |
| Closed, portrait, light, largest size | Statement row 358 x 217; title 118 x 125, "State / ment"; amount `[253, 594, 109, 187]`, "$1,6 / 59.5 / 6" | Statement row `[24, -2, 358, 158]`, title `[114, 13, 232, 63]`, amount `[114, 78, 248, 63]`; Minimum row `[24, 155, 358, 159]`, title `[114, 170, 209, 63]`, amount `[114, 236, 174, 63]` |
| Closed, portrait, dark, largest size | not captured | seen in a capture: one line each |
| iPhone 18 Pro, light, largest size | not captured | Statement row `[16, 228, 370, 159]`, title `[106, 243, 232, 63]` |
| Closed, `extra-extra-extra-large` | not captured | side by side as before: row `[24, 234, 358, 59]`, title `[79, 250, 103, 28]` |

Tap: with Statement selected, a tap at (370, 304), the blank bottom corner of the Minimum row `[24, 159, 358, 159]`, selected Minimum.

### 2DU-02: the Net Worth report broke Assets and Debts

Fix: the two figures stay side by side while both fit on one line and go one under the other when they do not; each stays on one line.

Steps: set the text size, launch, Insights, Net Worth.

Expected: no figure breaks inside the number and the minus stays with its figure.

| State | Before (`7fb53016`) | After |
| --- | --- | --- |
| Open, portrait, light, largest size | Assets `[33, 522, 274, 117]`, last digit on a second line; Debts `[331, 522, 305, 117]`, minus above the figure | Assets `[182, 522, 305, 59]` under its label `[272, 468, 125, 51]`; Debts `[171, 642, 327, 59]` under its label `[280, 588, 110, 51]` |
| Closed, portrait, dark, largest size | not captured | `[38, 746, 305, 59]` and `[32, 866, 317, 57]`, one line each |
| iPhone 18 Pro, light, largest size | not captured | `[49, 784, 305, 59]` and `[38, 904, 327, 59]` |
| Closed, `extra-extra-extra-large` | not captured | side by side: `[44, 346, 131, 25]` and `[198, 346, 140, 25]` |

### 2DU-03: the Conversation dock ran behind the title and the keyboard

Fix: at accessibility sizes Add manually sits under the account button, which has the dock's width and stays on one line. `Views/AddTransactionsView.swift` was not changed.

Steps: set the text size, launch, Assistant, New conversation (the field takes focus and the keyboard comes up), then type a draft.

Expected: the account's label does not break inside its words or reach the title, and Send and the attachment button are above the keyboard.

| State | Before (`7fb53016`) | After |
| --- | --- | --- |
| Closed, portrait, light, largest size, empty | Account button `[16, 76, 171, 250]`, behind the title; Add manually `[195, 31, 171, 105]`; Send `[312, 379, 44, 44]` and attachment `[26, 379, 44, 44]` behind the keyboard, whose top is at about y 374 | Account `[16, 161, 350, 44]`, Add manually `[111, 205, 255, 53]`, field `[78, 276, 226, 80]`, attachment `[26, 312, 44, 44]`, Send `[312, 312, 44, 44]` |
| The same with a draft typed | not captured | Account at y 121, field `[78, 236, 226, 120]`, Send `[312, 312, 44, 44]` |
| Closed, portrait, dark, largest size | not captured | seen in a capture: the same layout |
| Open, landscape, light, largest size | not captured | Account `[16, 178, 835, 59]`, Add manually `[596, 236, 255, 53]`, field `[78, 307, 711, 80]`, Send `[797, 343, 44, 44]`, first key row at y 454 |
| Opened, draft typed, then folded shut | not captured | Account `[16, 121, 350, 44]`, field `[78, 236, 226, 120]`, Send `[312, 312, 44, 44]`; the draft is kept |
| iPhone 18 Pro, light, largest size, draft typed | not captured | Account `[16, 586, 370, 45]`, Add manually `[131, 631, 255, 53]`, Send `[332, 778, 44, 44]` |
| Closed, `extra-extra-extra-large` | not captured | side by side as before: Account `[16, 219, 228, 44]`, Add manually `[252, 220, 114, 44]` |

Taps at the largest size on the closed display: a tap 10pt inside the right end of the account button opened the Account picker, and a tap 6pt inside the left edge of Add manually, at (117, 231), opened Add Transaction.

Costs: the field still stops at 120pt, so only the last two lines of a longer draft show at the largest size. The iPhone 18 Pro simulator showed no software keyboard in these captures, so "above the keyboard" was proved on the Duo only.

Seen in passing and not fixed: on the closed display, after going to the Account picker and back, the keyboard returns but the dock stays at the bottom of the screen behind it (Account `[16, 517, 260, 44]`, Send `[312, 582, 44, 44]`, first key row at y 425, default size, `7fb53016`). It is the same at `2258ef81` (Account `[12, 517, 268, 44]`, Send `[316, 582, 44, 44]`) and on the fixed build, at the default and the largest size, and it did not correct itself after a few seconds.

### 2DU-05: a register row put the minus above its figure

Fix: beside the payee the amount keeps its own width on one line, so the payee is the text that shortens. Astra suggested stacking the row at this size; that changes every row's layout at a size where most rows fit, so the smaller change was made instead.

Steps: book pose in landscape, `extra-extra-extra-large`, Accounts, Travel Card.

Expected: "-$1,284.50" on one line; rows that fitted before keep their frames.

| Row (book pose, landscape, light, `extra-extra-extra-large`) | Before (`7fb53016`) | After |
| --- | --- | --- |
| Singapore Airlines, row | `[528, 444, 247, 104]` | `[528, 444, 247, 104]` |
| Singapore Airlines, payee | `[528, 444, 111, 28]`, "Singapor..." | `[528, 444, 103, 28]`, "Singapo..." |
| Singapore Airlines, amount | `[673, 470, 102, 51]`, minus on its own line | `[664, 484, 111, 25]` |
| Uniqlo, row, payee, amount | `[528, 333, 247, 54]`, `[528, 333, 67, 28]`, `[695, 348, 80, 25]` | identical |
| MUJI, row, payee, amount | `[528, 605, 247, 80]`, `[528, 605, 55, 28]`, `[682, 632, 93, 25]` | identical |

Closed, portrait, light, `extra-extra-extra-large`: the first screen of the Travel Card register has no frame that differs between the two builds (Singapore Airlines payee `[32, 388, 123, 28]`, amount `[199, 427, 111, 25]`). The second screen was captured at a scroll offset 10 to 11pt apart, and every element differs by that offset alone, with the same x, width and height.

Cost: the payee gives up 8pt in the row that had the fault.

### 2DU-06: the Import & Export row symbol overlapped its title

Fix: at accessibility sizes the symbol sits above the title. The screen is reached by Settings, "Rewards import & export".

Steps: set the text size, launch, Insights, More, Settings, "Rewards import & export".

Expected: the symbol does not touch the title.

| State | Before (`7fb53016`) | After |
| --- | --- | --- |
| Closed, portrait, light, largest size | symbol `[24, 187, 61, 44]` over the title, which starts at x 78 | symbol `[51, 185, 61, 44]`, title `[44, 238, 253, 187]` below it |
| Closed, portrait, dark, largest size | not captured | seen in a capture: the same layout |
| iPhone 18 Pro, light, largest size | not captured | symbol `[43, 235, 61, 44]`, title `[36, 288, 253, 187]` |
| Closed, `extra-extra-extra-large` | not captured | side by side as before: symbol `[42, 149, 27, 19]`, title `[78, 145, 242, 28]` |

Costs: the second row is 66pt taller on the closed display at the largest size (486 to 552), and the symbol's frame starts 7pt to the right of the title's on both devices. In the captures the glyph's edge is within about 3pt of the title's.

### Default text size

Closed Duo and iPhone 18 Pro, light, default size, `7fb53016` against the fixed build: nine captures per device (Schedule payment x 2, Import & Export x 2, the Net Worth report, the Travel Card register x 2, Conversation empty and with a draft). Every element frame is identical. The one line that differed was a keyboard suggestion word. Pixels differ only in the clock and the bars' glass.

### 2DU-04: opening the phone closes New Account (check only, no change)

On a build of `2258ef81`, closed, light, default size: New Account, type "Fold Draft 731" (field `[93, 111, 257, 22]`), open to 180 degrees. The sheet was dismissed. New Account opened again with an empty field showing its placeholder at `[234, 111, 536, 22]`. So the same happens at `2258ef81`; it is older than the hillclimb. It was not run again on `7fb53016`, where Astra reported it.

### Tests

`SIMULATOR_UDID=<iPhone 18 Pro> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` at `8a091f0b`, simulator at the default text size, light, the app terminated first. Every run reported `runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 23:47:35 +0000)`.

1. First full run: `Executed 822 tests, with 1 test skipped and 9 failures (0 unexpected) in 172.603 (172.958) seconds`. The nine failures were in four `CaptureSnapshotTests` cases (`testAddAndEditTransactionFormRowsShareHeightAndOrder`, `testAddManuallySavesOnceAndCancelPreservesConversation`, `testAddTransactionDatePickerDoesNotResizeSheet`, `testAddTransactionMemoFocusHidesCalculatorKeypad`), each reporting an empty accessibility snapshot (`[]`).
2. `-only-testing:HowMuchTests/CaptureSnapshotTests` alone, same products: `Executed 30 tests, with 0 failures (0 unexpected) in 99.510 (99.527) seconds`.
3. Second full run, same products: `Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 179.602 (179.955) seconds`.

The first run's failures did not recur and their cause was not found. The suite was not run at `7fb53016` in this session, so whether that head fails the same way now and then is not known.

### Not checked

- The tabletop pose and the closed display in landscape, for all five.
- The book pose for 2DU-01, 2DU-02, 2DU-03 and 2DU-06; the open display for 2DU-01 and 2DU-06.
- Dark, except the closed display at the largest size.
- iPad.
- The iPhone 18 Pro with the software keyboard up (2DU-03).
- 2DU-04 on `7fb53016`.
- The five commits were not built one at a time; only the head with all five was built and tested.

## Fourth round: 2DU-09, 2DU-10, 2DU-11 and 2PD-18

Three faults from GPT-6 Astra's review of the round 2 Duo fixes, and one from Opus 5.5's iPad review that sits in the register row changed for 2DU-05.

### Revision and setup

- Base: `f1a52c11` (the lead's bundle `hc-integrated-r2c`). Branch `ios-ui-hillclimb-du4`, local only, not pushed.
- Code under test: `4baf7122`. The commit that adds this section changes no code.
- The same disposable stack and seed on the orb, on a new Mac satellite (`macos-27`, `mac.large`) with the API port forwarded. iPhone Duo, iPhone 18 Pro and iPhone SE (3rd generation) simulators on iOS 27.3, each signed in afresh.
- Two builds were compared: `f1a52c11` ("before") and the fixed build ("after"). The fixed build was made from the uncommitted edits, which were then committed unchanged.
- Data added to the disposable ledger for this round, through the API: an account "Spare Pot" with no transactions (Brokerage has one on this stack), an account "Dusty Pot" with one transaction from March 2025, and the two unapproved transactions were approved so that the New register is empty.
- Frames are `[x, y, width, height]` in points from `ui.sh`. "Largest size" is `accessibility-extra-extra-extra-large`. Captures are in `.amp/in/artifacts/ios-ui-hillclimb/du-fixes4/f5/` (`before/`, `after/`, `probe/`, `pairs/`), not in git.

| Finding | Commit | Files |
| --- | --- | --- |
| 2DU-10 | `fd94c49c` (a `fixup!` of "Stack the Conversation dock's header at accessibility sizes") | `Views/CaptureConversationViews.swift`, `Views/AddTransactionsView.swift` (the field's `sizeThatFits`) |
| 2DU-09 | `06977276` | `Views/AddTransactionsView.swift` |
| 2DU-11 | `5ff1afc4` | `Views/RegisterView.swift` (the empty states) |
| 2PD-18 | `4baf7122` | `Views/RegisterView.swift` (`TransactionRow`) |

### 2DU-10: the dock did not fit the closed display in landscape

Fix: on a short screen (compact height) at accessibility sizes the account and Add manually stay side by side, the account shrinking to fit on one line, and the dock gives up most of its vertical padding. The field now takes the height it is offered, down to one line, and a longer draft scrolls inside it. The dock's own layout cannot cap the field, because the UIKit field reported its full height whatever it was offered; that is why `sizeThatFits` in `AddTransactionsView.swift` changed.

Steps: close the phone, rotate to landscape, set the text size, launch, Assistant, New conversation (the keyboard comes up), type "Audit draft, do not send".

Expected: the header, the field and Send sit between the title (bottom at y 60) and the keyboard (top at y 236); the closed display in portrait is as it was.

| State | Before (`f1a52c11`) | After |
| --- | --- | --- |
| Closed, landscape, light, largest size, empty | Account `[16, 65, 562, 44]`, Add manually `[323, 109, 255, 44]`, Send `[524, 207, 44, 44]`, 15pt behind the keyboard | Add manually `[323, 92, 255, 52]`, account `[16, 101, 299, 44]` with its text at 244 x 35, field `[78, 151, 438, 80]`, Send `[524, 187, 44, 44]` |
| The same with the draft typed | Account `[16, 45, 562, 44]`, its text `[16, 38, 407, 59]` over the title `[20, 35, 127, 25]`; Send `[524, 227, 44, 44]`, 35pt behind the keyboard | the same frames as empty; the field shows the draft's last line |
| The other landscape rotation (column leading) | not captured | the same frames 84pt to the right: Send `[608, 187, 44, 44]` |
| Closed, landscape, dark, largest size | not captured | the same frames as light |
| Closed, portrait, light, largest size, empty and typed | Account `[16, 161, 350, 44]`, field `[78, 276, 226, 80]`; typed `[16, 121, 350, 44]`, `[78, 236, 226, 120]` | no frame differs |
| Open, book and tabletop, landscape, largest size | not captured | stacked as before: account `[16, 178, 835, 59]`, Add manually `[596, 236, 255, 53]`, field `[78, 307, 711, 80]`, Send `[797, 343, 44, 44]`, first key row at y 454 |

Taps, closed landscape, largest size: a tap 6pt inside the left edge of Add manually opened Add Transaction, and a tap 8pt inside the right end of the account button opened the Account picker.

Default size: closed landscape, empty and with the short draft, no frame differs. With a draft long enough to reach the field's cap, the closed display in landscape at the default size had Send at `[608, 201, 44, 44]`, 9pt behind the keyboard, at `f1a52c11`; after the fix the field is 57pt high and Send is at `[608, 174, 44, 44]`. The same long draft in portrait has the same frames before and after (field `[78, 236, 226, 120]`).

Costs: in closed landscape at the largest size the field shows one line, so a longer draft shows its last line and the bottom edge of the line above it. The account's label is drawn at about 0.6 of its size there.

### 2DU-09: back from a pushed screen, the dock stayed behind the keyboard

Cause, read from a temporary log of the keyboard notifications and the Conversation's bottom safe area (the logging was removed before the commit): with the keyboard up the safe area is 446.8pt on the closed display (the dock's 176.8pt plus the keyboard). Going to the picker hides the keyboard and the safe area returns to 176.8pt. On Back, UIKit gives the field its focus again, `keyboardWillShow` arrives with the keyboard at `{0, 374, 466, 304}`, and the safe area stays at 176.8pt. SwiftUI never adds the keyboard again, so the dock is not lifted. It is not a Duo fault: the iPhone 18 Pro does the same.

Fix: the field gives up its focus before any screen is pushed from the Conversation, so nothing is restored during the pop. After the Account picker the field takes the keyboard back once the picker has gone, which SwiftUI tracks correctly. No keyboard height is used.

Steps: launch, Assistant, New conversation, tap the account button, then Back, or choose Wallet.

Expected: the dock is above the keyboard, as it was before the picker.

| State | Before (`f1a52c11`) | After |
| --- | --- | --- |
| Closed, portrait, light, default, draft typed, Back | Account `[16, 517, 260, 44]`, field `[78, 580, 226, 46]`, Send `[312, 582, 44, 44]`, first key row at y 425 | `[16, 247, 260, 44]`, `[78, 310, 226, 46]`, `[312, 312, 44, 44]`, the same as before the picker; the draft is kept |
| The same, choosing Wallet | not captured | the same frames, the account reading Wallet |
| Closed, portrait, light, largest size, draft typed, Back | every dock frame 270pt lower than after | Account `[16, 121, 350, 44]`, field `[78, 236, 226, 120]`, Send `[312, 312, 44, 44]` |
| Closed, landscape, light, default, draft typed, Back | Account `[16, 305, 472, 44]`, behind the keyboard | `[16, 109, 472, 44]` |
| Closed landscape, open, book and tabletop, largest size, Back | not captured | the same frames as before the picker in each |
| iPhone 18 Pro, light, default, software keyboard up, Back | Account `[16, 713, 280, 44]`, Send `[332, 778, 44, 44]`, first key row at y 597 | `[16, 419, 280, 44]`, `[332, 484, 44, 44]`, the same as before the picker |
| iPhone 18 Pro, the same, choosing Wallet | not captured | the same frames |

With the keyboard already down (after Cancel in Add Transaction), going to the picker and back leaves the keyboard down and the dock at the bottom of the screen, in view.

The other screens pushed from a Conversation (a draft's editor, a query card's source list, and a draft's account and category pickers) go through the same change, and after them the keyboard stays down. They need a model's reply to exist, so they were not opened.

iPhone software keyboard: the simulator hides it because input sent by `axe type` counts as a hardware keyboard. `xcrun simctl spawn <udid> defaults write com.apple.keyboard.preferences AutomaticMinimizationEnabled -bool NO`, then `notifyutil -p com.apple.keyboard.preferences.changed` and a relaunch, shows it. Typing with `axe type` hides it again and the system writes the setting back, so the iPhone checks were made without typing.

Seen in the same log and not changed: in a fresh Conversation the field reports that it has focus from inside the view update that asked for it, and the write to `isComposerFocused` is lost, so `claimComposerFocus` is never released (at the tap on the account button the log read `focused 0 claim 1`).

### 2DU-11: the register's empty-state titles broke inside the word

Fix: the three tray empty states ("No Transactions", "No new transactions", "No recent transactions") share one helper. At accessibility sizes the title takes two lines at most and shrinks to fit them. The earlier 0.7 scale floor is replaced.

Steps: set the pose and the text size, launch, Accounts, Spare Pot; for the New register, Accounts, New.

Expected: no title breaks inside a word; the system's symbol and the wording are kept.

| State | Before (`f1a52c11`) | After |
| --- | --- | --- |
| Book pose, landscape, light, largest size, empty register | title `[558, 309, 226, 303]`, "No / Transac- / tions" | `[529, 309, 285, 221]`, "No / Transactions" |
| The same, New register | `[512, 82, 319, 376]`, "No new / transac- / tions" | `[512, 82, 319, 298]`, "No new / transactions" |
| Tabletop pose, landscape, light, largest size | the same frames and breaks as the book pose | the same frames as the book pose |
| Closed, portrait, light, largest size, empty register | `[80, 258, 226, 303]`, "No / Transac- / tions" | `[36, 249, 314, 125]`, "No / Transactions"; the tray symbol is not shown |
| The same, New register | `[16, 82, 350, 376]`, "No new / transac- / tions" | `[16, 82, 350, 310]`, whole, with the symbol |
| iPhone SE, light, largest size | empty `[32, 282, 310, 230]`, whole; New `[16, 70, 343, 376]`, "transac- / tions" | empty `[40, 248, 295, 224]`; New `[16, 70, 343, 308]`, whole |
| iPhone 18 Pro, light, largest size | empty `[51, 297, 299, 226]`, New `[16, 116, 370, 311]`, both whole | identical frames |
| Open, landscape, light, largest size | not captured | "No Transactions" on one line, `[399, 258, 409, 173]` |
| Closed, portrait, `accessibility-large` and `accessibility-extra-large` | `[54, 228, 278, 126]`, `[36, 260, 313, 138]` | identical frames |
| Closed, portrait, `accessibility-extra-extra-large` | `[58, 247, 270, 205]` | `[57, 247, 272, 206]` |
| Closed Duo and iPhone 18 Pro, default, both registers | | no frame differs |

Not fixed: the description under the title still reads "Transac- / tions you / add will / appear / here." in the book and tabletop poses at the largest size (`[561, 532, 221, 326]`). The word is about 300pt wide at that size and the column offers about 287pt. The text only shrinks when it has a line limit, and a limit that works is particular to each sentence, so no small general fix was found. On the closed display the description has whole words.

Cost to judge: on the closed display in portrait at the largest size the empty register no longer shows its tray symbol. The title and the whole description now fit without scrolling, where before the description ran off the screen. The symbol is there at the three smaller accessibility sizes, in the New register, and on every other device and pose captured. That the system leaves the symbol out when the rest fits without it is an inference from these captures, not something confirmed.

"No recent transactions" was not reached: the register of an account whose only transaction is old shows that transaction and "No older transactions".

### 2PD-18: register payees were cut at the largest ordinary sizes

Fix: from `extra-extra-large` up, in the side-by-side row, the payee may take a second line. The amount is as 2DU-05 left it.

Steps: set the text size, launch, Accounts, All; and Accounts, Travel Card.

Expected: a payee that does not fit beside its amount wraps between words; a row whose payee fitted keeps its frames.

| Row | Before (`f1a52c11`) | After |
| --- | --- | --- |
| iPhone SE, `extra-extra-extra-large`, FairPrice Finest | payee `[32, 176, 144, 28]`, "FairPrice Fin...", row 80 high | `[32, 176, 96, 56]`, "FairPrice / Finest", row 108 high |
| iPhone SE, `extra-extra-extra-large`, Bus and MRT top-up | 154 x 28, "Bus and MRT...", row 54 high | 142 x 56, "Bus and MRT / top-up", row 82 high |
| iPhone SE, `extra-extra-extra-large`, Singapore Airlines | `[32, 376, 124, 28]`, row 104 high | `[32, 376, 112, 56]`, row 132 high |
| iPhone SE, `extra-extra-large`, Bus and MRT top-up | 167 x 26, "Bus and MRT to...", row 49 high | 131 x 52, row 75 high |
| iPhone SE, `extra-extra-large`, Singapore Airlines | 138 x 26, row 94 high | 102 x 52, row 120 high |
| Book pose, landscape, `extra-extra-extra-large`, Singapore Airlines | `[528, 444, 103, 28]`, "Singapo...", row `[528, 444, 247, 104]` | `[528, 444, 108, 57]`, "Singapore / Airlines", row 133 high; the amount is on one line at the same x and width |
| Closed Duo, portrait, `extra-extra-extra-large`, Singapore Airlines | `[32, 388, 123, 28]` | `[32, 388, 112, 57]` |

No other row changed its x, width or height in any of these captures: Uniqlo and MUJI in the book pose, and every row of All and Travel Card whose payee fitted. On the iPhone SE at `extra-extra-large`, FairPrice Finest fits and is unchanged.

Default size, `f1a52c11` against the fixed build, three screens of All and two of Travel Card on each of the closed Duo, the iPhone 18 Pro and the iPhone SE: no element differs in x, width or height. Where y differs it is by one offset for the whole capture (a scroll position up to 17pt apart).

Unevenness: a wrapped payee makes its row 26 to 29pt taller. Rows already differ by that much when they have a memo (54, 80 and 104pt at `extra-extra-extra-large`), so the list does not look more ragged than it did.

Not fixed: the detail line under the payee still truncates ("Groceries · Join...").

### Tests

`SIMULATOR_UDID=<iPhone 18 Pro> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` at `4baf7122`, simulator at the default text size, light, the app terminated first, and both `com.apple.Accessibility` settings written immediately before the run. One run was made:

- `runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-19 02:37:46 +0000)`
- `Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 185.293 (185.648) seconds`

### Not checked

- The iPhone simulators in landscape (`axe rotate` does not turn them), so 2DU-10 on an iPhone on its side.
- iPad, including the iPad mini's narrow window where 2PD-18 was found.
- The inner display in portrait (669 x 951), in any pose.
- Dark, except the closed display in landscape at the largest size (2DU-10).
- 2DU-10 and 2DU-11 at `2258ef81`.
- The four other screens pushed from a Conversation (2DU-09), and "No recent transactions" (2DU-11).
- The four commits were not built one at a time; only the head with all four was built and tested.

Seen and not explained: the back button's accessibility label is "Back" in some captures and "Accounts" in others, with the same frame on each device whichever it reads (`[16, 62, 44, 44]` on the iPhone 18 Pro). On the iPhone SE it is "Back" in every capture of both builds. On the iPhone 18 Pro at the default size it is "Back" in one `f1a52c11` capture (New) and in six of the eight captures of the fixed build, and "Accounts" in three fresh launches of the head build afterwards (All twice, Spare Pot once). It varies on both builds, and none of the four commits touches a navigation title.
