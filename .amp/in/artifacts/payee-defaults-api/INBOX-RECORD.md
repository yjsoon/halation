# Payee defaults on Inbox intake, and two capture follow-ups (iOS)

- Base revision: 2c80350e plus this round's uncommitted changes
- Data: synthetic only (local-mode engine on the simulator)

## What changed

- Inbox intake (share sheet, Shortcuts, detected screenshots): new rows (New and Possible duplicate) take an empty category and flag from `AppModel.payeeDefaults`, in `IntakeCoordinator.propose`. A category the document named or a learned rule set is kept. The proposed draft takes the same values, so the review screen shows them as the suggestion and the row stays untouched. Lookups are cached per batch by payee and account.
- Moving a New row to another account clears a flag the owner left alone and fills that account's usual flag. A flag or category the owner chose is kept.
- A Fix (from a flip or a reviewer's edit) writes a category onto the saved transaction only when the document named it, a learned rule set it, or the owner chose it, never the history fill.
- Capture (Add Transactions): payee-default lookups are cached by payee and account for the life of the view, so many drafts for one payee, and the lookups that run again after each turn, ask once. `applyPayeeDefaults` also does nothing once the workspace no longer owns the session.

## iOS, Mac satellite (macos-27, iPhone SE simulator, local mode)

A temporary test in `LocalModeTests` (not committed) seeded `Verify Kopi` (Verify Coffee; Verify Card purple ×2, Verify Cash green) and an uncategorised Verify Kopi $7.00 row today. It wrote a text share `Verify Kopi $4.50 / Never Seen Shop $9.00 / Verify Kopi $7.00` to the Inbox and drained the real `IntakeCoordinator`.

1. Proposals: `add Verify Kopi cat=cat-verify-coffee flag=purple untouched=true`; `add Never Seen Shop cat=nil flag=none`; `possibleDuplicate Verify Kopi cat=cat-verify-coffee flag=purple`. Pass.
2. Move the 4.50 row to Verify Cash: `flag=green`, proposed flag green, category kept. Pass.
3. Owner picks blue, then moves back to Verify Card: stays blue. Pass.
4. Flip the 7.00 row to a Fix of the uncategorised row: `changedFields []`. With the old rule (`categoryID != nil`) the same run gave `[category]` and failed. Pass.
5. Approve: stored `Verify Kopi cat-verify-coffee blue`, `Never Seen Shop nil nil`. Pass.

The test host must be in the foreground: after repeated runs on one booted simulator it started in the background, and the Inbox put the read off until the app opened. Rebooting the simulator fixed it.

## Checks

- At base 2c80350e plus this round: `bun test` 769 pass 0 fail; web and worker typecheck; iOS confirm-presentation and disclosure-chevron lints. `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`: fresh build, 822 tests, 9 failures, all CaptureSnapshotTests with empty accessibility labels after a simulator reboot; rerunning CaptureSnapshotTests and RegisterSnapshotTests on the same build passed 33 of 33.
- Rebased onto origin/main 1f666fc8 (clean). At the rebased head: web and worker typecheck, iOS focus-zoom, confirm-presentation and disclosure-chevron lints, engine check up to date, `bun test` 770 pass 0 fail, and `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`: fresh build exit 0, 822 tests, 1 skipped, 0 failures.
