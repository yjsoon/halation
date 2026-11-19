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

## Round 2: the lead's integration and checks

Commits are named by subject, since folding corrections in changes hashes. Head when this was written: `8e173f31`, 59 commits on `2258ef81`. Simulators on iOS 27.3; frames are [x, y, width, height] in points from `../kit/ui.sh`.

- Branch contents: the five round 2 Duo fixes (Fable 5.2) and five round 2 iPad fixes (GPT-6 Astra), each reviewed by the auditor that found the fault. "Stack account names before ordinary large text becomes cramped" carries GPT-6 Astra's correction for 2PD-17 (the Payments due heading is chosen by width with `ViewThatFits`).
- 2PD-08, taken off the branch. GPT-6 Astra's register title fix (reviewed as `e2a31deb`) dropped the account's icon when the whole name then fitted. On the iPhone SE at the default size it left Everyday Account and Rainy Day Saver without an icon and Joint Household Expenses Account with one and cut short; Opus 5.5 saw the same in the iPad mini's narrow window. The choice is YJ's. The commit is on the local backup branch `hc-r2c-with-title`.
- 2PD-17 on the iPhone 18 Pro, light, default size. Setup: payment terms for Travel Card and Platinum Cashback Card on the disposable stack (`PUT /v1/plans/local-plan/accounts/<id>/card_payment_terms`, statement day 1, due gap 25). Steps: Accounts. Observed: "Platinum Cashback Card" [32, 208, 176, 18] whole with "$1,659.56" [32, 230, 77, 18] under it, Schedule [279, 208, 91, 44]; Travel Card [32, 321, 81, 18] with its amount beside it. GPT-6 Astra measured the name at 150.7pt wide and cut short before the correction.
- 2PD-07, a register left blank after a cold launch. Steps: iPad Pro 13-inch, portrait, default size; terminate and launch the app; open Brokerage. Stuck state: the header caption reads "Last reconciled: …" over a blank register with no "No Transactions", unchanged 55 seconds later. Stuck in 5 of 7 cold launches on the branch and in 4 of 7 on a build of `2258ef81`. Not fixed: the cause is not traced, the branch does not touch `AppModel.swift`, and the payee defaults work has uncommitted changes there.

Tests, `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`, iPhone 18 Pro, default size, light:

- at "Record round 2 iPad verification and remaining limits" (`04e1ed88`), a newly started Mac, first run: "runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-19 01:28:49 +0000)" and "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 182.880 (183.225) seconds".
- at `8e173f31`, first run, after hand checks on the same simulator: "Executed 822 tests, with 1 test skipped and 9 failures (0 unexpected) in 173.745 (174.096) seconds". The same four `CaptureSnapshotTests` cases as in round 1, each with an empty accessibility tree.
- at `8e173f31`, four more full runs (first after a rebuild, its rerun, first after installing the app by hand, its rerun): each "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected)", in 181.059, 180.739, 180.568 and 180.639 seconds.
- at `2258ef81`, first run after a rebuild and its rerun: each "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected)", in 181.613 and 179.872 seconds.

The cause of the 9 first-run failures:

- The snapshot harness reads accessibility elements, which exist only while the simulator's application accessibility setting is on (`apps/ios/AGENTS.md`). In the failing run the test host started with it off. The simulator log shows `testmanagerd` setting "Application accessibility enabled" to 1 and back to 0 at 01:36:43, 01:36:44 and 01:38:36 UTC, during the lead's hand checks, and then the test host itself setting it to 1 at 01:39:18.505 from `accessibilityActivate()` in `SnapshotSurface.activate`, called by `testAddTransactionMemoFocusHidesCalculatorKeypad`. That is the fourth of the four failing cases. Every later case passed, and the setting stayed on, which is why reruns pass.
- Reproduced on purpose at `8e173f31`, `CaptureSnapshotTests` alone: with `defaults write com.apple.Accessibility ApplicationAccessibilityEnabled -bool false` first, "Executed 30 tests, with 9 failures (0 unexpected) in 88.626 (88.643) seconds", the same four cases, and the setting read 1 afterwards. With it set to true first: "Executed 30 tests, with 0 failures (0 unexpected) in 99.772 (99.788) seconds".
- Not established: which hand action makes `testmanagerd` switch the setting off. Opening the app by hand, `simctl install`, `axe describe-ui`, `axe tap`, and `simctl ui` appearance and text size changes each left it on when tried one at a time. Not run: `2258ef81` with the setting off.
- To keep a run clear of it, write both settings from `apps/ios/AGENTS.md` immediately before the run, not once per simulator. GPT-6 Astra did this before each of its runs and never saw the failure.

