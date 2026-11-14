# Register masthead: seam right of the sun

- **Report (YJ, 14 Nov 2026, TestFlight build 29 from 174a2bcf):** a horizontal line runs from the sun to the right edge of the register header on card accounts with rewards. It looks like a shaded box behind the reconcile caption, with a hard edge just above the green horizon.
- **Revision:** 174a2bcf plus the fix in `apps/ios/HowMuch/Views/RewardSkyline.swift`.

## Cause

- While the minimum is unmet (the gate), `RegisterMastheadSky` overlays the strip's own picture, lit to the sun and unlit beyond it. A vertical mask limits the overlay to a band. The spec gives that band as "from 56pt above the horizon to 6pt above the words".
- The mask takes its lower end from `groundWordsTop`. That value is measured after `.padding(.top, RegisterMasthead.band)`, so it is the top of the 34pt sky band, not the words. It sits level with `skyWordsBottom`.
- The mask's stops were therefore `[sky − 56, sky, sky − 16, sky − 6]`. They run out of order, so the overlay stopped dead at `sky`, the bottom of the balance line. That is 2pt above the horizon at the right edge and 14pt at the left.
- Right of the sun, the overlay's unlit sky (warm grey) ended in a flat 1px edge. The masthead's lit blue showed between that edge and the sloping crest. Left of the sun both layers are lit alike, so no edge showed there.
- The mis-measure dates from the masthead's first landing (52d8e601).

## Fix

- `edgeBand` now ends the band `RegisterMasthead.band` below `ground`, which is where the words are. The overlay covers the horizon and fades out 16 to 6pt above the words, as the spec says.
- `groundWordsTop` itself is unchanged. The masthead's ridges also read it, through the layouts' `footTop`, and changing it would move the approved ground (the two crests about 4pt apart).

## Setup

- **Stack:** `control-howmuch launch` (`fixtures/demo-ledger.json`), owner `verifier`.
- **Rewards:** `fixtures/rewards-tracker-export.json` with an $800 minimum and flag categories off, imported through `/api/import/rewards-tracker`. The met variant uses a $300 minimum.
- **Transactions:** seven invented November spends on Travel Card (`acct-credit`), totalling $400. Two are reconciled, so the caption reads `Reconciled Mon 2 Nov 2026` as on the report.
- **Data:** every value is invented.

## How it was driven

- **Simulator:** iPhone 17, iOS 26.5, on an Amp Mac satellite. The stack port was forwarded to the Mac.
- **Host:** a temporary XCTest class, `MastheadSeamHarness`, mounted the real `RegisterView` in a `NavigationStack` against the stack. It was removed before the test run below. It switched appearance, account and scroll offset on command, and the shell captured each state with `xcrun simctl io screenshot`.
- **Before:** captured on 174a2bcf with only the harness added. **After:** captured with the fix applied.

| Check | Expected | Observed |
| --- | --- | --- |
| Gate, light, at rest | No hard edge between the sun and the right edge. Unlit sky runs down to the crest | Before: a flat edge, with a blue sliver under it. Pixel column x=1100 (3x) stepped at rows 492 to 494 above the crest at 500. After: no step before the crest (`before-light.png`, `after-light.png`) |
| Gate, dark, at rest | Same | Before: the same flat cut-off. After: the sky reaches the crest. The ground right of the sun now carries the strip's dusk and fades out above the words, as the spec's band describes (`before-dark.png`, `after-dark.png`) |
| Gate, scrolled 30pt and pulled down 60pt | No seam while the header moves | Smooth (`gate-states.png`) |
| Met card ($300 minimum) | No overlay, unchanged | Unchanged (`others.png`) |
| Everyday Account and Rainy Day Saver (no reward card) | Plain header, no sky | As expected (`everyday.png`, `others.png`) |
| Accessibility labels, gate | `-$65,230.80`, `Last reconciled: Mon 2 Nov 2026`, `Rewards, Travel Card` | As expected |

## Commands

- `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on the Mac, on a fresh build that matched the worktree: 825 tests, 1 skipped, 0 failures.

## Not exercised

- The shipped app on a physical phone. The fix reaches YJ's phone only with the next TestFlight build after it lands.
- iPad and accessibility text sizes. Accessibility sizes keep the paper row and have no overlay.
