# Close, reopen and delete from the iOS Edit Account sheet: validation record

Revision: uncommitted round on top of 54a58452 (main), 2026-11-15. Amp Mac satellite, Xcode 27.3, iPhone simulator 9A050B8E (accessibility enabled per apps/ios/AGENTS.md).

## Through the bundled backend (local mode)
A temporary XCTest, removed before commit, drove `APIClient` -> `LocalEngine` -> bundled API -> SQLite with synthetic accounts "Synthetic Used" (checking, one transaction) and "Synthetic Empty" (autoLoan, no transactions).

| Step | Expected | Observed |
| --- | --- | --- |
| `setAccountClosed(true)` on Synthetic Used | `closed` true, name kept | closed true, name "Synthetic Used" |
| `setAccountClosed(false)` | `closed` false | closed false |
| `deleteAccount` on Synthetic Used | 409 mapped to `APIClientError.conflict` | "This account has transactions, transfers or scheduled transactions. Close it instead to keep its history." |
| `deleteAccount` on Synthetic Empty | removed from the account list | list holds only Synthetic Used |

## Rendering
A temporary snapshot test, also removed, rendered `EditAccountSheet` at 393x852 for an open and a closed savings account in light and dark. Open accounts show Close Account and Delete Account under the Icon row, with the note "Close an account you no longer use. Its history stays and it moves under Closed." Closed accounts show Reopen Account with "Closed: kept under Closed with all its transactions. Reopen it to record new ones." Screenshots stay out of git.

## Checks
- `scripts/check.sh` on Linux: bun test 810 pass, web and worker typecheck clean, verify-ios-confirm-presentation and disclosure-chevron pass; stops at the iOS step as designed.
- `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` (fresh build-for-testing): 825 executed, 0 failures, 1 skipped.

Not exercised: tapping through the sheet in the running app against a live stack, and the delete alert itself (a `binaryConfirm` alert, which the snapshot harness does not render).
