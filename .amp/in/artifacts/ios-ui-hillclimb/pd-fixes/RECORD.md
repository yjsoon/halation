# iPad hillclimb: scoped fixes

Date: 18 November 2026. Repository: yjsoon/halation. Branch: `ios-ui-hillclimb-pd`, based on `2258ef81913e6b27dfb2ecad6b42f2cad230e56f`. App-code head: `c1c0013f`. All commits are local, not pushed. No signing, production access, publication, unit-test additions or unrelated fixes.

## Setup and repeatability

Amp Mac satellite, mac.large, macos-27, Xcode 27.3. iOS 27.3 simulators: iPad Pro 13-inch (M5), iPad mini (A20 Pro), iPhone 18 Pro and iPhone SE (3rd generation). The disposable verify stack runs on the orb; its API port 49633 is forwarded to the Mac. All financial data is synthetic.

The transferred kit is `.amp/in/orb-backup/hc/KIT.md`. Start the isolated stack with `control-howmuch launch` and `control-howmuch doctor` from `.cursor/skills/verify-howmuch/bin`, then run the kit's `seed-audit.ts` with the local API credentials from the disposable state file. Do not print or commit credentials. The seed includes the six-digit balances, long account names, categories, schedules and Platinum Cashback Card's future-dated payment. Travel Card has payment reminders: statement day 1, due gap 25 days, next-weekday rule, minimum $50 or 3%, enabled. For the final IP-08 check, enable the same terms for Platinum Cashback Card through the local `card_payment_terms` PUT endpoint. It produces a $1,659.56 statement amount. This supplemental fixture change is not app code.

Build using `HOWMUCH_SIM_SIGNING=unsigned SIMULATOR_UDID=<selected simulator> scripts/ios-xcodebuild.sh build`. Install the resulting Debug simulator product with `xcrun simctl install`, launch `com.tinkertanker.halation`, and sign into the disposable stack. An unsigned build needs sign-in again after relaunch because Keychain entitlements are absent. `~/hc/relaunch.sh` performs that local handoff. `~/hc/ui.sh` prints accessibility frames in points. `~/hc/snap.sh` saves a PNG and the matching accessibility text. Use `xcrun simctl ui <device> appearance light|dark` and `content_size large|extra-extra-extra-large|accessibility-extra-extra-extra-large`. Rotate iPads through Xcode Device Hub rather than `axe rotate`.

Evidence below is under `shots/`, beside this record. Each stem has `.png` and usually `.txt`. Original audit captures also remain in `../shots/`. `AX5` means accessibility-extra-extra-extra-large. `iphone` means iPhone 18 Pro. Before captures use base app code unless noted below; after captures use the complete app-code head above. Screenshots are deliberately not in Git.

## Findings, changes and executed checks

### PD-01 / IP-02: keep Accounts inside its column

Commit `40127324`. Open Accounts at AX5 with its column shown. Before: 410pt-wide content exceeds the Pro's 340pt column and the mini's 308pt column. Hypothesis experiment: replacing only the one-column shortcut Grid with VStack still produced 410pt overflow. Bounding the balance fixed it; restoring the original Grid retained the fix. Only the balance change is committed. Expected and observed: the card uses the available width, 308pt on Pro and 343pt on SE, with intact fitted figures. Default-size balance layout retains horizontal fixed sizing.

Before/after: `pro-landscape-light-AX5-scheduled` / `pro-landscape-light-AX5-accounts-after`; `mini-portrait-dark-AX5-accounts` / `mini-portrait-dark-AX5-accounts-after`; `se-portrait-light-AX5-overflow-before` / `se-portrait-light-AX5-accounts-after`. Negative-control captures: `mini-landscape-dark-AX5-grid-probe`, `mini-landscape-dark-AX5-grid-and-balance-probe`, `mini-landscape-dark-AX5-balance-only-probe`. Default controls: `pro-portrait-light-default-accounts` / `pro-portrait-light-default-accounts-after` and `iphone-portrait-light-default-accounts-before` / `iphone-portrait-light-default-accounts-after`.

### PD-04: mini shortcut labels fit

Commit `dbedd33a`. Open the mini Accounts column at default size. Before: Scheduled truncates in three 84pt tiles. Expected and observed: below the measured minimum width for three labels, the existing stacked shortcut layout shows the whole word. Pro and iPhone 18 Pro retain three columns at default size. Before/after: `mini-portrait-dark-default-all` / `mini-portrait-dark-default-accounts-after`; default controls are the Pro and iPhone Accounts captures listed above.

### IP-03: group totals remain one figure

Commit `a2ccb5c8`. On SE at AX5, scroll Accounts to Credit. Before: the total breaks within its digits. Expected and observed: Credit is above one intact `-$68,388.71` total. The accessibility arrangement stacks the name and total; default size retains the horizontal arrangement. Before/after: `se-portrait-light-AX5-credit-before` / `se-portrait-light-AX5-credit-after`. iPad coverage: the AX5 Accounts captures above; default controls: the Pro and iPhone Accounts captures above.

