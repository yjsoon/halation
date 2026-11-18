# iOS UI hillclimb round 1: lead fixes

Thread: https://ampcode.com/threads/T-01a1ef1e-bc1f-716a-a86e-c1f679fe24bb. The principles, scores per round, findings and proposals are in that thread's artifact "iOS UI hillclimb". The workers' records are beside this one in `../ip-fixes/` and `../pd-fixes/`; they name the commits on the workers' own branches, which were applied here unchanged under new hashes.

## Revision

- Base: `2258ef81` (`origin/main` when the audit ran). Branch `ios-ui-hillclimb`, one commit per fix, each with `Finding:` trailers.
- Lead commits: `e67a1b31` (IP-01, DU-03), `cb098943` (LEAD-04), `d8ebe122` (LEAD-01, IP-10), `958a0d5e` (LEAD-03, PD-02).

## Setup

- Amp Mac satellite, `mac.large`, image `macos-27`, Xcode 27.3. Simulators on iOS 27.3: iPhone 18 Pro and iPad Pro 13-inch (M5), accessibility enabled as in `apps/ios/AGENTS.md`. The iPad fault was also reproduced on an iPad Pro 13-inch (M5) simulator on iOS 27.2.
- Disposable verify stack on the orb, seeded with `../kit/seed-audit.ts` (see `../kit/KIT.md`), its API port forwarded to the Mac. Synthetic data only. `../kit/signin.sh` signs a fresh install in; `../kit/ui.sh <udid>` prints element frames in points.
- Build with `SIMULATOR_UDID=<udid> scripts/ios-xcodebuild.sh build`, install with `xcrun simctl install`. Taps with `axe`. iPads are rotated from Xcode's Device Hub (Controls > Rotate Left or Right).
- Screenshots are not in git. They are shown in the thread and its artifact.

## IP-01 and LEAD-04: Reconcile

- Steps: iPhone 18 Pro, light, default size. Accounts, Platinum Cashback Card, Reconcile. Type the projected balance, which is negative, with `printf '%s' '-1913.16' | axe type --stdin --udid <udid>`. Confirm.
- Expected: the review lists the balances and candidates, a negative balance can be typed, Difference reaches $0.00 and Confirm reconciles.
- Before, at `2258ef81`: the review read "Could not decode API data: The data couldn't be read because it is missing." The API response itself was correct (`candidate_transaction_ids` present); the decoder's snake-case conversion looked for `candidateTransactionIds` and the property was `candidateTransactionIDs`. With that fixed, the balance field showed the decimal pad, which has no minus key.
- After: the review loads, Difference reads $0.00 and Confirm returns to the register with "Last reconciled: Today". The API then lists 7 reconciled rows for the account, summing to -708500 milliunits, and the preview has no candidates left.

## LEAD-01 and IP-10: long account name in the register title

- Steps: iPhone 18 Pro, light, default size and `extra-extra-extra-large`. Accounts, Platinum Cashback Card.
- Expected: the title sits between Back and Search and truncates.
- Before: the title was laid out from x 47 to 295; Back covers x 16 to 60 and Search starts at 286.
- After: the title spans x 75 to 265 and reads "Platinum Cashb…". At `extra-extra-extra-large` it spans 74 to 253 with Search at 274. A tap opens Edit Account. Travel Card's title and the iPad title are unchanged.

## LEAD-03 and PD-02: iPad portrait top tabs

- Steps: iPad Pro 13-inch, portrait. Launch, hide the tab sidebar (the button at the top of the sidebar), read the frames of the two columns' bars, show the sidebar again, three times over. Repeat in landscape.
- Expected: with the tabs at the top (y 36 to 72), both columns' bars sit under them.
- Before, portrait: bars at y 42 to 96 after hiding, so the tabs (x 263 to 769) covered the register title (x 618 to 752), Hide Sidebar (x 290 to 326) and part of More. Rotating to landscape and back put the bars at y 86. Landscape alone was right: y 86 hidden, y 32 shown.
- Ruled out: the `GeometryReader` around the split view (same fault without it); rebuilding the split view when the placement changes (same fault); a fixed 44pt top inset (right at first, but doubled to y 130 once the system corrected itself).
- After, portrait, three cycles: "hidden" y 86 each time, bars 54pt high. In portrait the sidebar is an overlay, and with it shown the bars stay at y 86, as they do without the fix after a rotation. A tap on the title opens Edit Account; Hide Sidebar leaves the register's bar at y 86 and Show Sidebar brings the column back. Landscape, three cycles: y 86 hidden and y 32 shown, as before.
- Not checked by the lead: iPad mini, a resized window, accessibility sizes.

## Tests

`SIMULATOR_UDID=<iPhone 18 Pro> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`:

