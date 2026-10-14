# APIClient rewards imports: one helper for the verbatim request body

Revision: origin/main c677fe2 plus the patch commit (verified on 9fb81ff, before #333, which changed APIClient.swift elsewhere; the patch applies cleanly on top of it).
Change: `private static func verbatimPayloadBody(planID:payload:) throws -> Data` builds the `{plan_id, payload}` envelope for both `importRewardsAccountConfig` and `importRewardsTracker`. The reason for using `JSONSerialization` instead of `CreditCard` coding (absent keys, explicit nulls and unknown configuration must survive) now sits in a two-line doc on the helper instead of a comment at one call site. This is a small de-duplication more than a removal of a workaround comment; the rationale is kept, not deleted.

Verification (macOS, Devin child session https://app.devin.ai/sessions/cc11bccddcac42ceb9c1f27b7cb7c89b, parent https://app.devin.ai/sessions/ea4adf376de14c479cf7fd52d6efc02b):
- Fresh clone at 9fb81ff, patch applied, `scripts/ios-xcodebuild.sh test -- -collect-test-diagnostics never`.
- Build succeeded; 777 XCTest tests executed with 0 failures and 1 skipped (`CaptureInterpreterTests.testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery`, gated on `HOWMUCH_LIVE_MODEL_VERIFY=1`), plus 3 Swift Testing `RewardDraftPeriodTests` passed.
- No new warnings. The only warning in APIClient.swift (line 320, "will never be executed") is outside the patch and identical on base.
- `RewardsAccountImportTests` all passed, including `testPUTPreservesRawConfigurationAndDecodesCard`, which exercises `importRewardsAccountConfig` end to end against a URLProtocol stub and checks the verbatim `plan_id` plus `payload` body.

Not verified: no test calls `importRewardsTracker` over the stub; only its `wholeSettings` preflight is covered. The doc line was added after the Devin run (comment only). Verified on 9fb81ff rather than on this exact head.