## Round 2: the three fix sets combined

Merged with `git am -3`, in this order, on "Record the round 2 integration checks and the test failure's cause": Opus 5.5's six iPhone fixes and record (2IP-01, 2IP-07, 2IP-03, 2IP-16, 2IP-20, 2IP-04), Fable 5.2's four Duo fixes and record (2DU-10, 2DU-09, 2DU-11, 2PD-18), GPT-6 Astra's six iPhone fixes and record (2IP-02, 2IP-11, 2IP-15, 2IP-10, 2IP-17, 2IP-14). No conflicts. The 2DU-10 correction was a `fixup!` and is folded into "Stack the Conversation dock's header at accessibility sizes" (`git rebase --autosquash`), which changed the hash of every commit after "Keep the Net Worth report's Assets and Debts figures whole". The tree was identical before and after the fold (`git diff` empty). Combined head: "Record round 2 phone layout verification", 78 commits on `2258ef81`, 25 round 2 fixes.

Not fixed by their authors, with reasons in the workers' records: 2IP-08 (the navigation bar gives "Approve all (2)" its full width and squeezes the title, so a `ViewThatFits` label changed nothing) and 2IP-12 (the values belong to system menu pickers).

Checks by the lead on the combined head, iPhone SE (3rd generation), iOS 27.3, light:

- 2IP-01, `accessibility-extra-extra-extra-large`. Steps: Accounts, New. Observed: "Money In" [32, 142, 168, 52], "$0.00" [32, 195, 124, 53], "Money Out" [32, 256, 202, 52], "$59.30" [32, 310, 152, 53], "Net" [32, 370, 66, 52], "-$59.30" [32, 424, 171, 53], each on one line. The bar shows Back, "Approve all (2)" [80, 20, 151, 36], Search and More, and no title (2IP-08, not fixed).
- 2PD-18, `extra-extra-extra-large`. Steps: Accounts, All. Observed: "FairPrice Finest" [32, 176, 96, 56] on two lines beside "-$128.64" [210, 218, 93, 26]; "Bus and MRT top-up" [32, 516, 142, 56] on two lines beside "-$12.00" [223, 544, 80, 26]; Toast Box, Shopee and Guardian on one line with rows 54, 80 and 54pt high.
- Seen in passing at `accessibility-extra-extra-extra-large` with payment reminders on for two cards: the Payments due band is about 2,000pt tall, so the New tile starts at y 2240. No auditor has reported it.

Tests, same command, iPhone 18 Pro, default size, light, both accessibility settings written immediately before the run, first run on a newly started Mac: "runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-19 02:58:20 +0000)" and "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 187.434 (187.801) seconds".

## Round 2: second reviews and the empty-state correction

Second reviews of the combined head "Record round 2 phone layout verification" (reviewed as `e0c3a660`), each on the reviewer's own Mac and build. Scores are 0 to 10 per screen group and principle; the bar is 8.

