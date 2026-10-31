# Rewards iOS: Skyline rows

- Revision: `7ceb5e3` (branch `claude/project-thread-ubyyr9`), checked out clean on a Devin macOS runner. No commits or pushes from the runner.
- Data: local mode seeded with invented cards and transactions (Harbour Nine 1313, Meridian Quay 7707, Nimbus Pier 4242, Ember Vault 6555, Lantern Loft 9090, Gate Eighty 8787). No production or personal data.

## Commands and results

| Command | Result |
| --- | --- |
| `scripts/ios-xcodebuild.sh build` | clean compile |
| `scripts/ios-xcodebuild.sh test` with `-only-testing` RewardsReportTests and RewardExposureTests | 25/25 pass, including the board snapshot tests |
| `scripts/ios-xcodebuild.sh test` (full suite) | 816 executed, 1 skipped; 3 failing cases, all in `CaptureSessionTests` (rename tests at :415/:417, :481, :540). They fail identically on `main` at `4ae5f37`, so they are not from this branch. |

## Screenshots (half size, JPEG)

- `final-iphone-closed-{light,dark}.jpg`: iPhone 17 Pro, board closed; sky behind the large title, rows sized by urgency.
- `final-iphone-open-{light,dark}.jpg`: Gate Eighty 8787 open in place (Period rail, Targets, Categories) on the `#EBEBE6` / `#32312A` open surface.
- `final-iphone-capped-light.jpg`: Ember Vault 6555 open, bonus cap reached.
- `final-iphone-open-ax3.jpg`: Gate Eighty open at accessibility size AX3; "Minimum $300.00" stacks rather than breaking mid-number.
- `final-ipad13-{closed,open}-{light,dark}.jpg`: iPad Pro 13 landscape, window on the left and figures on the right; open card with three columns.
- `final-ipad11-open-light.jpg`: iPad 11 portrait, open card.

## Known nits (not fixed here)

- iPad: the floating + button covers the last category's rate when scrolled to the bottom.
- AX3: "View Transactions" hyphenates, and some secondary lines truncate with an ellipsis.

## After merging main (the Sun Arc card)

- Revisions: `dab390c` (merge) and `3992624` (merge review fixes), on the Devin macOS runner, same invented data.
- `dab390c`: clean build; RewardsReportTests and RewardExposureTests 25/25, RewardDraftPeriodTests 3/3; full suite 816 executed, 1 skipped, the same 3 `CaptureSessionTests` failures as `main`. Both board OCR tests pass with the Plex figures.
- `3992624`: clean build; the same targeted tests 25/25 and 3/3, both OCR board tests pass. The full suite was not rerun on this revision (the change from `dab390c` is three Smart Invert modifiers, a test regex and docs).
- `merge-*.jpg`: iPhone board closed (light, dark), Gate Eighty open, the Sun Arc detail sheet through Show Details, the register row, AX3 open; iPad Pro 13 open (light, dark) and with Smart Invert on, where the window rows' names stay readable on the inverted art.
- Main's bottom room clears the floating + button: Dining's rate is no longer covered on iPhone or iPad.
- Still open: at AX3 "View Transactions" breaks as "Transaction / s", and some secondary figures truncate.
