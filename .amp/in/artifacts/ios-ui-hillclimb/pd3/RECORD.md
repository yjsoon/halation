# Round 2 iPad fixes

Six local fix commits address 2PD-01/10, 02, 03, 04, 06 and 08. 2PD-07 did not reproduce in three resize attempts and has no code change. Nothing was pushed.

## Revision and setup

- Base: `7fb530169d5d83bc240f402698b2b2cb4ae215da`, fetched from the lead's `hc-integrated-r2.bundle`.
- Branch: `ios-ui-hillclimb-pd3`. Final app-code commit: `7be39de6`; this record is committed separately.
- Amp Mac satellite, `mac.large`, `macos-27`, Xcode 27.3. iPad Pro 13-inch (M5), iPad mini (A20 Pro), iPhone 18 Pro, iOS 27.3.
- Existing disposable verify stack and `hc/seed-audit.ts` synthetic ledger. API forwarded from orb port 49633. After a tunnel interruption, the Pro used Mac port 49634 forwarded to the same orb port. Neither production hostname was used.
- Unsigned simulator builds, consistent with the no-signing boundary. No provisioning, upload, external build service or production writes.
- Build command: `HOWMUCH_SIM_SIGNING=unsigned SIMULATOR_UDID=<device> scripts/ios-xcodebuild.sh build`. Untouched base and changed app both reported `BUILD SUCCEEDED`.
- `axe describe-ui` via `hc/ui.sh` supplied frames `[x,y,width,height]` in points. `xcrun simctl io <device> screenshot <path>` captured pixels. `axe tap` and `axe touch --down --up --delay 1.5` exercised taps and context menus.
- Appearance and text changed with `xcrun simctl ui <device> appearance light|dark` and `content_size large|extra-extra-extra-large|accessibility-extra-extra-extra-large`.
- Device Hub's Controls > Rotate Left/Right rotated the Pro. Dragging the mini's bottom-right corner from `(748,1148)` to `(385,1000)` produced a 375pt window, about 981pt high, with screen origin `(190,32)`. AX coordinates in that window are window-relative; injected taps included the origin.
- Media and matching AX text files are beside this record, not in Git. The exact base app was retained on the Mac as `~/hc/r2-base.app`.

## 2PD-01 and 2PD-10: reminders notice and Open Settings

Commit: `b65dfe6b`.

Steps: Settings > Allow reminders > Don't Allow; return to Accounts, at the top of the 340pt column. Inspect at default and AX5, tap Open Settings's centre and both vertical margins. Return from the system Settings app after each successful probe.

Before, AX5 breaks both the sentence and Settings into syllables. After, the sentence wraps as whole words, with the action below. On the Pro the final sentence is `[32,528.5,233.5,174.5]`; the button is `[32,698,183.5,142.5]`, including its extra hit padding. The action uses two complete words on two lines. Portrait light and landscape dark were inspected.

At default size, the matched form-open captures expose the underlying notice at exactly `[59,234.5,123,38]` before and after. The action's original 18pt label at `[206,244.5,102,18]` becomes a 44pt hit frame `[206,231.5,102,44]` with the label and neighbouring payment row unchanged. This is padding inside the button label, cancelled outside the button, not extra layout height.

Actual probes: before, centre `(255,253)` opened Settings; `(255,232)` and `(255,275)`, about 21.5pt either side of centre, did not. After, in the equivalent notice at centre y201.5, `(255,180)` and `(255,222)` both opened Settings. `(255,234)` did not open Settings; it reached the next account row instead. AX frames alone were not treated as proof of the target.

Evidence: `pro-portrait-light-ax5-reminders-before.png`, `pro-portrait-light-ax5-reminders-after.png`, `pro-landscape-dark-ax5-reminders-after.png`, and the `pro-portrait-light-large-form-before/after.txt` geometry pair. Stacking begins at `.xxLarge`; using the existing outer payment row's width threshold would also have changed the default layout, which was prohibited.

## 2PD-02: account and payment names at XXXL

Commit: `ddd72a13`.

Steps: Accounts, sidebar hidden, 340pt Pro column; set XXXL and compare account names with balances. Also inspect the mini's narrower Accounts column. At default, compare identical captures on both iPads and the phone.

