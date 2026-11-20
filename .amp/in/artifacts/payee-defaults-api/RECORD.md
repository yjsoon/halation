# Payee defaults on API-created transactions (server, iOS on-device engine, iOS capture)

- Base revision: 5bdf46dd plus this round's uncommitted changes
- Data: synthetic only (`fixtures/demo-ledger.json` plus the rows below)

## Server, real Worker on local D1

Stack: `control-howmuch launch` (wrangler dev, local D1, migrations through 0024), owner `verifier` through `POST /api/auth/setup`, bearer token from `POST /api/auth/token`. Script: `.amp/in/orb-backup/verify-api-defaults.sh <api_url>`.

Seed, payee `Verify Kopi`, category `cat-groceries`: acct-credit (Travel Card) purple 2026-11-01, purple 11-03, red 11-05; acct-everyday green 11-06. Rewards card `card-verify` on acct-credit names purple `Transport`.

| Case | Request | Stored category / flag / flag name | Result |
| --- | --- | --- | --- |
| 1 | `POST /transactions`, acct-credit, payee `verify kopi`, no category or flag key | cat-groceries / purple / Transport | Pass |
| 2 | `POST /api/mobile/quick-entry`, acct-everyday, keys left out | cat-groceries / green / null | Pass |
| 3 | Same, both routes, `"category_id": null, "flag_color": null` | null / null | Pass |
| 4 | Explicit `cat-dining`, `blue` | cat-dining / blue | Pass |
| 5 | Batch: acct-saver (no flag history) and an unknown payee | cat-groceries / null; null / null | Pass |
| 6 | `POST /api/import/csv`, Verify Kopi | null / null (imports are not filled) | Pass |

## iOS, on-device engine and capture (Mac satellite, macos-27, iPhone SE simulator)

A temporary test in `LocalModeTests` (not committed) drove `LocalEngine` → bundled engine → SQLite, then the real `AddTransactionsView` over a local-mode `AppModel`. Seed: `Verify Kopi`, Verify Card purple ×2 (Verify Coffee), Verify Cash green ×2 (Verify Other, Verify Coffee).

1. Engine `POST /transactions`, card, keys left out: `cat-verify-coffee purple`. Pass.
2. Engine quick entry, cash, keys left out: `cat-verify-coffee green`. Pass.
3. Engine explicit nulls: `null null`. Pass.
4. Capture drafts: one with no category, one whose category the capture named but could not resolve. Result: `cat=cat-verify-coffee flag=purple` and `cat=nil flag=purple`; the card shows `Verify Coffee · Verify Card` and `Uncategorised … Choose a category`. Screenshot inspected: `payee-defaults-capture.png` (not committed). Pass.
5. Saving the first draft through the outbox stored `cat-verify-coffee purple`. Pass.

## Checks

- `bun test`: 769 pass, 0 fail. The new HTTP test failed before the change.
- `apps/web` and `apps/worker` typecheck clean; `scripts/build-ios-engine.ts check` (Bun 1.4.0): up to date.
- `scripts/ios-xcodebuild.sh test`: fresh build-for-testing exit 0; 822 tests, 1 skipped, 0 failures. On the first run, `testBusyUndoInMultiGroupFooterDoesNotMutate` caught capture recording a suggestion while a turn was in flight. Capture now skips the lookups while a turn is busy and runs them again when it ends, and changes the revision only when a draft changes. The other nine first-run failures were the new simulator's accessibility, which cleared after enabling it and rebooting.
- The capture checks above ran before that busy-turn guard, which affects only busy sessions.

## Review round (Claude Fable 5.2) and landing

- Fixed: a `payee_id` with a differing typed `payee_name` now looks up the payee record's name (new assertion in the HTTP test failed before the fix); a `flag_name` sent without `flag_color` keeps the flag unfilled; the doc and comment now say an explicit null still goes to Jev when it is configured; the HTTP test gives the card account a rewards card and asserts the stamped `flag_name`.
- Left as follow-ups (iOS, low): cache capture lookups by payee and account so many drafts make fewer requests, and add `admitted` to the `applyPayeeDefaults` guard. Inbox intake approvals (share sheet, screenshots) are not filled, like imports.
- Rebased onto origin/main ee08a14c; the engine bundle was rebuilt (its only conflict, on the earlier base 9bfd27a8). At the rebased head: web and worker typecheck, iOS focus-zoom, confirm-presentation and disclosure-chevron lints, engine check up to date, `bun test` 769 pass 0 fail, and `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on a Mac satellite: fresh build exit 0, 822 tests, 1 skipped, 0 failures. (On the 9bfd27a8 base, a new simulator first gave 9 CaptureSnapshotTests failures with empty accessibility labels; a rerun of the snapshot suites passed 33 of 33.)