### PD-05: heading share column scales

Commit `6a541f74`. Pro landscape, light, AX5: Insights > Month to Date > Spending Breakdown. Before: 57% wraps into three lines in a fixed 44pt column. Expected and observed: a scaled caption-relative column makes 57% a single line, measured 84 by 52pt. Only the heading share column changed, not category transaction-count rows. Before/after: `pro-landscape-light-AX5-spending` / `pro-landscape-light-AX5-spending-after`. Default controls: `pro-landscape-light-default-spending` / `pro-landscape-light-default-spending-after` and `iphone-portrait-light-default-spending-before` / `iphone-portrait-light-default-spending-after`. Larger filter hit regions add vertical space without changing the report's text styles.

### PD-06: scale, rather than remove, the Rewards cap

Commit `fac78bf6`. Pro landscape, light: Rewards, expand Travel Card, change default size to AX5. Before: the stacked board is capped at 640pt despite the broad window. Expected and observed: its accessibility-scaled cap allows 1344pt of content in this window. The same stacked sections remain, with less wrapping. The 640pt cap remains at every non-accessibility text size; the normal window-row branch is unchanged. The existing Rewards recipe sentence was updated in this commit.

Before/after: `pro-landscape-light-AX5-reward-detail` / `pro-landscape-light-AX5-rewards-after`. Default controls: `pro-landscape-light-default-rewards` / `pro-landscape-light-default-rewards-after` and `iphone-portrait-light-default-rewards-before` / `iphone-portrait-light-default-rewards-after`.

### PD-08 / IP-08: readable payment row and Schedule

Commit `a7c0329f`. Mini portrait dark default and AX5: Accounts > Payments due. Before: amount and Schedule break across lines. Expected and observed: narrow rows put the action below the details, accessibility rows also stack the name and amount, the amount remains one line, and default Schedule measures 91 by 44pt. Tap Schedule to open its sheet; no transfer was saved. The wider iPhone 18 Pro default row keeps the horizontal arrangement, except the larger action target.

Before/after: `mini-portrait-dark-default-payment-band` / `mini-portrait-dark-default-accounts-after`; `mini-portrait-dark-AX5-payment-reminders` / `mini-portrait-dark-AX5-payments-after`. Action result: `mini-portrait-dark-default-schedule-after`. Pro AX5: `pro-landscape-light-AX5-payments-after`. SE default: `se-portrait-light-default-accounts-before` / `se-portrait-light-default-accounts-after`. Supplemental exact IP-08 fixture: `se-portrait-light-default-long-payment-before` / `se-portrait-light-default-long-payment-after`; Platinum Cashback Card and $1,659.56 are both complete after the fix. AX5: `se-portrait-light-AX5-long-payment-after` and `se-portrait-light-AX5-long-payment-scrolled-after`; the amount is a single 242 by 58pt string and Schedule is 250 by 72pt. Default iPhone control: Accounts before/after above.

Residual: at AX5 in narrow columns the separate Payments due heading can still wrap within a word because it shares a row with the icon and badge. This patch fixes the assigned payment amount/action row, not that separate heading.

### PD-07: Accounts collapse header

Commit `e4d68c9f`. Accounts group collapse button gains a 44pt minimum height; the chevron's font and visible size are unchanged. Expected and observed: UI frames show 44pt and a tap in the added blank vertical space collapses/expands the group (mini, x75/y790 in that captured state). Before/after and default phone control: the Accounts pairs above. IP-03 is a separate commit from this target-size change.

### PD-07: icon categories

Commit `10ba5bb9`. New Account > Icon. Before: category controls measure 38 by 34pt. After: accessibility frames are 44 by 44pt, retaining the original 38 by 34pt capsule and glyph. Category selections still change the grid. Extra top/side padding accepted physical touches, but later repeated edge injections were inconsistent, especially at the bottom edge; this is not certification of every point in the rectangle. Before/after: `pro-portrait-light-default-icon-picker` / `pro-portrait-light-default-icon-after`; iPhone control: `iphone-portrait-light-default-icon-before` / `iphone-portrait-light-default-icon-after`. A recording attempt did not show the injected changes and is not passing interaction evidence.

### PD-07 / IP-14: follow-up chips

Commit `9120aaca`. Add Transaction > Follow-up. Before: 28pt controls. After: To confirm is 106 by 44pt and To claim 94 by 44pt; the visible capsules and text retain their size. Taps in added blank padding toggle selected state. Before/after: `pro-landscape-light-default-followup` / `pro-landscape-light-default-followup-after`; `iphone-portrait-light-default-followup-before` / `iphone-portrait-light-default-followup-after`; `se-portrait-light-default-followup-before` / `se-portrait-light-default-followup-after`.

### PD-07 / IP-14: report filter chips

