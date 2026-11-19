# Rewards board: a card opening in place

19 to 20 November 2026. First tested on `6fb00967`; landed on the origin/main of the day after a
review round with Claude Fable 5.2. Change: the open card's detail
is a List row of its own under the card, and a card opened low on the screen
scrolls its detail into view. No push, signing, publication or production
access. Only the disposable verify stack and synthetic fixtures were used.

## Cause

The board is a SwiftUI `List`. When a card opened, its detail was inserted
inside the card's own row, so the row had to grow. The List does not animate a
row's height: the cell snapped to its full height on the first frame, and
SwiftUI then animated the row's contents inside the larger cell, starting from
its old layout centred vertically. On screen the card's header sat in the
middle of the new row on top of the Period and Targets (already at full
opacity), then slid up to the top, while the rows below jumped straight down.
The same happened in reverse on close.

Checked on the simulator before the change (frames at 20 to 25 fps):

- Keeping `listRowInsets` the same open or closed: still snaps.
- Removing `.contextMenu` and `.swipeActions` from the row: still snaps.
- Replacing the whole detail with a plain 250pt block: still snaps, so it is
  not the period rail's measured labels or any other part of the slip.

## Fix

- The card row keeps its height. While it is open, the detail is a second
  List row under it, with the lifted background split at the seam, so the two
  rows read as one card with one shadow. Inserting and removing a row is
  what the List does animate: the card stays put, the detail fades and the
  rows below slide.
- A card opened low on the screen scrolls the detail's bottom up to the
  bottom of the board when the whole card fits under the bars, and otherwise
  takes the card up to the top. It uses `ScrollViewReader` (the only
  programmatic scroll a `List` supports) with the List's edge anchors: an
  anchor in between left short scrolls of 16pt and 68pt undone.
- Only the detail's frame is read from the new layout; the card gives only its
  height, since its first frame can predate the closing of another card's
  detail above it. A detail that would start below the board is never built,
  so the card goes straight up to the top instead of waiting for it.
- Scrolling by hand cancels a reveal still waiting on its layout. Closing the
  card any other way drops it too.
- An open card's row doesn't swipe: it is only the top half of the card. Hide
  stays in its menu and VoiceOver actions. Closed cards still swipe to Hide.
- Reduce Motion: both the open and the scroll happen without animation.

## Setup

- Amp Mac satellite, macos-27, Xcode 27.3. Simulators: iPhone 17 Pro (iOS
  27), iPhone SE third generation (iOS 26.5), iPad Pro 13-inch (M5) portrait,
  iPhone Duo outer display.
- `.cursor/skills/verify-howmuch/bin/control-howmuch launch`, then
  `POST /api/auth/setup` with the verifier credentials and
  `POST /api/import/rewards-tracker` with `fixtures/rewards-exposure-states.json`
  (16 cards).
- `SIMULATOR_UDID=<udid> scripts/ios-xcodebuild.sh build`, install, sign in
  through Connection to the local API, choose Rewards.
- Drive taps with `axe tap`, record with `xcrun simctl io <udid> recordVideo`,
  and read frames with `ffmpeg -vf fps=20`.

## Observed

| Case | Before | After |
| --- | --- | --- |
| iPhone 17 Pro, open Exposure Below | Header lands mid-row over Period and Targets, slides up; rows below jump | Card stays; detail fades in; rows below slide down |
| Close it | Detail collapses over the header; rows jump up | Detail fades; rows below slide up |
| Open another card while one is open | Not recorded | First detail fades out as the second fades in; no jump |
| Low card (Exposure Capped) | Not recorded | Scrolls until the whole detail and Edit Rewards sit above the tab bar, card below the top bar |
| iPhone SE, low card | Not recorded | Card fully visible under the bar; most of the detail shows, Edit Rewards stays under the tab bar (the List scroll stops short) |
| Dark, Reduce Motion | Not recorded | Open, close and scroll each happen in one frame |
| iPad Pro 13-inch, window rows, two-column detail, light and dark | Not recorded | Opens in place; seam between card and detail invisible |
| iPhone Duo outer display | Not recorded | Opens and closes in place; a low card scrolls its detail up |

## Review round (Claude Fable 5.2)

No blockers. Fixed: a detail row that starts off the board never being
measured, a card frame taken from the old layout when switching cards, the
pending reveal outliving the card, swipe on an open card's top half, and the
lift's overlap past the seam (now 48pt). Re-run on iPhone 17 Pro with
`axe describe-ui` frames (tab bar top 791, top bar bottom about 116):

| Case | Card top | Edit Rewards bottom |
| --- | --- | --- |
| Exposure Below from the top of the board | 253 | 719 |
| Exposure Below after a 60pt scroll | 306 | 771 |
| Exposure Capped from the top of the board | 329 | 719 |
| Exposure Urgent open, then Exposure Below | 253 | 719 |
| Exposure Category straddling the bottom edge | 115 | 692 |

Before these fixes the Below cases stayed at 382 with Edit Rewards ending at
847, under the tab bar. Swiping the open card shows no Hide button; swiping a
closed card shows it.

## Checks

- `scripts/ios-xcodebuild.sh test` on iPhone 17 Pro after the change:
  `Executed 822 tests, with 1 test skipped and 0 failures`,
  `** TEST EXECUTE SUCCEEDED **`.
- `bun test`: 813 pass, 0 fail. Web and worker typechecks pass.
  `verify-ios-confirm-presentation` and `verify-ios-disclosure-chevron` pass.

Recordings and screenshots stay in the thread, not in Git.
