# iPad and iPhone Duo size-class gate: consolidation E2E

Revision tested: `b19db20deecc9abd64c6da52bcd67b41432c08c4` (branch `halation-build-19`). It contains the recovered Duo work (`d6c5cf8a`, unchanged from the Duo thread's uncommitted patch on `duo-size-class-gate`), the `claude/project-thread-1r6208` capture prompt merge (`717ead4a`) and the build 19 bump. Base `origin/main` `acafc601`.

Environment: Amp Mac satellite, macOS 27 image, Xcode 27.2 (27B48). All data is synthetic: the isolated `control-howmuch` verify stack (plan `HowMuch Demo`, accounts Everyday Account, Rainy Day Saver, Travel Card) plus 40 fake Everyday transactions posted through `POST /v1/plans/local-plan/transactions` so the register is long. The orb API port was forwarded to Mac port 49411 and the app signed in at `http://127.0.0.1:49411` as `verifier`.

## Unit and snapshot suite

```sh
U=<iPhone 17 Pro, iOS 26.5>
xcrun simctl spawn "$U" defaults write com.apple.Accessibility AccessibilityEnabled -bool true
xcrun simctl spawn "$U" defaults write com.apple.Accessibility ApplicationAccessibilityEnabled -bool true
SIMULATOR_UDID=$U scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests
```

Observed: build-for-testing exit 0 (fresh, products match this worktree), **826 tests, 1 skipped (opt-in live model test), 0 failures**, TEST EXECUTE SUCCEEDED. Swift Testing 3/3. `RewardsSnapshotTests.testCategoryDetailFitsContentAndScrollsOnlyWhenNecessary` (the "21.00" OCR case that failed in the Duo thread's last run) passed. Summary in `suite-summary.txt`.

## iPad Pro 13-inch (M5), iOS 26.5

Steps: install the Debug build, Connect to a server, sign in, Save, open Everyday Account.

| Capture | Expected | Observed |
|---|---|---|
| `ipad/ipad-portrait-register-top.png` | Split Accounts with register as one rounded card; "Scheduled" on one line | As expected |
| `ipad/ipad-portrait-register-dark.png` | Same in dark appearance, readable | As expected |
| `ipad/ipad-landscape.png` | Three columns (sidebar, Accounts, register) | As expected |
| `ipad/ipad-landscape-scrolled9.png` | Long register scrolls; card edges intact mid-list | As expected |
| `ipad/ipad-landscape-end.png` | End of register; bottom corners rounded, last row clipped | As expected |
| `ipad/before-ipad-hidden.png` | Control: unpatched `origin/main` build | Shows "Sched-uled" wrap, and the floating tab bar over the title when the sidebar is hidden |

The floating tab bar overlapping the register title in portrait with the sidebar hidden is present on unpatched `main` too, so it is pre-existing and not changed here.

## iPhone Duo, iOS 27.2 (Device Hub, Xcode 27.2-RC)

New simulator "Duo Consolidation"; poses switched with Device Hub's pose buttons.

| Capture | Expected | Observed |
|---|---|---|
| `duo/duo-open-accounts.png` | Open pose uses the split layout | As expected |
| `duo/duo-open-travel.png` | Travel Card selected in split | As expected |
| `duo/duo-closed-travel.png` | Folded: compact layout keeps Travel Card | As expected |
| `duo/duo-reopen-travel.png` | Unfolded again: Travel Card still selected | Byte-identical to `duo-open-travel.png` (MD5 `31ede246…`) |

Black frame on unfold (open question from the Duo thread): `ffmpeg blackdetect` on the app-content crop at 10 fps found 0 black frames in `duo-unfold.mov`. Strips at 4 fps from the full window show the simulator draws a black device during the pose animation for every app: `ctrl-settings-unfold-strip.png` (Apple Settings), `before-unfold-strip.png` (unpatched main build) and `after-unfold2-strip.png` (this build) all contain black transition frames. It is a simulator pose-animation artefact, not a regression in this change.

## Not covered

Physical devices, partial hinge angles, Dynamic Type accessibility sizes in the split column, and the Fable assessment's later steps (floating Assistant button, toolbar labels, sheet sizing), which were never in this scope.

## Review fix: auto-selected pane (commit `13b9ca92`)

The Opus 5.5 high review of `5825771` raised one Required finding: the split's automatic default register was saved like a tapped pane, so a fold or narrow iPad window pushed a register nobody opened.

- Red first: new `IPadLayoutTests.testAutoSelectedPaneDoesNotSurviveSidebarToCompactFlip` failed on `5825771` (`pane-fix/red-before-fix.txt`).
- After the fix: `IPadLayoutTests` 21/21 passed, then the full suite at `13b9ca92`: **827 tests, 1 skipped, 0 failures**, fresh build-for-testing (`pane-fix/suite-summary-fix.txt`).
- Duo, same synthetic stack and "Duo Consolidation" simulator: open pose auto-selects Everyday (`fix-open-auto.png`); fold shows the Accounts overview, not a register (`fix-closed-after-auto.png`); tapping Travel Card, folding and unfolding keeps Travel Card (`fix-open-travel.png`, `fix-closed-travel.png`, `fix-reopen-travel.png`; open and reopen MD5 identical).
