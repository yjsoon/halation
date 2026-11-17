# Accounts row highlight: no rounded corners of its own

Revision: origin/main b29e5d69 plus the uncommitted `ynabCard()` change in `apps/ios/HowMuch/Views/Components.swift`.

## Cause

`ynabCard()` drew the card with `background(Theme.card, in: RoundedRectangle(...))`. That form also makes the card the container shape, so a row's own `.background(colour)` inside it (the selected tint in Accounts, and the pressed tint of `CardRowButtonStyle`) was drawn as a 16pt rounded rectangle instead of filling the row. Reproduced with a three-row stack and no Accounts code: only `background(_:in:)` rounds the inner fill; `.clipShape` alone does not.

## Fix

The card is drawn as a filled `RoundedRectangle` shape view in `background { }`, then clipped as before. Rows now fill edge to edge, and only the card's clip rounds the first and last rows.

## Setup

Mac satellite, Xcode 27.3 beta, `scripts/ios-xcodebuild.sh`. Synthetic accounts Everyday, Rainy Day and Travel in one Cash group (SnapshotHarness, no server). A scratch render test, since removed, put `AccountsView(usesSplit:)` in a window at the device's screen size, light and dark, with each account selected in turn.

Devices: iPhone Duo (iOS 27.2, E9F9A68C), split sidebar layout. iPad Pro 13-inch M5 (iOS 27.2, FC0CF0E1), portrait and landscape.

## Observed

- Before: every selected row was a rounded pill, inset from the separators, on the Duo and on the iPad in both orientations, in light and dark.
- After: every selected row is a plain full-width band. First and last rows take the card's corners from the clip; middle rows are square.
- Images (not in git): duo-split-before-after.png, ipad-portrait-before-after.png, ipad-landscape-before-after.png. Left is before, right is after.

## Tests

- `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on iPhone 18 Pro (iOS 27.2, CC1F9A87): 822 tests, 1 skipped, 0 failures.
- On the iPhone Duo simulator the same suite has 10 failing tests (tab row and compact sheet geometry). The identical 10 fail with the fix stashed, so they predate this change.

## Not covered

The half-folded Duo posture could not be simulated. The fix changes the card itself, not the layout, so the fold only changes the column width.
