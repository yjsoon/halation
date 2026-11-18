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
