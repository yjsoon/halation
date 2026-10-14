# TransactionFormView: the hidden keypad follows the draft amount

Revision: origin/main c3f9f52 plus the patch commit (verified on 9fb81ff; the patch applies cleanly on top of #332, which renamed two properties elsewhere in the same file).
Change: after Split is turned off, the form no longer calls `keypad.setValue(draft.amountMagnitudeMilli)` by hand. A new `.onChange(of: draft.amountMagnitudeMilli)` re-syncs the keypad whenever it is hidden and its display differs, so any change to the draft amount (not only the split-removal path) cannot leave a stale keypad value.

Verification (macOS, Devin child session https://app.devin.ai/sessions/491c001604a24911a49a3ff4c54e9333, parent https://app.devin.ai/sessions/e3f514d2dfa64da9810a8c31d1bd2998):
- Fresh clone at 9fb81ff, patch applied, `scripts/ios-xcodebuild.sh test -- -collect-test-diagnostics never`.
- Build succeeded; 777 XCTest tests executed with 0 failures and 1 skipped (`CaptureInterpreterTests.testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery`, gated on `HOWMUCH_LIVE_MODEL_VERIFY=1`), plus 3 Swift Testing `RewardDraftPeriodTests` passed.
- Xcode type-checked the `.onChange` chain in TransactionFormView.swift with no "unable to type-check in reasonable time" error, and no warnings in that file.
- Simulator flow (iPhone 17, iOS 26.5, isolated local verify stack, synthetic data only): Add Transaction, Outflow, keypad 5.00, payee "Split Verify", Split ON with lines -5.00 and -3.00 (header -$8.00), Split OFF and Remove Split (header -$8.00), tap the amount: the keypad reopened showing 8.00, typed 0 and the header became -$80.00, backspace back to -$8.00, Save. The register showed "Split Verify" -$8.00 and the local API returned `payee_name` "Split Verify", `amount` -8000 for the day.

Not verified: only the split-removal path was driven in the simulator. The other places that change the draft amount while the keypad is hidden were not exercised, and nothing was compared against the old behaviour in the simulator.
