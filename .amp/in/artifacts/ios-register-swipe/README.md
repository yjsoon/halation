# Register row swipe: distance and look

- Base revision: `0a615abe` (main), plus the uncommitted change in `apps/ios/HowMuch/Views/RegisterView.swift`.
- Stack: `control-howmuch launch` (isolated SQLite, seeded `fixtures/demo-ledger.json`), owner `verifier`. Everyday Account rows and Broker transfer were set to `approved: false` through the local API so Approve shows. No production data.
- Devices: Amp Mac satellite, Xcode 27.3 beta, iOS 27.2 simulators: iPad Pro 11-inch (M5) in landscape and portrait, and iPhone 17 Pro in portrait, light and dark. Gestures were driven with `axe swipe`, `axe tap` and `axe record-video`.

## Cause of the distance

A temporary UIKit probe on unchanged main in the iPad split layout reported the register's `UICollectionView` at `(0, 0, 834, 1210)` with `safeAreaInsets.left = 350`, and each cell carrying `safeAreaInsets.left = 350`. On iOS 26 and later, a scroll view that touches the sidebar is extended under it. The swipe-action pane added that inset to its own width, so Approve opened about 420pt.

## Change

- The card's 16pt side inset moved from each row (and the date header) onto the List. The List no longer touches the column edges, so the stretch and the 420pt open are gone. The swiped row is now clipped at the card edge, and Approve or Delete opens inside the card.
- `.scrollClipDisabled(false)` on the List: without it, iPhone drew a swiped row past the List's edge.
- The balance and reward rows above the card lost their own 16pt so they stay aligned with the card.
- Approve is tinted `Theme.newStatus` (the New dot it clears), not `Theme.inflow`.

## Rejected

- One-pixel List padding: fixed the distance, but the row still slid out past the card into the margin (YJ: "looks quite unnatural").
- `listSectionMargins(.horizontal, 16)`: insets the rows but not the date headers, and does not clip the swiped row.
- Row insets in place of padding: the inset moves with the row.
- `listRowBackground(Theme.card)` for a white tray behind the button (suggested by the Fable judge): the row background slides with the row in a plain List, so the beige still shows. A stationary white tray needs the inset-grouped list style.

## Steps and outcomes

| Layout | Gesture | Observed |
| --- | --- | --- |
| iPad landscape split, Everyday and All | 80pt right, 180pt right | Approve opens one button width, the same both times, inside the card |
| iPad landscape split | 80pt left | Delete opens one button width inside the card |
| iPad landscape split | tap elsewhere, swipe another row, scroll | closes; one row open at a time; vertical scroll normal (recording) |
| iPad landscape split | full swipe right on Cold Storage | approved; API `approved: true` |
| iPad landscape split | full swipe left on Tinkermind Payroll, Cancel | `Delete this transaction?` shown; API `deleted: false` after Cancel |
| iPad portrait split | 80pt each way | one button width, inside the card |
| iPhone portrait, light and dark | 80pt each way, scroll | inside the card; content still scrolls under the top bar |

`scripts/ios-xcodebuild.sh test` on iPhone 17 Pro: `Executed 825 tests, with 1 test skipped and 0 failures`.

## Files

- `ipad-landscape-split-{before,after}-{approve,delete,all-approve}.png`: same gesture on unchanged main and with the change.
- `ipad-landscape-split-after.mp4`: Approve, cancel, Delete, cancel, scroll.
- `ipad-states-after.png`, `ipad-full-swipes-portrait-after.png`, `iphone-states-after.png`, `ipad-portrait-split-before.png`.
