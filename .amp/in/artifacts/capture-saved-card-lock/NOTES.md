# Capture saved-card lock: stale tests aligned

Revision tested: `31e089d8d288e33e14aeddee5c1b6276c6e4cb57` (branch `claude/project-thread-1r6208`, includes origin/main `0ebf0bc`). Against main, the branch changes only the capture tests, the interpreter prompt wording (`apps/ios/HowMuch/Capture/CaptureInterpreter.swift`), `docs/frontend/intake-ui.md` and this file.

Run on the Devin macOS runner (session 8dfc1153d2784dc5bd6c723b16051a36), 31 Oct 2026.

- Xcode 27.0 (27A266a) via `DEVELOPER_DIR=/Applications/Xcode-27.0-RC.app/Contents/Developer`
- Simulator iPhone 17, iOS 27.0, accessibility defaults set per `apps/ios/AGENTS.md`

Command:

```
DEVELOPER_DIR=/Applications/Xcode-27.0-RC.app/Contents/Developer SIMULATOR_UDID=<sim> scripts/ios-xcodebuild.sh test
```

Expected: full suite passes, including CaptureConversationTests `testModelUpdatesCannotModifySavedCardsIndividuallyOrInBulk` (now also an untargeted change at a lone saved card) and CaptureSessionTests `testChooseTargetDraftCannotUpdateASavedCard`.

Observed: TEST EXECUTE SUCCEEDED. XCTest 815 executed, 1 skipped (opt-in live test), 0 failures. Swift Testing 3/3 passed.

Opt-in live test `testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery` (HOWMUCH_LIVE_MODEL_VERIFY=1 injected into the xctestrun): could not run to its saved-card step. It fails at the first add, `ModelManagerError error 1019`, with `Asset com.apple.gm.safety_deny.input.foundation_models_framework.api not found in Model Catalog`: the simulator has no Apple Intelligence model assets. Its updated saved-card assertions are unexecuted; they need a device with Apple Intelligence.

History: an earlier attempt (cdd62d8) restored chat edits to saved cards and failed the security reproduction above (99000 vs 12000); it was reverted in 975fd37.

No E2E UI drive: app behaviour is unchanged from main apart from model prompt wording, which only the live model exercises.
