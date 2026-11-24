# Transaction form: Save floats over the form

Base revision: `ff538a1d` (main), plus the uncommitted change to `apps/ios/HowMuch/Views/TransactionFormView.swift`.

## Change

- Removed the 16pt clear-to-`Theme.canvas` gradient that `de4d59b2` laid over the bottom of the form's `ScrollView`. That gradient was the fuzzy band above Save with the keyboard up.
- Removed the solid `Theme.canvas` background from the Save row in `safeAreaInset(edge: .bottom)`, at YJ's request, so the button floats over the form with no bar behind it. The inset stays, so the last row can still scroll up clear of the button.
- Removed `.opacity(0.5)` from the disabled Save. Over scrolling content, a half-transparent button let the rows show through and "Save" was hard to read. The disabled `.glassProminent` style alone draws an opaque grey pill.

## Setup

- Amp Mac satellite, macos-27 image, Xcode 27.3, iOS 26.5 simulators: iPhone 17 (402x874pt) and iPhone SE (3rd generation) (375x667pt), hardware keyboard disconnected, `AccessibilityEnabled` and `ApplicationAccessibilityEnabled` set on both.
- A scratch XCTest (not committed) rendered `TransactionFormView(draft:isEditing: false)` from `SnapshotHarness` with a synthetic draft (amount 25.06, payee "Fixture Payee", memo "Outlet fixture memo"), in portrait and landscape, light and dark. It scrolled the form so its lower rows ran under Save, captured with the keyboard down, focused Memo to raise the system keyboard, and captured again. It ran a second time with no account, so Save was disabled. A shell loop took full-screen `xcrun simctl io <UDID> screenshot` captures, so the keyboard appears in them.
- The same run on the base revision gave the before captures.

## Results

| State | Before (main) | After |
| --- | --- | --- |
| Keyboard up or down, portrait and landscape, light and dark, both phones | Solid bar behind Save; the last row fades into a 16pt band above it | No bar and no fade; rows scroll behind the floating Save |
| Save position with the keyboard up | iPhone 17: portrait y 480.7 to 527.0, landscape 135.7 to 182.0. SE: portrait 348.5 to 395.0, landscape 110.5 to 157.0 | Same frames, all above the keyboard |
| Disabled Save (no account) | 50% opacity over a solid bar | Opaque grey glass pill, readable in light and dark |

Only `TransactionFormView` has this Save row. Add Transaction, Duplicate for Today, the transaction editor, Assistant's Add manually and the intake Fix sheet all use it, so they all get the change. The SE landscape fix `5a34c539` is in `CaptureComposerDock`, which this change does not touch.

## Checks

`SIMULATOR_UDID=<iPhone 17> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`, run after removing the scratch test:

- `runner: build-for-testing finished in 21s exit=0`, `products match this worktree`
- `Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected)` (the skipped test is the live Foundation Models test, which skips by default)

Screenshots are kept out of git and shown in the thread instead.