- at `d8ebe122` (the first three lead commits): "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 186.734 (187.099) seconds".
- at `958a0d5e` (lead, iPad and iPhone fixes together): "runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 17:47:04 +0000)" and "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 183.529 (183.889) seconds".

## Checks after the iPad review

GPT-6 Astra reviewed the source only, because its Mac would not start. The lead ran its open points at `79e3f937` on the iPad Pro 13-inch and the iPad mini (A20 Pro), iOS 27.3, and made two corrections.

- Top tabs (`958a0d5e`, corrected by `0440ddf3`): the timed step is one task, cancelled when the tabs move again. Steps: portrait, hide and show the tab sidebar three times, then hide, show, hide with 250ms between taps. Observed: both bars at y 86 each time hidden, on the Pro (three cycles) and the mini (two cycles; the script's first tap came before the app was ready). iPad mini landscape: y 86 hidden, y 32 shown.
- Stacked register rows (`c84540bc`, corrected by `414e6de7`): at `accessibility-extra-extra-extra-large` on the Pro, a tap at (875, 480), in the space right of the payee of the first row, did nothing. With the content shape after the expanding frame, a tap in the same space (875, 485) opens the Transaction sheet. At the default size a tap at (700, 343), between payee and amount, opens it as before.
- Amount scroll (`8fae6a74`): on the Pro at the largest size, Add Transaction opens with the amount at y 504. After a manual scroll it was at y 80; after rotating to landscape and back it was at y 79. The sheet's height does not change on iPad, so the form does not move.
- Reconcile for a cash account (`e67a1b31`, `cb098943`): Everyday Account, statement balance 189892.45. The review read Projected balance +$189,892.45, Cleared candidates 11, Difference $0.00. After the confirmation switch (flipped with `axe touch --down --up`, since `axe tap` does not flip it) and Confirm, the register header read "Last reconciled: Today".
- Skies (`a64187d1`): Travel Card in portrait with the tabs on top and with the sidebar shown, Travel Card in landscape and Rewards in portrait show no sky under the Accounts column or the sidebar.

Tests, same command:

- at `79e3f937` (all four authors' fixes): "runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 18:37:39 +0000)" and "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 196.917 (197.289) seconds".
- at `414e6de7` (with the two corrections): "runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 18:56:11 +0000)" and "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 182.256 (182.609) seconds".

## After the reviews: corrections folded in

The reviewers' corrections were folded into the commits they correct (`git rebase --autosquash`), so every hash named above and in the workers' records is from before that and no longer exists on the branch. Find a commit by its subject or its `Finding:` trailer. Three tap-target commits were dropped (follow-up chips, report filter chips and month arrows): taps on the `2258ef81` build showed those controls already took taps over 44pt or more, and the commits only added height.

- LEAD-05, month between the Spending Breakdown arrows ("iOS: keep the month between the stepper's arrows whole at large sizes"). Steps: iPhone SE, Insights, Month to Date, text size `accessibility-extra-extra-extra-large`. Before: the label read "No- / vember / 2026". After: "November / 2026", frame [86, 403, 203, 104], between Back [24, 428, 54, 54] and Forward [297, 428, 54, 54]. At the default size on the iPhone 18 Pro the frames are the same before and after: label [143, 202, 115, 18], Back [24, 198, 28, 28], Forward [350, 198, 28, 28].
- R-D8, word suggestions on the Reconcile balance keyboard: autocorrection is off on the field. Not seen running, because the simulator showed no software keyboard.
- Combined head on the iPhone SE at `accessibility-extra-extra-extra-large`, Spending Breakdown: the filter chips sit inside the screen (x 16 to 336), the summary reads one figure per line ("Largest Line" [32, 32, 224, 52], "Avg Transaction" 291pt wide, "Transactions" 232pt wide), and the group heading reads "Home" [20, w 132], "$2,650.95" on one line and "57%" at x 270 to 354.

Tests, same command, iPhone 18 Pro at the default size, with all four authors' fixes and corrections (45 commits on `2258ef81`):

- First run: "Executed 822 tests, with 1 test skipped and 9 failures (0 unexpected)". Four `CaptureSnapshotTests` cases failed with an empty accessibility tree (`testAddAndEditTransactionFormRowsShareHeightAndOrder`, `testAddManuallySavesOnceAndCancelPreservesConversation`, `testAddTransactionDatePickerDoesNotResizeSheet`, `testAddTransactionMemoFocusHidesCalculatorKeypad`). The app was still open on the simulator from the manual checks. The cause was not established.
- Second run, same build products, after terminating the app: "runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 21:39:02 +0000)" and "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 182.506 (182.857) seconds".
- Third run, same build products, app terminated first: "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 179.381 (179.741) seconds".
