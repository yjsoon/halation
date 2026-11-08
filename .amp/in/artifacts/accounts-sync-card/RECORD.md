# Accounts outbox card run record

- Change: the Accounts outbox card ("N changes not sent yet") waits 3 s from the oldest queued change before it appears (`AppModel.outboxCardRevealDate`, `AccountsView`). Refused changes and outbox read failures still show it at once. Before this, every cleared, approve or confirm tap inserted the card and a healthy sync removed it under a second later, moving the whole Accounts column.
- Base: origin/main `ccf3ba4a`. Before runs used that revision unchanged; after runs added this change.
- Fixture: `control-howmuch launch` (synthetic `HowMuch Demo` seed), owner created through `POST /api/auth/setup`, and a scratch Bun proxy on port 7100 in front of the API that could delay writes (0, 1.5 s, 6 s), answer writes with 400, or be stopped (unreachable). Simulators on an Amp Mac (Xcode 27.2): iPad Pro 11-inch (M5) in split view and iPhone 17 Pro, signed in to `http://127.0.0.1:7100` as `verifier`.
- Steps: open Everyday Account, tap the cleared circle on SimplyGo (iPad: four taps 1.2 s apart; iPhone: one tap, then Back to Accounts at once), recording the simulator with `xcrun simctl io recordVideo` and tapping with `axe`.
- Expected and observed:
  - Before, 0 ms delay, iPad: the card appears on each tap and leaves when the PATCH returns 200 (`ipad-before-fast.mp4`, `ipad-before-fast-strip.png`). Matches the reported device video.
  - Before, 1.5 s delay, iPhone: Back to Accounts shows the card, then it drops (`iphone-before-1500.mp4`, `iphone-before-return.png`).
  - After, same two runs: no card, Accounts does not move; the proxy logged PATCH `.../cleared` 200 for every tap (`ipad-after-fast.mp4`, `ipad-after-fast-strip.png`, `iphone-after-1500.mp4`, `iphone-after-return.png`).
  - After, 6 s delay: the card appears about 3 s after the tap and leaves once the server answers (`ipad-after-slow.mp4`).
  - After, forced 400: the card appears at once with Retry and Discard, the row shows the refused glyph and the toast shows; Retry with the proxy restored clears it (`ipad-after-refused.png`).
  - After, proxy stopped: the card appears after 3 s with Sync Now and stays; Sync Now after restarting the proxy clears it (`ipad-after-offline.png`).
- Also run: `scripts/ios-xcodebuild.sh test`, 824 tests, 0 failures, 1 skipped.
- Not covered: a physical device.
