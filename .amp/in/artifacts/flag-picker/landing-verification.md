# Flag picker: integrated landing verification

## Revision, authority and scope

- Tested implementation commit: `aac9ff26bc9f38077fbea7bde763636e537a5c90`.
- Integrated upstream base: `13d00325e6015562b7563a9e83d3e0d0888c8c55`.
- Thread branch: `ios-flag-picker-layout` in `yjsoon/howmuch`.
- User authorised the scoped merge and explicitly approved the repository-specific merge-commit procedure instead of generic `land.py`. No app release, tag, deployment or Slack post is authorised.
- This record is written before branch push and independent review. Required reviewer launch: Claude Code subscription external-agent orb, Opus 5.5, high effort. Its returned verdict and the final merge identity belong in the thread's delivery receipt.

The next commit contains evidence only under `.amp/in/artifacts/`. The tested production source and regression test are unchanged by that commit. Their SHA-256 values remain those in `verification.md`.

## Fresh native run

On 2026-11-03, a fresh Amp Mac satellite with Xcode 27.2 (27B48), iOS 27.2 and the wrapper-selected iPhone SE (3rd generation) simulator rebuilt the integrated worktree. The native test harness renders the transaction form at 390 × 844 points, independently of the simulator device's screen dimensions.

```sh
UDID="$(scripts/ios-xcodebuild.sh destination)"
xcrun simctl boot "$UDID" # Already booted is harmless.
xcrun simctl bootstatus "$UDID" -b
xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility AccessibilityEnabled -bool true
xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility ApplicationAccessibilityEnabled -bool true
scripts/ios-xcodebuild.sh test -- \
  -only-testing:HowMuchTests/CaptureSnapshotTests/testMappedFlagUsesAvailableWidthAndAllowsAccessibilityGrowth \
  -only-testing:HowMuchTests/CaptureSnapshotTests/testAddAndEditTransactionFormRowsShareHeightAndOrder \
  -only-testing:HowMuchTests/CaptureSnapshotTests/testAddManuallySavesOnceAndCancelPreservesConversation
```

Observed: build-for-testing finished in 174 seconds, exit 0; then test-without-building finished in 31 seconds, exit 0. **Executed 3 tests, 0 failures**, including all seven Flag states. Command-generated output is in `flag-landing-evidence/test-output.txt`.

The fixture replaces rewards HTTP only, mapping red to Groceries/Food, green to Meals and blue to Household essentials and weekly provisions. The real SwiftUI form, Menu/Picker, text layout, accessibility tree and row measurement are exercised. OCR reads only pixels inside the Flag row, so overflow into Memo cannot pass as complete text. This is native UI integration verification, not a full local-server E2E run or physical-device validation. The neighbouring manual Save/Cancel test exercises the existing real outbox; it is not proof of server persistence of the Flag selection.

## Observations and visual inspection

- Meals and Groceries/Food at normal size: both 52 pt tall; mapped name stays on one line.
- Meals and Groceries/Food at xxxLarge: both 53.5 pt tall; mapped name stays on one line.
- Long synthetic name at normal size: 68.5 pt; complete value wraps within the row.
- Groceries/Food at accessibility3: 122 pt; complete two-line value stays above Memo.
- Long synthetic name at accessibility3: 218 pt; complete value grows vertically above Memo.
- Caption remains readable and values remain trailing-aligned. No single-line limit, truncation or minimum font scaling was introduced.

All seven full captures are in `flag-landing-evidence/`; `manifest.json` maps exported filenames to test states, with device identifiers removed. Focused `*-row.png` crops show normal mapped, xxxLarge mapped, normal long, accessibility mapped and accessibility long states. These five crops were inspected with explicit state labels. An initial unlabelled contact sheet was misidentified by the media reader, confusing accessibility3 with xxxLarge; direct inspection of the named xxxLarge full capture and the explicitly labelled crops confirmed the one-line result reported by OCR.

The historical real-pointer recording `flag-interaction-final.mp4` was re-inspected: the pointer crosses neighbouring rows, opens Flag, passes other menu options, selects Meals, observes the green Meals row and clicks Save. Its original validation asserted the submitted draft's flag was green. This predates upstream integration; the fresh run above supplies integrated-revision layout and neighbouring Save/Cancel coverage. The production Flag source is byte-identical between those runs.

## Limitations and nearby pre-existing behaviour

Historical before/after reproduction, rejected modifier-only alternatives and pointer assertions are preserved in `verification.md` and `flag-proof/verification-output.txt`. Neither screenshot data nor real accounts were copied into fixtures.

At accessibility3, the pre-existing whole form expands to 450 pt in a 390 pt viewport, clipping some outer controls. The floating Save button also overlaps bottom form content. These are unchanged and were separately suggested, not fixed in this scoped change. Xcode 26.1.1/26.3 failed on unchanged Formatting.swift; the passing native evidence uses 27.2. No claim is made for iOS 26 rendering or a physical phone.

## Landing checks to retain

The remote default was confirmed as `main`. GitHub classic protection and effective-rule reads returned 403, so their absence cannot be asserted. The approved repository-specific procedure still requires a normal, non-force push and must stop on any host rejection; no bypass is authorised. The repository has tag/manual deployment and manual D1-validation workflows, not a branch-push app-release workflow. Subscribe to exact pushed-commit CI results and inspect status checks before merging. Verify every branch/main push with `git ls-remote`, then fetch and confirm the reviewed head is an ancestor of remote main.
