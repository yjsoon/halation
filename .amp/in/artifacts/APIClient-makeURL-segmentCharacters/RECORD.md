# APIClient.makeURL: the opaque-ID segment encoding gets a name

Revision: origin/main 723f0f7 plus the patch commit (verified on 9fb81ff; the commits since touch AppModel.swift, the Reflect views and TransactionFormView.swift, none of them APIClient.swift).
Change: `private static let encodeURIComponentAllowed` and `private static func encodeOpaqueIDSegment(_:) -> String?` are extracted in APIClient.swift, and the comment that explained the inline character set is replaced by the names. The encoding itself is unchanged.

Verification (macOS, Devin child session https://app.devin.ai/sessions/10c434fac1804310b948d7045f60c55d, parent https://app.devin.ai/sessions/974ecee6b6aa4d8581a94baf00c2c25e):
- Fresh clone at 9fb81ff, patch applied, `scripts/ios-xcodebuild.sh test -- -collect-test-diagnostics never`.
- Build succeeded; 777 tests executed, 0 failures, 1 skipped (`CaptureInterpreterTests.testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery`, gated on `HOWMUCH_LIVE_MODEL_VERIFY=1`), plus the 3 Swift Testing `RewardDraftPeriodTests`.
- The new `private static let` CharacterSet compiles under Swift 6 concurrency with no warnings. The one APIClient.swift warning (line 320, "will never be executed") is outside the patch and identical on base.
- Targeted suites passed: `RewardsReportTests` 7/7, `NarrowRefreshTests` 12/12, `ServerConnectionRulesTests` 3/3 and `ServerConnectionFlowTests` 9/9.

Not verified: no dedicated test feeds an ID with reserved characters through `makeURL`, so the unchanged encoding is covered only by the request-building tests above.