Before, Everyday Account occupies `[72,1196,87.5,85.5]` and reads `Every- / day / Account`; the payment name reads `Platinum Cash…`. After scrolling to expose the account rows, Everyday Account is `[72,758,189,27.5]`, whole on one line above its balance. Its row is 308×87pt instead of 308×113.5pt. The payment name is whole, 236×25.5pt, above the amount. Different y coordinates reflect the scroll needed to expose these rows; the width and text wrapping are the relevant change.

The mini shows Everyday Account on one line and Joint Household / Expenses Account at word boundaries, with amounts below. Portrait light and dark XXXL were captured. All default-size matched account/payments frames were unchanged on mini and phone. The Pro's matched underlying captures retain Everyday Account `[16,877,308,70.5]` and Wallet `[16,1256.5,308,60]` exactly. Wallet's label stays `[72,1276.2,47,20.5]`. Thus a row that already fitted at default does not move or grow.

Evidence: `pro-portrait-dark-xxxl-accounts-before.png`, `pro-portrait-dark-xxxl-accounts-after.png`, `mini-portrait-light-xxxl-account-rows-after.png`, and each device's `*-light-large-accounts-before/after.txt` (Pro uses the matched form-open pair above).

## 2PD-03: lifted account row

Commit: `1925b636`.

Steps: at default size, scroll Accounts to Wallet and hold its row. Dismiss by tapping outside. Repeat in light and dark.

Before, the menu lifts Wallet's text directly over register text, with no card behind it. After, the same 308×60pt source row lifts as an opaque rounded card; the register does not show through. Default row geometry remains unchanged. The card background is outside the button style so the style's full-width pressed highlight stays visible above it.

Final touch-down, hold and dismissal recording was inspected: `pro-portrait-light-large-context-final.mp4`. It shows the full-row pressed wash, opaque preview, then dismissal. Final stills: `pro-portrait-light-large-context-after.png` and `pro-portrait-dark-large-context-after.png`. Baseline: `pro-portrait-light-large-context-before.png`. The first implementation was corrected after noticing that an opaque label background would conceal the button style's pressed wash; only the corrected final implementation is delivered.

## 2PD-04: decorative form icons

Commit: `3a66d059`.

Steps: Add Transaction > keypad done; scroll Date, Flag, memo, Split transaction and Cleared into view at AX5. Compare default Add Transaction on all three devices.

Before, the Pro memo symbol is `[246,726,52,48]` and the text begins x298, exactly at its right edge. After, the symbol is 22.5×21pt at x261; text still starts x298, leaving a 14.5pt visible gap. Both shared form row components cap only the decorative symbol at the largest ordinary text size. The 28pt column, dividers and labels do not change; labels still use the requested accessibility size.

Matched default form row AX files differ only in Date's authorised wording/value width. Pro Date stays `[242,723.5,548,52]`, mini `[104,614.5,548,52]`, phone `[16,433,370,52]`; memo and neighbouring Flag/Split rows are unchanged. Mini baseline and after use Travel Card as the selected account. Both iPads' AX5 light/dark forms and mini XXXL were inspected. The top and bottom rows in scrolled screenshots can be partially outside the scroll viewport; the visible icon-label gaps are clear.

Evidence: `pro-portrait-light-ax5-form-before.png`, `pro-portrait-light-ax5-form-after.png`, `mini-portrait-light-ax5-form-after.png`, `mini-portrait-dark-ax5-form-after.png`, and all three `*-light-large-form-before/after.txt` pairs.

## 2PD-06: Date wording

Commit: `33ca5cdd`.

Before, Add Transaction shows `November 18, 2026`, using the same long formatter reported for Lumen Studio. After, the new form shows `Today`, matching the ledger's relative-date convention. Editing Lumen Studio in Everyday Account shows `Fri 30 Oct 2026`, matching its register heading. The date row is unchanged in position and height on all three devices; only the date text's width changes.

Evidence: default form pairs above and `pro-landscape-light-large-edit-date-after.png`/`.txt`. Lumen's date row is `[414,551.5,548,52]` and its date text `[802.5,567.2,121,20.5]`.

