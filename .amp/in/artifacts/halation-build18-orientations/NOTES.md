# Build 18 orientations fix: iOS check

- Why: App Store Connect rejected build 18 (b8b3edf, IPA sha256 b815134f...f286c) at processing with 90474, "No orientations were specified in the com.tinkertanker.halation bundle". No build record was created; `asc builds next-build-number` still reports none, so 18 stays.
- Revision: 284238c (clean orb worktree mirrored to a fresh Amp Mac satellite, macos-27, Xcode 27.2, iPhone SE (3rd generation) simulator E968C94B; simulator accessibility enabled before the run). Synthetic data only.

## Commands and results

1. `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`: 817 tests, 1 skipped, 0 failures, `** TEST EXECUTE SUCCEEDED **`.
2. `plutil -p` on the built HowMuch.app Info.plist: `UISupportedInterfaceOrientations~ipad` = Portrait, PortraitUpsideDown, LandscapeLeft, LandscapeRight; `UISupportedInterfaceOrientations~iphone` = Portrait, LandscapeLeft, LandscapeRight; `CFBundleVersion` 18; `ITSAppUsesNonExemptEncryption` false.
3. `simctl install` + `launch com.tinkertanker.halation`: launched to onboarding in portrait (launch18.png).

Not covered: rotating on an iPad simulator or device, and App Store Connect processing of the re-exported IPA (that follows the merge).
