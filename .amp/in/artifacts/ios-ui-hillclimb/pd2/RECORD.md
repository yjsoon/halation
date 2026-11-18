# PD review corrections

Date: 18 November 2026. Repository: yjsoon/halation. Branch: `ios-ui-hillclimb-pd2`, based on the supplied `7c421f52` bundle. App-code head: `066ceb25`. No push, distribution signing, publication or production access.

## Setup and commands

Amp `mac.large`, `macos-27`, Xcode 27.3; iPhone SE (3rd generation), iPhone 18 Pro and iPad mini (A20 Pro), iOS 27.3. The disposable seeded verify API ran on orb port 49633, forwarded to the Mac. All account names and figures in this record are synthetic. Favourites was populated through Accounts > Organise accounts > Choose Favourites > Everyday Account.

Built baseline `2258ef81` and the corrections with:

```sh
HOWMUCH_SIM_SIGNING=unsigned SIMULATOR_UDID=<device> scripts/ios-xcodebuild.sh build
```

Both builds succeeded. Installed the resulting app with `xcrun simctl install`. AXe taps and screenshots exercised the real app. Text sizes were `large` (default), `extra-extra-extra-large` and `accessibility-extra-extra-extra-large`; appearances were light and dark. The mini window was resized to 375pt wide with `axe drag`/`swipe` on its bottom-right corner. Its screen origin differed from accessibility-window coordinates; coordinate probes included the measured window offset. A full-screen mini Accounts column was also checked at AX5.

Screenshots, matching accessibility dumps and the native tap recording are in `pd2/` beside this record. They are not committed. Names start `baseline-` or `fixed-`, then device, appearance/size and screen. Some full text-size names and the short `AX5` alias both occur; `*-assistant-scrolled` and `*-spending-heading` show the controls after scrolling into view. Updated final captures replace intermediate captures with the same names.

## R-O1 / R-D4: icon categories, fixup 4412286f to 538d541a

Steps: Accounts > New Account > Icon. At the baseline SE default size the category strip occupies y176–210, height 34. Flags is centred at x330. Taps at y170 and y215 miss; y193 selects Flags.

The correction removes the minimum width and keeps each label 38pt wide. Five points of vertical padding create a 44pt label; matching negative padding outside the ScrollView restores the original layout height and glyph position. At SE default, Flags is `[310,171,38,44]`, rather than the reviewed 44pt-wide row ending at x396. Taps at (330,172) and (330,214) select Flags; (330,169) and (330,217) leave Objects selected. On the narrow mini, corresponding screen-coordinate taps at (520,212) and (520,254) select Flags; (520,208) misses. No neighbouring category was selected by those misses.

Default iPhone 18 Pro comparison: Search emoji stays `[58,164,314,22]`; the Objects heading stays `[16,469,62,20]`. The Objects label changes from `[268,208,38,34]` to `[268,203,38,44]`, leaving its visible glyph/capsule centred at the same y225. That phone has a Recent category from earlier icon selection, so its strip contains an extra category; the clean SE strip fits completely.

Evidence: `baseline-se-default-icons`, `fixed-se-light-large-icons`, `baseline-pro-default-icons`, `fixed-pro-default-icons`, the six `fixed-se-*-icons` and six `fixed-mini-*-icons` states. `se-icon-hit-probe.mp4` shows actual Objects/Flags transitions and was inspected, not treated as a static screenshot.

The baseline already enlarges and overlaps the category glyphs at AX5 inside the fixed visual cells. Confirmed on `baseline-se-dark-AX5-icons`; this correction preserves that pre-existing glyph behaviour, as instructed, rather than changing type or visible glyph size.

## R-O2 / R-D3: Assistant link, fixup 6fb61e16 to d08c2dd9

Steps: Accounts > More > Assistant. Baseline iPhone 18 Pro link is `[32,300,187,16]`; New conversation is `[16,348,370,56]`. Taps at y286 and y330 miss the baseline link; y292 opens Today.

The corrected link has `[32,286,187,44]` while the visible text and New conversation retain their baseline positions; New conversation remains exactly `[16,348,370,56]`. Padding is inside the NavigationLink label, with negative padding outside the link. Putting both paddings inside the label preserved layout but failed the margin-tap check, and was rejected.

Taps at x120, y287 and y329 open Today. System proximity handling extends the effective area beyond the AX frame: y284 and y332 also open Today. At y339 the neighbouring New conversation opens; do not interpret the AX frame as an exact hit-test boundary or claim that every point outside it is inert. No added-margin tap inside the 44pt region opened the neighbour.

Evidence: `baseline-pro-default-assistant`, corrected `fixed-pro-default-assistant`, six light/dark/size states on each narrow device, and `fixed-{se,mini}-{light,dark}-AX5-assistant-scrolled`. The AX5 controls can both be brought into view without overlap. No date-format or query-card code changed.

## R-D7: Favourites title, fixup 2ae5876b to 0fc214b3

Steps: choose Everyday Account as a favourite; scroll Accounts to Favourites. At accessibility sizes only, the name stays on one line and may scale down, as the adjacent total already does. Default and XXXL do not receive the one-line limit or shrink allowance.

