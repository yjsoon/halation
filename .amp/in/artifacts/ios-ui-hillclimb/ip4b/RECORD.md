# Round 2 phone fixes: IP4B

19 November 2026. Base `8e173f31`; code head `e21bd03b` on local branch
`ios-ui-hillclimb-ip4b`. No push, signing, publication or production access.
Only the disposable verify stack and synthetic audit ledger were used.

## Setup and repeatable checks

- Amp Mac satellite, macos-27, Xcode 27.3, iOS 27.3 simulators: iPhone 18 Pro
  (402pt portrait) and iPhone SE, third generation (375pt portrait).
- Start the repository's disposable verify stack with
  `.cursor/skills/verify-howmuch/bin/control-howmuch launch`. Seed using the
  parent's `hc/seed-audit.ts` kit and forward its API port to the Mac. Sign in
  using the kit's synthetic verifier credentials, never a production server.
- Build each revision with `HOWMUCH_SIM_SIGNING=unsigned SIMULATOR_UDID="$U"
  scripts/ios-xcodebuild.sh build`, install `scripts/ios-xcodebuild.sh app-path`,
  and launch `com.tinkertanker.halation`. Both base and changed builds succeeded.
- Capture the named states below with `axe describe-ui --udid "$U"` and
  `xcrun simctl io "$U" screenshot <path>`. Change sizes with
  `xcrun simctl ui "$U" content_size large` or
  `accessibility-extra-extra-extra-large`, and appearance with
  `xcrun simctl ui "$U" appearance light` or `dark`.
- Paths: Accounts; Organise accounts > Choose Favourites; New Account > Type
  and Icon; Insights > Net Worth, Income vs Spending and Age of Money;
  Settings > Skill & Memory. Scroll reports to Accounts, the legend, empty
  September, and November's Age row. On Insights scroll to Yesterday's average.
- Every changed surface was captured on both phones in light at default and
  largest text. SE dark largest captures cover all six findings, including
  scrolled Net Worth accounts, empty Income months and Age rows.

PNG and accessibility text evidence stays on the thread's orb under
`.amp/in/artifacts/ios-ui-hillclimb/ip4b/ip4b/`, not in Git. Names are
`<se|pro>-<screen>-<large|ax5>-<light|dark>-<before|after>`; additional scrolled
states use `accounts-rows`, `networth-accounts`, `income-legend`, `income-empty`,
`age-rows` and `insights-average`. All measurements below are [x,y,width,height]
in points. Offscreen y coordinates are from the full accessibility tree.

## Changes and observed results

### 2IP-02, a08b96ad

Net Worth headings stack at accessibility sizes. Heading totals and balances
stay on one line, scaling only when necessary; account names can wrap. The
already-fixed summary is unchanged.

- SE Assets total: [191.5,1442,151.5,105] to [32,1499,274.5,53].
- SE Everyday balance: [32,1912.5,261.5,116.5] to [32,1912.5,267,53.5].
  Name: [32,1838,262.5,58.5] to [32,1780,202.5,116.5]. The truncated name and
  split last digits are gone.
- Pro Assets total: [190.3,1442.7,179.7,104.7] to [32,1499.3,274.7,52.7].
  Everyday balance already fitted on one line, and remains 291.3 by 58.7pt;
  its y changes from 1913.3 to 1918 as the accessibility heading grows.
- Cost: taller accessibility headings and smaller figures when needed to keep
  the whole number. No observed default-size frame change.

### 2IP-10, d467c345

Cap decorative account symbols at xxxLarge, without capping names. Account
Type is owned by `AccountIdentityFields.swift`, so that file has one additional
modifier alongside the changes in `AccountsView.swift`.