- iPhone Duo, GPT-6 Astra: lowest 4 as seen (group B). Leaving out the items held for YJ (2DU-04, 2DU-07, 2DU-08): lowest 6, group C only, from the sentence under the empty register's title, which still broke as "Transac- / tions" in the book and tabletop poses at `accessibility-extra-extra-extra-large`. Accepted: the Conversation dock on a short screen (2DU-10), the dock after the Account picker (2DU-09), the two-line payee (2PD-18). One new low finding, 2DU-12.
- iPad, Opus 5.5: lowest 6 as seen (groups C, F, H). Leaving out the items held for YJ: lowest 8, no group under 8. Accepted: the Payments due heading chosen by width (2PD-17) and the two-line payee (2PD-18). Five new low findings, 2PD-19 to 2PD-23.
- iPhone and iPhone SE, Fable 5.2: not reported when this was written.

The correction for 2DU-11, by Fable 5.2, merged with `git am -3` and folded into "Keep the register's empty-state titles whole at accessibility sizes" (`git rebase --autosquash`; the tree was identical before and after the fold). It changed the hash of every commit after "Keep the Conversation dock above the keyboard after a pushed screen". The worker's frames and steps are in `../du-fixes/RECORD.md`, "Fifth round". The lead did not look at this correction in a simulator; GPT-6 Astra is asked to recheck it on the Duo.

Tests on the head with the correction ("Record the empty-state description check on the iPhone Duo", 80 commits on `2258ef81`), same command, iPhone 18 Pro, default size, light, both accessibility settings written immediately before the run, first run on a newly started Mac: "runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-19 04:56:44 +0000)" and "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 184.463 (184.812) seconds".

## Round 2: the iPhone review, three corrections, and the state at the pause

Fable 5.2 reviewed the combined head "Record round 2 phone layout verification" (reviewed as `e0c3a660`) on the iPhone 18 Pro and iPhone SE: lowest score 6. Under 8 as seen: B, C, E, F, H, I. Leaving out the items held for YJ (2IP-08, 2IP-12, the sun on "Not reconciled"): B, E and H, each from one finding. It accepts eighteen fixes and the two-line register payee.

- 2IP-27 (B, P6): since "Give lifted account rows an opaque card preview" a pressed account row's wash had the card's rounded corners. Corrected by GPT-6 Astra as a `fixup!`, merged with `git am -3` and folded in with `git rebase --autosquash`. The fold conflicted twice in `accountRow` in `AccountsView.swift` (the later commit "Keep decorative account icons out of the account names" adds a line to the block the correction moves). Resolved by hand both times with `.amp/in/orb-backup/resolve-ip5b.py`; `git diff` between the pre-fold branch `hc-r2l-presquash` and the folded head is empty.
- Scheduled rows (E, P4 and P7), the other half of 2IP-19: fixed by the lead in "Let a scheduled row's payee wrap at the largest ordinary sizes". Steps: Accounts, Scheduled, light, portrait. Frames before and after, `[x, y, w, h]` in points, "Transfer to Rainy Day Saver": iPhone SE `extra-extra-large` `[32,272,138,26]` to `[32,272,108,78]`, row 91 to 143pt; iPhone SE `extra-extra-extra-large` `[32,286,129,28]` to `[32,286,117,86]`, row 122 to 180pt; iPhone 18 Pro rows 91 to 143pt and 122 to 180pt. At `large` the before and after frame files have 0 differing lines on both phones. A two-line limit was tried first and still cut "Transfer to Rainy Day…" on the iPhone SE. Frame files: `r2k/keep8/`.
- 2IP-28 (H): Send partly behind the keyboard on the iPhone 18 Pro in landscape at the largest size. With Fable 5.2 (thread T-01a1ef35-634a-764f-918d-22a8c9323652) as a `fixup!` of "Stack the Conversation dock's header at accessibility sizes"; not delivered when this was written. Expected file: `.amp/in/orb-backup/patches-du6.tgz` in that thread.

