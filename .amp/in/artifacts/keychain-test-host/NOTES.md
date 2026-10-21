# Keychain in the iOS test host (#165)

Checks that simulator builds signed ad hoc (9a92d98: `CODE_SIGN_IDENTITY=-`, no profile) give the app-hosted unit tests a working Keychain, so no credential test fails with `-34018` or skips with "no usable Keychain".

## Runs

Both on a Devin macOS runner, Xcode 26.6 (17F113), iPhone 17 simulator on iOS 27.0, built with the iphonesimulator 26.5 SDK.

| Revision | Command | Result |
|---|---|---|
| `2427f74` (main) | `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/CaptureAITests/testKeychainCanReplaceAndDeleteOnlyItsOwnCredential -only-testing:HowMuchTests/APISettingsTests -only-testing:HowMuchTests/ServerConnectionTests` | 14 executed, 0 failed, 0 skipped. `ServerConnectionTests` matched nothing: the file's classes are `ServerConnectionRulesTests` and `ServerConnectionFlowTests`. |
| `8315202` (this branch) | `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/CaptureAITests/testKeychainCanReplaceAndDeleteOnlyItsOwnCredential -only-testing:HowMuchTests/APISettingsTests -only-testing:HowMuchTests/ServerConnectionRulesTests -only-testing:HowMuchTests/ServerConnectionFlowTests -only-testing:HowMuchTests/IntakeSkillTests` | 71 executed, 0 failed, 0 skipped. |

Expected and observed on both runs:

- `CaptureAITests.testKeychainCanReplaceAndDeleteOnlyItsOwnCredential` passes.
- No log line contains `no usable Keychain` or `-34018`; every `APISettingsTests` case ran, including `testLegacyHostedSessionMovesWithTheHost` (the #158 token re-scope).
- `codesign -dv --verbose=2` on the built `HowMuch.app` shows `flags=0x2(adhoc)`, `Signature=adhoc`, `TeamIdentifier=not set`. The entitlements dict is empty; the Keychain still works because ad hoc signing gives the simulator app an application identifier.

The runner's reports, with every test case line and the codesign output, are `run-2427f74.txt` and `run-8315202.txt`. No secrets or production data were used.
