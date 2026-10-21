# Keychain in the iOS test host (#165)

Checks that simulator builds signed ad hoc (9a92d98: `CODE_SIGN_IDENTITY=-`, no profile) give the app-hosted unit tests a working Keychain, so no credential test fails with `-34018` or skips with "no usable Keychain".

## Runs

Both on a Devin macOS runner, Xcode 26.6 (17F113), iPhone 17 simulator on iOS 27.0, built with the iphonesimulator 26.5 SDK.

| Revision | Command | Result |
|---|---|---|
| `2427f74` (main at the time) | `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/CaptureAITests/testKeychainCanReplaceAndDeleteOnlyItsOwnCredential -only-testing:HowMuchTests/APISettingsTests -only-testing:HowMuchTests/ServerConnectionTests` | 14 executed, 0 failed, 0 skipped. `ServerConnectionTests` matched nothing: the file's classes are `ServerConnectionRulesTests` and `ServerConnectionFlowTests`. |
| `8315202` (this branch) | `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/CaptureAITests/testKeychainCanReplaceAndDeleteOnlyItsOwnCredential -only-testing:HowMuchTests/APISettingsTests -only-testing:HowMuchTests/ServerConnectionRulesTests -only-testing:HowMuchTests/ServerConnectionFlowTests -only-testing:HowMuchTests/IntakeSkillTests` | 71 executed, 0 failed, 0 skipped. |

Expected and observed on both runs:

- `CaptureAITests.testKeychainCanReplaceAndDeleteOnlyItsOwnCredential` passes.
- No log line contains `no usable Keychain` or `-34018` (the runner's grep of the full log), and no test case line reports a skip.
- The Keychain-probing token cases all ran instead of skipping: `APISettingsTests` `testLegacyHostedSessionMovesWithTheHost`, `testCustomEndpointAndItsSessionArePreserved` and `testExistingServerSessionStaysOnTheServer` on both runs; `ServerConnectionFlowTests` `testSwitchingToTheServerAndBackPersists` and `testForgettingTheServerSessionLeavesLocalModeAlone` on the `8315202` run only, since the first run's filter matched no class.
- `codesign -dv --verbose=2` on the built `HowMuch.app` shows `flags=0x2(adhoc)` (no `linker-signed`), `Signature=adhoc`, `TeamIdentifier=not set`, which is the signed ad hoc build rather than the unsigned one.
- The `2427f74` run also dumped the signature's entitlements, which are empty. The application identifier comes from Xcode's simulated entitlements in the binary's `__TEXT,__entitlements` section (see `docs/ai-providers.md`), which neither run dumped.

Not covered: `testLegacyHostedSessionMovesWithTheHost` checks that the #158 session moves to the new host, but not that the stale `soon.sg` Keychain copy is deleted. The runs used an iOS 27.0 simulator; the original failure was seen on iOS 26.5.

The runner's reports are `run-2427f74.txt` and `run-8315202.txt`. They keep every test case line, the codesign output and, for the first run, the last lines of the test log; the full logs stayed on the runner. No secrets or production data were used.