- SE Accounts bank symbol: [32,3048.8,32,66] to [33,3066,30,31.5].
- Pro Accounts: [32,2881.2,32,65.7] to [33,2898.3,30,31.3].
- SE Account Type: [36,218.2,32,66] to [37,235.5,30,31.5].
- Pro Account Type: [36,260.2,32,65.7] to [37,277.3,30,31.3].
- Favourites' final accessibility branch explicitly uses body type before
  the cap, in 2IP-17 below. Its symbol is now 27pt wide instead of drawing
  beyond the 28pt slot. Symbols and names no longer overlap.
- Cost: symbols stop growing above xxxLarge. Text still follows the user's
  size. No observed default-size frame change. Account Type's existing
  "Check-ing" wrap is outside this icon-only fix.

### 2IP-17, 6c9cfe68

At accessibility sizes, put the switch below the icon and whole account name.
Ordinary sizes retain the original system Toggle. Held sheet titles unchanged.

- SE Brokerage name: [119.5,157,99.5,125.5] to [76,157,228.5,63.5].
  Its row changes from [16,142,343,155.5] to [16,142,343,129.5].
  Symbol: [55.8,157,28,63.5] to [36.5,157,27,27.5].
- Pro name: [119.7,199,167,125.3] to [76,199,228.3,63.3].
  Row height 155.3 to 129.3pt. Brokerage is one word on both phones.
- SE Everyday name: [119.5,312.5,148.5,187.5] to
  [76,286.5,218.5,125.5], now two whole words on separate lines.
- On SE, switched Brokerage from off to on, closed and reopened the sheet:
  accessibility value remained 1. Switched it off and reopened: value 0.
  Fixture restored. A short tap on the on-switch's centre did not toggle it;
  a 0.2s tap on its left side did. The labelled row's centre is above the
  switch at accessibility sizes; use the visible switch for coordinate tests.
- Cost: more vertical space for names that need several lines; the switch is
  below rather than beside the name. No observed default-size frame change.

### 2IP-11, 9f3b9afa

Cap category symbols at xxxLarge. All category buttons remain 38 by 44pt.
SE Animals [58,213,38,44] and Objects [226,213,38,44] are identical before and
after; Pro equivalents remain [58,245,38,44] and [226,245,38,44]. The symbols
are distinct rather than overlapping. Tapping Animals & Nature changes the
displayed category heading to Animals & Nature. No default-size change.

### 2IP-14, e21bd03b

Stack legends and period values at accessibility sizes; put the Insights
summary's icons above its labels. Ordinary layouts remain unchanged.

- SE Income legend: [45,1106,102.5,102.5] to [45,1106,135.5,51.5];
  Spending [176.5,1106,138.5,102.5] to [45,1165.5,176,51.5].
- Pro Spending: [209.7,1096.7,138.3,102.3] to [45,1156,175.7,51.3].
- SE November 2026: [32,847,167,174.5] to [32,847,227,116.5];
  213 days [239.5,876,103.5,116.5] to [32,967.5,205.5,58.5].
- Pro November already fitted as two whole words, 227 by 116.7pt; it stays
  there. 213 days moves from [267,891.7,103.3,116.7] to
  [32,1012.3,205.7,58.7], now one line.
- SE Yesterday's average: [109.5,1041,166,174.5] to
  [32,1110.5,251.5,116.5]. September and No activity also remain whole in the
  scrolled empty-month captures.
- Cost: more vertical space at accessibility sizes. No observed default-size
  movement. The floating system tab control can still obscure content at the
  bottom of a screenshot; scrolling exposes that content. This round does
  not change the tab control or chart-edge labels.

### 2IP-15, 9299e701

Stack the Skill file symbol, title and chevron at accessibility sizes, matching
the existing Import & Export approach. SE title [72,374.5,191,249.5] to
[36,443,281,187.5]; Pro [72,416.7,191,249.3] to [36,485.8,281,187.3].
"documents" stays whole and the book no longer overlaps it. Cost: a taller
accessibility card, including the chevron below the text. No default movement.

### 2IP-12, deferred with no code change

