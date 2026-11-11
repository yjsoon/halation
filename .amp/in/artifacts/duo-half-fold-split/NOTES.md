# iPhone Duo partial fold: Accounts split lands on the hinge

Base: `origin/main` `6e3314fe`. Change: the Accounts overview column in `AccountsView` may grow to 520pt (was 420pt). Ideal width stays 340pt.

Environment: Amp Mac satellite (mac.large, macos-27 image), Xcode 27.3 (27C5020n), iOS 27.3 simulators "HowMuch Duo" (iPhone Duo), "HowMuch iPad" (iPad Pro 11-inch M5) and "HowMuch Tests" (iPhone 18 Pro). Poses set with Device Hub's closed, partially folded and fully open buttons and its rotate button. Synthetic data only: the `control-howmuch` verify stack (plan `HowMuch Demo`: Everyday Account, Rainy Day Saver, Travel Card), API forwarded to Mac port 49411, signed in as `verifier`.

## Finding before the change

Partially folded in landscape (book pose, fold vertical), the split already showed accounts on the left and the register on the right, but the accounts column stopped about 55pt short of the hinge, so the start of every register row sat in the crease (`before-half-land.png`). Apple's guidance is that a split view goes to an even 50/50 at the fold; ours could not, because half the inner display (about 476pt) is wider than the 420pt column cap.

## Captures after the change

| Capture | Expected | Observed |
|---|---|---|
| `after-half-land.png` | Partially folded, landscape: accounts fill the left half, register starts right of the hinge | As expected |
| `after-half-dark.png` | Same in dark appearance | As expected |
| `after-open-flat.png` | Fully open: sidebar back at its narrower ideal width, as Notes does | As expected |
| `after-refold.png` | Fold again: back to the 50/50 split | As expected |
| `after-half-port.png` | Partially folded, portrait (fold horizontal): register only, sidebar button | Same as before the change |
| `after-half-port-overlay.png` | Sidebar button opens the accounts overlay at its usual width | Same as before the change |
| `ipad-land-light.png`, `ipad-land-dark.png` | iPad landscape: three columns, accounts column at its usual width | As expected |
| `closed-outer.png` | Closed (outer display, compact): Accounts overview with vertical bar; this path does not use the split, captured before the change | As expected |

Also exercised on the Duo before the change, unaffected by it: selection on the outer display carries into the folded split; picking an account in the portrait overlay and rotating to landscape brings the accounts column back; rotating landscape → portrait → landscape restores the column.

## Tests

`SIMULATOR_UDID=<HowMuch Tests> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`: fresh build-for-testing exit 0 ("products match this worktree"), **825 tests, 1 skipped, 0 failures**.

## Not covered

Physical iPhone Duo. Hinge angles other than Device Hub's single partially folded preset. The tabletop pose (landscape with a horizontal fold) beyond the portrait-orientation capture. Split View multitasking on the inner display. Right-swipe Clear on the folded split was not re-driven; `RegisterView` is unchanged.