The lead explicitly authorised the one-line change to the existing test's dateLabel selector in `apps/ios/HowMuchTests/CaptureSnapshotTests.swift`. Its assertions and interactions are unchanged. No new unit test was written. This is the only file outside the original app-file list.

## 2PD-07: loading caption did not reproduce

No commit and no loading-state change.

On untouched `7fb53016`, shrink the mini to 375pt, open Travel Card, restore full width, and shrink again twice. Each of the three narrow states showed `Not reconciled yet`, `[270,68,89,44]`, rather than `Reconciled …`. Full width was confirmed as 756pt between cycles. Subsequent changed-head narrow checks also settled normally.

Evidence: `mini-narrow-light-large-register-before.txt`, `mini-resize-attempt-2.txt`, `mini-resize-attempt-3.txt`. The original report used a 791pt-high window; ours was about 981pt high. This does not establish that the reported lifecycle fault is impossible.

## 2PD-08: narrow register title

Commit: `7be39de6`.

Steps: open Travel Card in the mini's 375pt window. Compare default, XXXL and AX5 in light/dark. Compare default toolbar labels on the phone and full-width iPads.

Before, the default mini text is `[165,21.8,58.5,20.5]`, `Trave…`, beside its icon. After, the icon is omitted only when doing so allows the whole title to fit: text `[134.5,21.8,90.5,20.5]`. Search `[265,14,40,36]`, More `[321,14,40,36]` and Back `[78,10,44,44]` retain their frames.

At AX5 the iconless title can shrink to fit: text `[134,24,73.5,16]`. It is whole and does not overlap the toolbar controls, but is noticeably smaller than the page's large text. This is an explicit readability tradeoff in the restricted toolbar, not a claim that it matches the content's type size.

The phone's default Travel Card and truncated Platinum Cashback Card toolbar frame sequences match their baseline exactly, including icon, name, chevron, Back, Search and More. The full title candidate preserves already-fitting titles; the ordinary-size last candidate preserves the original truncation if even the iconless name is too long. No fixed screen-width or device offset controls the fallback.

Evidence: `mini-narrow-light-large-register-before.png`, `mini-narrow-light-large-register-final.png`, all six `mini-narrow-<appearance>-<size>-register-final` pairs, and the phone's Travel/Platinum before/after pairs.

## Tests

With the phone restored to default `large`, light appearance, accessibility enabled and Halation terminated first:

```sh
HOWMUCH_SIM_SIGNING=unsigned SIMULATOR_UDID=<iPhone 18 Pro> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests
```

Full run on final app sources:

```text
runner: build-for-testing succeeded; products match this worktree
Executed 822 tests, with 8 tests skipped and 1 failure (1 unexpected)
```

The remaining failure is `CaptureAITests.testKeychainCanReplaceAndDeleteOnlyItsOwnCredential`, `keychain(-34018)`, in the unsigned test host. A targeted run of that test and the date-picker test on untouched `7fb53016` executed 2 tests with the same single Keychain failure; the date-picker test passed there. The earlier date-selector failure on the changed head disappeared after the authorised selector update. The final full run is repeated after this record commit; its log is delivered separately as `pd3-final-head-tests.log`.

## Coverage limits and delivery

- Native checks are representative combinations, not every device × orientation × appearance × text-size combination. The Pro was checked in portrait and landscape; the mini in portrait full width and its narrow window. Mini landscape was not repeated in this fix round.
- Actual Open Settings margin probes were on the Pro. The denied-notification notice was not separately enabled on mini or phone. The other payment rows and shared form/account default geometry were compared on all three devices.
- No physical device, VoiceOver traversal, production writes, saved transaction mutations or notification delivery test. No unit tests added. No changes to held/proposal findings, concurrent Fable files, or the register's TransactionRow.
- The recipe's exact 791pt-high narrow window was not reproduced; width was 375pt. 2PD-07 remains unconfirmed, not fixed.
- Patch archive: `.amp/in/orb-backup/patches-pd3.tgz`, containing one patch per delivered commit from `7fb53016..HEAD`. Media stay outside Git.