Commit `217f0434`. Spending Breakdown > All Accounts or All Categories. Before: 30pt targets. After: 44pt targets (All Accounts 120 by 44pt, All Categories 130 by 44pt) around unchanged visible capsules. Tap the added top padding: the filter menu opens. Before/after: the default Pro and iPhone Spending pairs above; SE `se-portrait-light-default-spending-before` / `se-portrait-light-default-spending-after`. Menu result: `iphone-portrait-light-default-filter-open-after`.

### PD-07 / IP-14: month arrows

Commit `14c45b2d`. Spending Breakdown > previous month. Before: the arrow controls measure 28pt. After: 44 by 44pt, with the same circle and chevron. Tapping a corner of the enlarged region changes November to October. Evidence: default Pro, iPhone and SE Spending pairs above. Shared MonthStepper implementation also serves Range Report; no separate Range Report post-fix interaction was recorded.

### PD-07: Assistant inspection link

Commit `de049552`. Open Assistant's Today summary, then Inspect 2 matching payments. Before: 16pt-high link. After: 186 by 44pt with unchanged font. Tap in the added lower padding: Today register opens. Before/after: `pro-landscape-light-default-assistant` / `pro-landscape-light-default-assistant-after`; `iphone-portrait-light-default-assistant-before` / `iphone-portrait-light-default-assistant-after`. No date-format code changed.

### PD-07: split labels (last app-code commit)

Commit `c1c0013f`. Add Transaction > enable Split. Before: blank row space does not open the editor. Expected and observed: each split label and Add Split Line spans the full row with a 44pt minimum. Tapping blank split-row space opens Split Line on Pro and iPhone; tapping Add Split Line's edge adds a third row. Pro row: 548 by 44pt; phone: 370 by 44pt. Only split-row/Add Split Line labels were changed, not the payee picker or form task.

Before/after: `pro-landscape-light-default-split` / `pro-landscape-light-default-split-after`; `iphone-portrait-light-default-split-before` / `iphone-portrait-light-default-split-after`. Resulting editors: corresponding `split-editor-after` captures. Some phone split/follow-up before captures were taken with the isolated PD-01 balance fix installed; those form controls were still exactly baseline code.

## Checks and limitations

At app-code head `c1c0013f`, unsigned iPhone 18 Pro:

```sh
HOWMUCH_SIM_SIGNING=unsigned SIMULATOR_UDID=<iPhone 18 Pro> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests
```

Decisive output:

```text
runner: build-for-testing succeeded; products match this worktree (HowMuchTests last linked 2026-11-18 16:43:23 +0000)
Executed 822 tests, with 8 tests skipped and 1 failure (1 unexpected) in 187.062 (187.419) seconds
```

The sole failure is `CaptureAITests.testKeychainCanReplaceAndDeleteOnlyItsOwnCredential`, `keychain(-34018)`. Rebuilt exact base `2258ef81` and ran that same test with the same unsigned setting: it also fails with `keychain(-34018)`. No signing or entitlement workaround was made. The eight skips belong to the existing simulator/environment-dependent tests. Full logs are retained outside Git as `pd-tests-fixed.log` and `pd-tests-baseline.log`. The suite is repeated at the final record commit; its actual output is delivered with the patches rather than claiming that this known failure passes.

A subsequent final-commit run inherited AX5 from the audit and reported 822 tests, eight skips and 61 failures, including the known Keychain failure and 60 snapshot assertions. That run is retained as `pd-tests-final-AX5.log`; those additional assertions were not separately compared against base at AX5. The normal full-suite check restores the simulator's default `large` content size before running. This is a test-environment correction, not an app or test change; the separate AX5 UI evidence above still applies.

`bun run verify:ios-confirm-presentation`, `bun run verify:ios-disclosure-chevron` and `git diff --check` pass. No post-implementation unit tests were added. All affected views were rendered; representative default-size Pro/iPhone before/after controls retain their type and visible glyph/capsule sizes, allowing the intended extra target space. The mini shortcut and payment layouts intentionally change at default size to fix their observed narrow-width faults.

Not a complete re-audit or an 8/10 certification. PD-02, PD-03, Reconcile, the Duo worker's category-row count and New Group work, the phone worker's Rewards/Assistant changes, and other unassigned findings remain outside this branch. No physical-device testing. No post-fix exhaustive light/dark/orientation/text-size Cartesian matrix. The icon-picker edge-injection limitation above remains explicit; accessibility frame dimensions alone do not prove every coordinate accepts a touch. Native recording attempts were static despite successful separate interactions, so no clip is presented as proof.

Outside the requested app files: only the explicitly requested Rewards recipe sentence and this record. No RootTabView, RegisterView, ScheduledTransactionsView, RewardSkyline or RewardExposureFace edits. Format patches are generated after the final record commit with `git format-patch 2258ef81..HEAD -o .amp/in/orb-backup/patches-pd/`. Screenshots and logs are excluded from all commits.