Read the Scheduled account Picker, Rewards account/cycle Pickers, and Payment
terms' bank, statement, weekend, funding, amount and hour Pickers. The selected
labels belong to the native menu Picker. Wrapping them would require alternate
menu presentation across these controls. No small, verified implementation
preserving native ordinary-size frames and behaviour was established.

The Payment reminders capture did not expose enough of the selected label to
independently confirm the truncation. Scheduled and Rewards menu values were
not revisited in this round. This is a deferred audit finding, not a claim of
reproduction or a new proposed implementation.

## Default-size frame comparison

Compared all labelled foreground accessibility elements after the screen's
navigation marker, excluding transient scrollbars. Background elements behind
sheets were excluded because their scroll positions differed. Ordered labels,
values, and frames were compared at 0.11pt tolerance. Counts before and after
match, with no differing frame beyond the tolerance:

| Surface | SE elements | Pro elements |
| --- | ---: | ---: |
| Accounts | 108 | 108 |
| Favourites | 37 | 37 |
| Account Type | 35 | 44 |
| Icon picker | 218 | 327 |
| Insights | 128 | 128 |
| Net Worth | 135 | 135 |
| Age of Money | 42 | 42 |
| Income vs Spending | 112 | 112 |
| Skill & Memory | 29 | 41 |

The Pro icon grid had incidental 0.1pt scroll-coordinate rounding; this is not
a claim of byte-identical text dumps. There is no measured default-size layout
cost in the nine surfaces.

## Final suite protocol

After this record is committed, run the complete HowMuchTests target on the
iPhone 18 Pro, with the app closed and default text size, at that final head:

```sh
xcrun simctl ui "$U" content_size large
xcrun simctl terminate "$U" com.tinkertanker.halation
xcrun simctl spawn "$U" defaults write com.apple.Accessibility AccessibilityEnabled -bool true
xcrun simctl spawn "$U" defaults write com.apple.Accessibility ApplicationAccessibilityEnabled -bool true
HOWMUCH_SIM_SIGNING=unsigned SIMULATOR_UDID="$U" scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests
```

The parent has established the unsigned Keychain -34018 failure on the base.
Enabling both accessibility settings immediately before the test host starts
avoids the separately confirmed empty-tree snapshot failures. The final
Executed line and any failure are reported in the thread and parent handoff
after the run, rather than changing the head after testing it.

## Not checked

No physical device, VoiceOver speech/navigation run, intermediate text sizes,
landscape, iPad or Duo validation in this phone-only round. No change or
independent runtime confirmation for 2IP-12. No AI model calls. Held large
sheet titles, Account Type's text wrapping and other workers' files are left
alone. No new unit tests; existing tests and simulator flows only.

## 2IP-27 follow-up: pressed account row corners (ip5b)

Base: `a52c8dd5`, from the lead's `hc-integrated-r2k.bundle`. This is the
requested comparison with the fixup absent, not a rebuild of `7fb53016`.
Implementation: `5ecfc1cb`, a fixup of `6cd47056`. Only AccountsView.swift
changed. No new tests, remote writes, signing or publication.

### Reproduction and mechanism

On the iPhone 18 Pro and iPad mini (A20 Pro), iOS 27.3, portrait, default
text size (`large`), the base's 0.25s press on each of the first, middle and
last Cash rows rounded all four corners. UIKit uses the context-menu preview
shape for its pre-menu highlight too. Giving only the opened menu a separate
preview made the middle square, but made the first and last square at the
card's outer corners as well: the native highlight escapes the parent clip.
That intermediate attempt was rejected.

The finished fix keeps the live content and layout unchanged, sets the native
highlight's corner radii from the row's first/last position, and supplies a
separate opaque rounded card for the opened context menu. The preview reuses
the row content and preserves the full name with a vertical fixed size.

### Repeated native interaction and evidence

Used the disposable verify stack and synthetic audit ledger only. Never used
the production servers. On each device, in light and dark, scrolled Accounts
until the four-row Cash card was visible. Tested Everyday Account (first),
Joint Household Expenses Account (middle), and Wallet (last).

