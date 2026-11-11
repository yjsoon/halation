# Settings copy trim

Revision: base `7fabf0aa`, this round's commit on top.

## What changed

Over-explaining help text in iOS Settings (Capture, Reminders, Data footers), iOS Rewards import, Rewards display preferences, AI provider, Skill & Memory, the skill file footer, web Settings (intro, password, currency, formats, export, tools list) and web Rewards import was cut to short, plain lines. Facts kept were checked against code: reminders are planned only for the current and next statement cycle with no background refresh (`CardPaymentPlanner`, `CardPaymentNotifier`), so the monthly-open line stays; re-importing a Rewards Tracker export upserts by original ID (`apps/api/src/importers/rewards-tracker.ts`); exports exclude passwords and tokens.

## Steps

- Web: `control-howmuch launch`, first-owner setup as `verifier`, open `/settings` (full page) and `/import/rewards` at 1280x900@2x with the old copy stashed, then again with the new copy.
- iOS before: owner's device screenshot (local mode, dark).
- iOS after: a throwaway `SnapshotSurface` test rendering `SettingsView` in local mode, dark, 440pt wide, on iPhone SE (3rd gen) simulator, iOS 27.3; the test was deleted afterwards.

## Expected and observed

| Surface | Expected | Observed |
| --- | --- | --- |
| iOS Capture footer | `Checks your clipboard only, never your Photos library.` | matches |
| iOS Reminders footer | `Open Halation at least once a month to keep reminders coming.` | matches |
| iOS Data footer | `Exports never include passwords or tokens.` | matches |
| Web Export note | same line as iOS | matches |
| Web Rewards import | no `does not connect to YNAB`, no `soft-deleted` / `finite number` | matches |

## Checks

- `bun test`: 809 pass, 0 fail. Web and worker `tsc --noEmit` clean.
- `scripts/ios-xcodebuild.sh test`: 825 tests, 1 skipped (opt-in live Foundation Models), 0 failures, including `ScreenshotOfferTests.testRenderedClipboardSettingsAndDismissedToast`, which now OCRs `photos library`.

## Captures

- `ios-settings-before.jpg`, `ios-settings-after.jpg`
- `web-settings-before.jpg`, `web-settings-after.jpg`
- `web-rewards-import-before.jpg`, `web-rewards-import-after.jpg`
