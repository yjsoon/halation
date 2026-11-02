# Halation bundle ID move, build 18: iOS check

- Revision: 98b8f12 (tree identical to the Mac mirror; the mirror has no .git, so HEAD was confirmed on the orb with a clean worktree).
- Machine: Amp Mac satellite (macos-27), Xcode 27.2 (27B48), simulator iPhone SE (3rd generation) E968C94B, iOS 27.x. Synthetic data only; fresh install.

## Commands and results

1. `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/CaptureSessionTests` at the parent d1ab3b9 plus the bundle-ID commits (before the test update): 40 tests, 4 failures in the three saved-card tests (payee stayed "Coffee"/"POSB"), matching the earlier report.
2. Same command after the test update, together with CaptureSnapshotTests: 72 tests, 0 failures.
3. `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` at 98b8f12: 816 tests, 1 skipped, 0 failures, `** TEST EXECUTE SUCCEEDED **`. (An earlier full run on the same simulator's first boot failed 6 CaptureSnapshotTests with empty accessibility trees; the next runs passed without changes.)
4. Built products: app `CFBundleIdentifier` com.tinkertanker.halation, `CFBundleVersion` 18, `ITSAppUsesNonExemptEncryption` false; extension com.tinkertanker.halation.share.
5. `xcrun simctl install` + `launch com.tinkertanker.halation`: launched (pid shown), `UIKitApplication:com.tinkertanker.halation` running, onboarding screen ("Halation", "Start on this iPhone", "Connect to a server") in launch.png.
6. `simctl get_app_container ... group.sg.soon.howmuch`: resolves to a shared AppGroup container for the new app ID.
7. `pluginkit -m -v -i com.tinkertanker.halation.share`: 1 plug-in registered, version 0.1.0.

Not covered: a full share-sheet hand-off through the Inbox (ios-share-and-screenshots recipe) and physical-device install.