The lead's check of the 2IP-27 correction, iPhone SE (3rd generation), iOS 27.3, light, `large`. Steps: Accounts, scroll the Cash card into view, touch down on a row's centre with `axe touch --down`, screenshot 0.12s later, touch up. Observed: Everyday Account (first row) has the wash with the card's top corners rounded and a square bottom edge; Joint Household Expenses Account (middle) has a square wash across the card's width; Wallet (last) has a square top edge and the card's bottom corners. Held until the menu opened: each lifted preview is opaque and rounded with its name and balance whole; Wallet's preview is about 183pt wide and Joint Household Expenses Account's 343pt.

Tests on "Record pressed account row corner verification" (83 commits on `2258ef81`), `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`, iPhone 18 Pro, default size, light, both accessibility settings written immediately before the run, first run on a newly started Mac: "runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-19 06:14:05 +0000)" and "Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 183.207 (183.556) seconds".

The fold changed these hashes. The hillclimb artifact's text still uses the left-hand ones for these commits:

```
6cd47056 -> f15f4538  Give lifted account rows an opaque card preview
041b5388 -> f4927d89  Keep decorative form icons inside their shared column
91c1c5c2 -> 9dda5cd6  Use the ledger date format in transaction forms
d13e3eaf -> feffa65e  Record round 2 iPad verification and remaining limits
43b8f64a -> 67a928a3  Record Payments due width-based heading verification
6758b4ed -> bc43f98c  Record the round 2 integration checks and the test failure's cause
ae005984 -> c709cfc3  Stack the register totals card at accessibility sizes
6edb91c8 -> fcabaa4a  Give the selection bar's actions their own line at accessibility sizes
5ee4d2ea -> 1368ae0a  Put the Rewards report's group figures under the label at accessibility sizes
8084636a -> 478f03c8  Put the switch under the card name in Customise Board at accessibility sizes
48dfaae6 -> a88e5da6  Keep the Rewards Summary caption clear of the card's corner
f0e39989 -> ee9c25b3  Show friendly dates in the Inspect list and stack its rows at accessibility sizes
eee7159c -> 20e75c93  Record the round 2 iPhone fixes
ff42253b -> 4d56b2e0  Keep the Conversation dock above the keyboard after a pushed screen
92a5c4b2 -> ef9b55ee  Keep the register's empty-state titles whole at accessibility sizes
7a8a8724 -> d3738053  Let a register payee take two lines at the largest ordinary sizes
257c5e1b -> f7cf3b50  Record the review corrections on the iPhone Duo
ab32b1bc -> 76ce9ea8  Keep Net Worth account figures whole at accessibility sizes
2fc9d3d1 -> 8f245e9e  Keep icon category symbols inside their tap targets
1e1781d2 -> 851f8edd  Stack the Skill file symbol above its title at accessibility sizes
ca01b710 -> ee840883  Keep decorative account icons out of the account names
6c2a12bf -> 0e56be54  Put favourite switches below account names at accessibility sizes
c188b548 -> d41aff9f  Give report period labels and legends their own line at accessibility sizes
57a2ea83 -> f45c4631  Record round 2 phone layout verification
2761a20c -> 62c91bc3  Record the combined round 2 fixes and their test run
d876af3b -> 579c3d58  Record the empty-state description check on the iPhone Duo
a52c8dd5 -> 89ae5704  Record the second reviews and the empty-state correction's test run
4252ff13 -> 2caf282c  Let a scheduled row's payee wrap at the largest ordinary sizes
```

Left to do to finish the round:

1. Merge the 2IP-28 correction (`git am -3`, autosquash, check the tree diff is empty), build, run the suite once with both accessibility settings written first.
2. Ask Fable 5.2 (thread T-01a1f0a7-94f9-74be-8040-6c3c00d2f9e3) to rescore iPhone groups B, E and H at the new head. Ask GPT-6 Astra (T-01a1f0a7-8ccb-76d7-8b37-7bfac66fe0d9) to recheck the Duo's Conversation dock only if the correction changes it there.
3. Bring the artifact's Fixes table and hashes up to date after the last fold.
4. Ask YJ for landing approval and his decisions on the nine held findings. Nothing is pushed.
