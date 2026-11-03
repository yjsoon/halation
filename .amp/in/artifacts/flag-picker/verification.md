# Flag picker layout verification

## Delivery state and scope

Historical implementation-stage evidence, recorded before upstream integration and the later merge authorisation. At the time of this run the changes were local and uncommitted, with no push, merge, deployment, publication or Slack post. See `landing-verification.md` for the fresh integrated-commit verification used for landing.
Base revision: [90e5497](https://github.com/yjsoon/howmuch/commit/90e54972999180eb349600b2862ded322873746c).

Final source SHA-256 values:

- `apps/ios/HowMuch/Views/TransactionFormView.swift`: `65357c85f1886b157ef826ba962d31606dbfe28d4ac069937cfc107325c9edaa`
- `apps/ios/HowMuchTests/CaptureSnapshotTests.swift`: `9a0f1abea2645e8c93f28e3a92c0e1dc8d13f3284972581629658a182dd2ecb8`

## Reproduction and correction

The unchanged native Picker rendered `Groceries/Food` in two lines despite spare row width. At xxxLarge it rendered across three lines and overlapped Memo. Its selected text could grow without the native control reporting the corresponding height.

Giving the Picker layout priority fixed the short mapped value, but squeezed the Flag caption into multiple lines for longer names. Protecting the caption and trying vertical fixed sizing or hiding the native label still left accessibility text outside its row. These candidates were rejected after simulator checks and screenshot inspection.

The final change keeps the bound native Picker inside a Menu and gives that Menu a SwiftUI-owned FormCardRow label. The caption retains its natural width. The selected value receives the remaining width, uses trailing alignment and unrestricted vertical growth. The entire padded row is the menu target. No stored flag values, mappings or shared row metrics changed.

## Surface and fixtures

- Amp Mac satellite, macos-27, Xcode 27.2, iOS 27.2 simulator.
- Real TransactionFormView and native Menu/Picker, rendered by the existing SnapshotSurface harness. This is native UI integration validation, not a full local-server E2E run.
- Only rewards HTTP is replaced by a URLProtocol fixture at `https://flag-layout.test`, returning a synthetic cashback card for `acct-everyday`.
- Synthetic names: green = Meals; red = Groceries/Food; blue = Household essentials and weekly provisions. No screenshot account details or real transactions are used.
- Seven render states at 390 × 844 points: short, mapped and long names at large; short and mapped at xxxLarge; mapped and long at accessibility3.
- The regression recognises pixels inside Flag's own row, so text overflowing into Memo cannot pass solely because accessibility still reports its complete name.

## Repeatable commands

Enable simulator accessibility once, using the destination selected by the repository wrapper:

```sh
UDID="$(scripts/ios-xcodebuild.sh destination)"
xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility AccessibilityEnabled -bool true
xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility ApplicationAccessibilityEnabled -bool true
scripts/ios-xcodebuild.sh test -- \
  -only-testing:HowMuchTests/CaptureSnapshotTests/testMappedFlagUsesAvailableWidthAndAllowsAccessibilityGrowth \
  -only-testing:HowMuchTests/CaptureSnapshotTests/testAddAndEditTransactionFormRowsShareHeightAndOrder \
  -only-testing:HowMuchTests/CaptureSnapshotTests/testAddManuallySavesOnceAndCancelPreservesConversation
```

The new regression was run against the original production Flag implementation before the fix and again after restoring that implementation later. Both baseline runs failed. The same OCR-based single-line and completeness checks ran on the last baseline and final runs; the final test also guards the readable Flag caption after screenshot inspection caught caption compression in the priority-only candidate. Baseline output includes `Groceries/` and `Food` as separate observations, and missing words for longer selections cropped to the row.

Final result: **3 tests, 0 failures**, after a fresh successful build-for-testing. The new test covers all seven states. The existing tests additionally cover Add/Edit row geometry and manual Save/Cancel through the real outbox.

Final observed Flag heights:

| State | Height | Observed selected text |
| --- | ---: | --- |
| Meals, large | 52 pt | One line |
| Groceries/Food, large | 52 pt | One line |
| Long name, large | 68.5 pt | Two complete lines |
| Meals, xxxLarge | 53.5 pt | One line |
| Groceries/Food, xxxLarge | 53.5 pt | One line |
| Groceries/Food, accessibility3 | 122 pt | Two complete lines |
| Long name, accessibility3 | 218 pt | Four complete lines |

## Pointer interaction

A temporary native validation test held the Add form open at 375 × 667. A real macOS pointer passed over Date and Memo, opened Flag, passed over Yellow, selected Meals and clicked Save. The row changed to a green icon and Meals. The test asserted that Save submitted a draft with `flag == .green` to its onPersist callback. This checks the menu binding and submitted value, not a server/database write. The temporary test, pointer executable and handshake file were removed afterwards.

- Native menu accessibility label before: `Flag, Groceries/Food`.
- Native menu accessibility label after: `Flag, Meals`.
- Menu target: 343 × 52 pt, including the padded row.
- Pointer test: passed, with `FLAG_POINTER_SAVED flag=green`.
- Recording: `flag-interaction-final.mp4`, inspected after capture.

## Evidence and limitations

- `flag-proof/verification-output.txt`: command-generated baseline/final test results, OCR, frames and pointer assertions.
- `flag-proof/before-*.png` and `flag-proof/after-*.png`: full native captures of all seven states.
- Top-level PNGs: inspected crops retaining Flag and neighbouring rows for review.
- `toolchain-limitation.txt`: unchanged Formatting.swift compile failure on Xcode 26.3. Xcode 26.1.1 failed at the same expression. Switched to Xcode 27.2 without altering unrelated source. iOS 26 rendering and physical-device behaviour are not verified.
- The existing whole form expands to 450 pt inside a 390 pt viewport at accessibility3, before and after this fix. Although Flag's complete text now fits vertically and remains readable, the outer chevron and other controls remain horizontally clipped. The floating Save button also already obscures some bottom content. These broader pre-existing issues were left unchanged and suggested separately.

The Flag fix therefore proves one-line fit where space permits, trailing value alignment and vertical accessibility growth. It does not claim to resolve the form's separate horizontal overflow.
