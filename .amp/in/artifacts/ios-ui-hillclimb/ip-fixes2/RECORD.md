# Round 1 follow-up fixes (Opus 5.5): text record

- Base: `hc-r1c` at `7c421f52`. Branch `ios-ui-hillclimb-ip2`, head `173d10fb`, not pushed.
- Builds compared: `2258ef81` (seb), `7c421f52` (sepre, p18pre) and the head (se, p18).
- Setup: Amp Mac satellite (macos-27, mac.large), Xcode 27.3, iOS 27.3 simulators: iPhone 18 Pro and iPhone SE (3rd generation). Disposable verify stack on the orb, API port 36651 forwarded to the Mac, synthetic seed from `seed-audit.ts`. Simulators driven with `axe`, and rotated through Device Hub (Controls > Rotate Left or Right).
- Sizes: default (`large`), xxxl (`extra-extra-extra-large`) and ax5 (`accessibility-extra-extra-extra-large`). Frames are in points from `axe describe-ui`.

## R-O4 Spending Breakdown summary (`971a0b7a`)

- **Steps:** Insights, then Month to Date, which opens Spending Breakdown. Read the three summary columns.
- **Before** (SE ax5, the same at `2258ef81` and `7c421f52`):
  - The titles break mid-word: "Large-st Line", "Avg Trans-action" and "Trans-actions".
  - The values are cut to "Utili…" and "$23…".
  - Frames: Largest Line [8, 624, 104, 154] and Transactions [252, 624, 118, 154].
- **After:**
  - SE ax5: one figure per line, and every word is whole. Largest Line [6, 170, 224, 52] with Utilities under it, Avg Transaction with $233.90, then Transactions with 20.
  - SE xxxl: two by two.
  - SE and 18 Pro at the default size: pixel-identical to `7c421f52` (0 differing pixels below the status bar).
- **Note:** the column starts at x 6 because the whole report is wider than the screen at ax5 (R-A4, the date chip), not because of this change.

## R-O5 Register Scheduled band (`fea8f913`)

- **Steps:** Accounts, then Platinum Cashback Card. Read the collapsed Scheduled band.
- **Before** (SE ax5, the same at `2258ef81`): "Sched-uled" over two lines, frame [76, 425, 162, 116], with the band 140pt high.
- **After:** "Scheduled" on one line, frame [76, 428, 211, 52], with the band 82pt high.
- **Default size:** unchanged on the SE and the 18 Pro (0 differing pixels).

## R-O6 Empty register (`993f2145`)

- **Steps:** Accounts, then Home Loan, which has no transactions.
- **Before** (SE ax5, the same at `2258ef81`): "No Transactio…", title frame [36, 271, 304, 238].
- **After:** "No / Transactions", whole and shrunk a little, title frame [32, 274, 310, 230].
- **Default size:** the scale applies only at accessibility sizes. An unconditional scale moved the 18 Pro default title by 1pt (frame [131, 240, 140, 79] against [125, 239, 153, 81]), so it was made conditional. The final head matches `7c421f52` exactly.

## Working line, fixup of IP-04 (`1a4a2832`)

- **Steps:** Platinum Cashback Card register, plain header.
- **Before** (SE ax5, the same at `2258ef81`): "Working -" / "$1,089.51 including posted scheduled". The minus ends the first line.
- **After:** "Working" / "-$1,089.51" / "including posted" / "scheduled".
- **Fix:** a word joiner follows the minus. The sunrise header's Working line uses the same string and gets the same fix; that one was not seen in the simulator.
- **Default size:** unchanged (0 differing pixels).

## Query card date, fixup of IP-15 (`173d10fb`)

- **Steps:** this view needs an AI model in the app, so it was rendered with the existing snapshot test `CaptureSnapshotTests/testDescribeManualAndImageStatesRenderIsolatedContent`, case "query", and its xcresult attachment was exported.
- **Before** (`2258ef81` source): "2026-09-01 – 2026-09-06 · Everyday · Dining".
- **After:** "Tue 1 Sep 2026 – Sun 6 Sep 2026 · Everyday · Dining".

## Gap: IP-09 and DU-06 in landscape (18 Pro, light, default)

- **Landscape keypad:** with the keypad up, the amount sits at [326, 90, 222, 48] and the keypad starts at y 148 (key 7). A typed "-$1,234.56" is fully visible.
- **Hand scroll in landscape:** scrolling the form by hand with the keypad up leaves the Flag row in view, and the form stays where it was left.
- **Rotation after a hand scroll:**
  - Portrait, hand-scrolled so the amount sits at y −25, then rotated to landscape: the form scrolls the amount back into view (y 90).
  - Landscape, hand-scrolled, then rotated to portrait: the form returns to the top (amount at y 206).
- **Conclusion:** rotation discards a hand-scrolled position. This is what `8fae6a74` does by design, because it scrolls whenever the form's height changes while the keypad is up.

## Gap: `414e6de7` (SE, light, ax5)

- **Steps:** Platinum Cashback Card register, stacked Guardian row [32, 372, 271, 182].
- **Blank taps:** a tap at (276, 408), right of the payee, opens the Transaction sheet for Guardian, -$21.45. So does a tap at (200, 474), right of the category.
- **Status control** [307, 440, 44, 44]: a tap shows "Marked transaction cleared", and the label becomes "Mark Guardian uncleared". A second tap restores "Mark Guardian cleared".

## Tests

`scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` at head `173d10fb`, on the iPhone 18 Pro simulator at the default size:

- "runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 21:30:11 +0000)"
- "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected)"
