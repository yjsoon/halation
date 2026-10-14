# AppModel.refreshAll: the run clears its own record through `defer`

Revision: origin/main 9fb81ff plus the patch commit.
Change: `performRefreshAll(quiet:generation:)` starts with `defer { finishRefreshAll(generation:) }`; the in-flight record becomes a named `FullRefreshRun` struct. The behaviour is unchanged: the run still drops its own record as its last step, unless a newer generation replaced it.

Verification (macOS, Devin child session https://app.devin.ai/sessions/aa4c0d5ea20548b49c6ca0bf65cf726c, parent https://app.devin.ai/sessions/11344aad09d94c85a0ccea61005bee77):
- Fresh clone at 9fb81ff, `bun install --frozen-lockfile`, patch applied, then `scripts/ios-xcodebuild.sh test -- -collect-test-diagnostics never`.
- Build for testing succeeded; 777 tests executed, 0 failures, 1 skipped (`CaptureInterpreterTests.testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery`, gated on `HOWMUCH_LIVE_MODEL_VERIFY=1`).
- No new warnings; no warnings in AppModel.swift.
- Behaviour-bearing tests, all passed: `RefreshAllDedupeTests` 4/4 (join in flight, fresh run without join, record clears before the starting caller resumes, failed plan resolution stops the capture wait), `LaunchRefreshTests` 2/2, `ReferenceSnapshotLaunchTests` 12/12, `ReferenceSnapshotStoreTests` 15/15.

Not verified: no simulator UI flow; the change has no visible surface and the existing tests above exercise the join/clear ordering.
