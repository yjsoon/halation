# ReportFetchGate: `mayCommit(_:)` replaces the repeated stale-token and cancellation check

Revision: origin/main 03f44ec plus the patch commit (verified on 9fb81ff; the only commit since is #330, which touches AppModel.swift alone).
Change: `ReportFetchGate` gains `mayCommit(_ token: Int) -> Bool { isCurrent(token) && !Task.isCancelled }`, used at 10 sites (8 in ReflectDetails.swift, 2 in IncomeVsSpendingPeriodDetailView.swift). `isCurrent` stays because RefreshPlanTests calls it.

Verification (macOS, Devin child session https://app.devin.ai/sessions/c75e744469874d5caa5d775ff434a7d8, parent https://app.devin.ai/sessions/d7a5b90728d6407393a934c9558c5c84):
- Fresh clone at 9fb81ff, patch applied, `scripts/ios-xcodebuild.sh test -- -collect-test-diagnostics never`.
- Build succeeded; 777 tests executed, 0 failures, 1 skipped (`CaptureInterpreterTests.testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery`, gated on `HOWMUCH_LIVE_MODEL_VERIFY=1`).
- No new warnings. The only warnings in touched paths are three pre-existing Text `+` deprecations at IncomeVsSpendingPeriodDetailView.swift:32,67,68, identical on base.
- `RefreshPlanTests` 10/10, including the two stale-fetch gate tests.

Not verified: no simulator UI flow; the gate tests cover the token logic, not each of the 10 call sites.