For every row, on base and corrected builds:

1. Save the AX tree with `~/hc/ui.sh "$U"` and calculate the row centre.
2. Record at 30fps with `axe record-video --udid "$U" --fps 30 --output ...`.
3. `axe tap -x 150 -y "$Y" --hold 0.25 --udid "$U" --post-delay 0.6`.
4. On the phone, return with BackButton. On iPad the register stays alongside.
5. `axe tap -x 150 -y "$Y" --hold 1 --udid "$U" --post-delay 0.8`.
6. Save the menu AX tree and screenshot, stop recording, dismiss the menu.

Inspected zoomed frames from all 24 recordings (three rows, two devices, two
appearances, two builds). Corrected short presses have top-only corners on
first, no rounded corners on middle, bottom-only corners on last. Middle
fills the card width. The mini's light press has faint contrast; inspected
the 2.2 to 2.6s frame sequence rather than relying on a selected-state still.
Every opened preview remains opaque and rounded with the whole name and amount.

Evidence, not committed: `.amp/in/artifacts/ios-ui-hillclimb/ip5b/` contains
`{pro,mini}-{light,dark}-press-corners.png` and `-lifted-corners.png` contact
sheets, baseline on left and corrected on right. Raw 30fps MP4s, screenshots
and AX trees are below its `ip5b/` directory, named by device, appearance,
row and stage (`baseline` or final `edge`). `press-frame-index.json` records
the selected frame timestamps. Earlier iteration stages are not evidence for
the finished fix. Extraction scripts are in `.amp/in/orb-backup/`.

### Default layout measurements and preview cost

Live row frames are unchanged in width, height, horizontal positions and
relative vertical layout. The mini's absolute frames also match exactly:

| Device / row | Base frame (x,y,w,h), pt | Corrected frame, pt |
| --- | --- | --- |
| Pro first | 16,543.3,370,60 | 16,425.7,370,60 |
| Pro middle | 16,603.7,370,70.3 | 16,486,370,70.3 |
| Pro last | 16,734.7,370,60 | 16,617,370,60 |
| mini first | 16,317,276,70.5 | identical |
| mini middle | 16,388,276,114.5 | identical |
| mini last | 16,574,276,60 | identical |

The phone recordings use scroll offsets differing by 117.6 to 117.7pt, not
a layout change. After normalising that offset, row content frames match
within AX's 0.1pt rounding. For example, Pro middle name is 140.7 by 42.3pt
at x72 and y14pt inside the row on both builds; its amount is 81.3 by 20.3pt
at x288.7 and y25pt inside the row. Mini middle name is 86.5 by 86.5pt at
x72 and row-relative y14pt; its amount is 81.5 by 20.5pt at x194.5 and y47pt.

The opened preview is not layout-identical: UIKit sizes the separate view
intrinsically. Pro first/middle/last widths and heights are now 319x60,
370x51.7 and 183x60pt, versus 370x60, 370x70 and 370x60pt. Mini previews are
325.5x60, 343x46.5 and 185.5x60pt, versus 302x77.5, 302x125.5 and 302x66pt.
All names and figures remain whole and the background opaque. These are
preview-only dimensions, not changes to the tappable live rows.

### Final suite and limits

After committing this record, run the full HowMuchTests target at that final
head on iPhone 18 Pro, with `large`, app closed, and both accessibility defaults
true, using the exact protocol under Final suite protocol above. Report the
actual Executed line and failures in the thread and parent handoff. The
unsigned Keychain -34018 failure is already established on the base; do not
describe that outcome as a passing suite.

Not checked in this correction: SE, iPad Pro, landscape, other text sizes,
physical devices, VoiceOver, menu action side effects or a one-row group.
The requested first/middle/last interactions and light/dark checks are covered
on one iPhone and one iPad. No changes outside the requested app file.