The first 0.75 minimum scale still truncated Favourites in the mini's full-screen narrow Accounts column. The final 0.5 lower bound fits the full word there; the system uses only the shrink it needs. The final title measures 164 × 42pt in that column, and remains one line in the 375pt window and on the SE. The full-column result was rebuilt, installed and inspected after this adjustment.

Evidence: six `fixed-{se,mini}-*-favourites` states per device, plus final `fixed-mini-{light,dark}-AX5-column-favourites`. No sorting, totals or collapse behaviour changed.

## R-A4 / R-O3: Spending heading, fixup 2a304842 to 20c3e7f3

Steps: Insights > Month to Date > Spending Breakdown; scroll to Home. Before, the 375pt AX5 header broke Home into two lines and $2,650.95 into three, with 57% cut off. The earlier review captures at `r1-review/review-shots/mini-portrait-*-AX5-narrow-spending.png` show this.

After, accessibility sizes put the amount/share line under the name. Home is one line, the amount is one line, and 57% is one line within the window. In the 375pt mini window the amount measures 186 × 45pt and the share 84 × 52pt; both are fully visible. Default and XXXL retain the horizontal heading. Only the group-heading range was changed; summary columns and Fable's category rows are untouched.

Evidence: `fixed-{se,mini}-{light,dark}-{large,extra-extra-extra-large,accessibility-extra-extra-extra-large}-spending-top` and `fixed-{se,mini}-{light,dark}-AX5-spending-heading`.

## R-A4: wrapping filter widths, new commit 066ceb25

`WrappingHStack` now gives an oversized child the row's width for both measurement and placement. Children that already fit retain the unspecified proposal, preserving their layout. Before: date chip and cards x−10, width396 in a 375pt window. After: content starts at x16 and fits inside the 343pt content width; the AX5 November chip wraps to two lines and measures 288 × 119pt. No leading overflow remains.

Default iPhone 18 Pro date-chip width remains 142pt and heading money/share x positions remain 253/356. The integrated branch still contains the three hit-area commits the lead will drop: its date filter is 44pt high rather than baseline 30pt, and Home is y469 rather than baseline y428. These existing height changes are not attributed to the new wrapping constraint and are not claimed fixed here.

A second consumer was rendered by the existing `CaptureSnapshotTests.testCandidateRailsMeetHitTargetsAtDefaultAndAccessibility3` test, on baseline and corrected code. The CaptureConversation ambiguity and query rails still wrap Everyday/Travel and Groceries/Dining Out as before. Exported baseline/fixed images are named `*-capture-*-candidates-*`. Both executions passed this test; no new unit or source-text test was added.

## Drop / retain decisions

- Drop `aead532e`, `45dc502b`, `01195311`. No corrective commits are supplied for them. Fable's actual baseline tap probes found 44pt follow-up targets, at least 45pt filter-chip targets and about 52pt month-arrow targets. The lead authorised their removal; this branch leaves removal to the lead. A baseline Pro follow-up tap 8pt above the 28pt AX frame also toggled the control, but a full independent threshold sweep was not completed here.
- Leave `145ba3bc` as explicitly requested. Fable found its original effective target already 44pt and no layout movement.
- Retain `2fa1c330`. Fable's baseline split-row probe found a genuine roughly 28pt region and verified added edge taps on the integrated code. This round does not duplicate that full probe or edit TransactionFormView.

## Tests and limits

At app-code head `066ceb25`, restored the iPhone 18 Pro to default `large` size, light appearance, and explicitly enabled both simulator accessibility defaults immediately before testing. An initial baseline candidate test run found empty accessibility trees because those defaults had reverted to zero; after re-enabling them, the baseline candidate test passed.

```sh
HOWMUCH_SIM_SIGNING=unsigned SIMULATOR_UDID=<iPhone 18 Pro> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests
```

```text
runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 20:56:51 +0000)
Executed 822 tests, with 8 tests skipped and 1 failure (1 unexpected) in 184.322 (184.676) seconds
```

The only failure is `CaptureAITests.testKeychainCanReplaceAndDeleteOnlyItsOwnCredential`, `keychain(-34018)`, expected for the explicitly unsigned test host. Rebuilt exact `2258ef81` on this Mac and reran that test: same failure. The no-signing boundary was retained. This is not a green test suite. The final documentation commit receives a fresh full-suite run as well; the delivered log reports its result. Logs are `.amp/in/orb-backup/pd2-final-tests.log` and `pd2-base-tests-ax.log`.

`git diff --check`, `bun run verify:ios-confirm-presentation` and `bun run verify:ios-disclosure-chevron` pass. No app files outside the five assigned views changed. This record is the only additional tracked file.

Coverage limits: no physical device, no full landscape matrix in this correction round, no independent repeat of all Fable baseline probes, no complete re-audit of unrelated screens. Default Pro comparison covered Assistant, icons and Spending; a separate baseline Pro Accounts/Favourites comparison was not captured. The other WrappingHStack consumer used the existing native rendered fixture, not an AI-backed production conversation. Summary-column faults and pre-existing AX5 category-glyph crowding remain outside these corrections.
