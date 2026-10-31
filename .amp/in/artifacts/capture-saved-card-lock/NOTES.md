# Capture saved-card lock: stale tests aligned

Revision tested: `975fd374213027f3b54dec75e8215a19dcef15cd` (branch `claude/project-thread-1r6208`). App code equals main `a9a7252`; only `apps/ios/HowMuchTests/CaptureSessionTests.swift` and `docs/frontend/intake-ui.md` differ.

Run on the Devin macOS runner (session 8dfc1153d2784dc5bd6c723b16051a36), 31 Oct 2026.

- Xcode 27.0 (27A266a) via `DEVELOPER_DIR=/Applications/Xcode-27.0-RC.app/Contents/Developer`
- Simulator iPhone 17, iOS 27.0, accessibility defaults set per `apps/ios/AGENTS.md`

Command:

```
DEVELOPER_DIR=/Applications/Xcode-27.0-RC.app/Contents/Developer SIMULATOR_UDID=<sim> scripts/ios-xcodebuild.sh test
```

Expected: full suite passes, including CaptureSessionTests `testChooseTargetDraftCannotUpdateASavedCard`, `testEmptyModelRenameStillRenamesTheVisibleCard`, `testPayeeOnlyAddBecomesUpdateWhenADraftAlreadyExists`, and CaptureConversationTests `testModelUpdatesCannotModifySavedCardsIndividuallyOrInBulk`.

Observed: TEST EXECUTE SUCCEEDED. XCTest 815 executed, 1 skipped (opt-in live Foundation Models test), 0 failures. Swift Testing 3/3 passed.

Context: on main the old saved-card rename tests failed against b1472ec's lock. An earlier attempt on this branch (cdd62d8) restored chat edits to saved cards; it broke the security reproduction `testModelUpdatesCannotModifySavedCardsIndividuallyOrInBulk` (99000 vs 12000) and was reverted in 975fd37.

No E2E UI drive: the change is test and doc only, with app code identical to main.
