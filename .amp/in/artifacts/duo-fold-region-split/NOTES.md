# iPhone Duo book fold: Accounts split follows the reported fold

Base: `origin/main` `2dfc70b6`. Supersedes the fixed 520pt cap from `1eb5ca19` (`duo-half-fold-split/`).

## Why the cap did not work on the phone

On the owner's physical iPhone Duo (TestFlight build 27, cut from `6e3314fe`, which predates `1eb5ca19`), the accounts column ended at about 341pt in a 951pt-wide landscape window: the 340pt ideal width, not build 27's 420pt cap. The phone never widened the column toward the fold, whereas the simulator stretched it to its cap. A larger cap therefore cannot be relied on.

Apple documents the fold as a `.division` reserved region (`GeometryProxy.reservedRegions(kind: .division)`, iOS 27.1). It is active only while the device is partly folded, and its frame includes margins that keep content clear of the crease ([ReservedRegion](https://developer.apple.com/documentation/swiftui/reservedregion), [Preparing your app for iPhone Duo](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo)). Apple's split example sizes the first pane to `frame.minX`, leaves `frame.width` clear and starts the second pane at `frame.maxX`.

## Change

`AccountsView` reads the division region around the split. With a vertical fold (book pose), the accounts column is exactly `fold.minX` wide and the register's leading safe area is padded by `fold.width`. Otherwise (fully open, tabletop pose, iPad, older iOS) the column uses min 280, ideal 340 and max 420 as before `1eb5ca19`. The API is guarded by `canImport(SwiftUICore, _version: 8.0.85)` (the iOS 27.1 SDK); a scratch typecheck confirmed that Xcode 26.6 and 27.0 compile the fallback and Xcode 27.1 and 27.3 use the API.

## Simulator evidence

Amp Mac satellite (mac.medium, macos-27), Xcode 27.3 beta, "HowMuch Duo" (iPhone Duo, iOS 27.3), poses from Device Hub's partially folded preset. Synthetic `control-howmuch` stack (plan `HowMuch Demo`), signed in as `verifier`. A temporary on-screen readout (removed before these captures) showed the division at `(455.5, 0, 40, 669)` in the split's coordinates (867pt wide), with margins of 20pt on each side. It was inactive when the device was fully open and active when partly folded.

| Capture | Expected | Observed |
|---|---|---|
| `after-half-land.png` | Book fold: accounts end at the fold margin, register starts beyond it | As expected |
| `after-half-dark.png` | Same, dark appearance | As expected |
| `after-open-flat.png` | Fully open: 340pt column, no gap | As expected |
| `after-refold.png` | Fold again: back to the fold split | As expected |
| `half-land-sidebar-hidden.png` | Sidebar hidden while folded: register full width, no leading gap | As expected |
| `half-port.png`, `half-port-overlay.png` | Tabletop pose (horizontal fold): register only, overlay at its usual width | Unchanged |
| `half-land-after-rotate.png` | Rotate back to the book pose: split at the fold | As expected |
| `ipad-land.png` | iPad Pro 11-inch, iPadOS 26.5: three columns at the usual width | Unchanged |

Trade-off: the register loses the fold's 40pt when folded, so a long payee next to a large amount truncates ("Tinkermind Pa..." beside +$4,850.00).

## Checks

- Orb: `bun test` 809 pass, 0 fail; web and worker `tsc --noEmit` clean.
- Mac: `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on iPhone 18 Pro (iOS 27.3), fresh build ("products match this worktree"): 825 tests, 1 skipped, 1 failure. The failure, `RewardsSnapshotTests.testCategoryDetailFitsContentAndScrollsOnlyWhenNecessary` (RewardsReportTests.swift:653, OCR never finds "21.00"), also fails alone on unchanged `origin/main` `2dfc70b6`, so it is not caused by this change.

## Not covered

Physical iPhone Duo; hinge angles other than the simulator's one preset; right-to-left layout (region frames are mirrored by default, so `minX` stays the leading edge).
