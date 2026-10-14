# CalculatorKeypad: haptic trigger counters named for what they do

Revision: origin/main 7e1abe2 plus the patch commit (verified on 9fb81ff; the commits since touch AppModel.swift and the Reflect views only).
Change: `digitTaps` and `symbolTaps` in `CalculatorKeypad` (TransactionFormView.swift) become `digitHapticTrigger` and `symbolHapticTrigger`, and the comment explaining what they were for is deleted.

Verification (macOS, Devin child session https://app.devin.ai/sessions/1ee09866c9064e04a291186fad2a26e5, parent https://app.devin.ai/sessions/408acbb910a54c4980f6e3c2cc3d4ea7):
- Fresh clone at 9fb81ff, patch applied cleanly (TransactionFormView.swift only), `scripts/ios-xcodebuild.sh test -- -collect-test-diagnostics never`.
- Build succeeded; 780 tests run, 780 passed, 0 failed, no new warnings.

Not verified: haptics themselves. A rename of two private properties cannot change them, and no simulator can feel them.
