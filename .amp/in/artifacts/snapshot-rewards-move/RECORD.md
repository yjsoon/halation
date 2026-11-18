# Rewards travel with a ledger snapshot

Written on `b29e5d69`, then rebased onto `b18bd895` (origin/main) and rechecked there. Synthetic data only.

## What changed

- `howmuch-plan-snapshot` v1 gains an optional `rewards` section (`cards`, `settings`). Export writes it only when the plan has a live card on a live account or saved Rewards settings; import inserts the cards and the Rewards settings envelope in the same atomic write. Credential-like keys are dropped at any depth.
- The iPhone carries its local account arrangement (order, groups, favourites) to the server scope when a local ledger moves to a server; the first refresh uploads it, or applies the server's own when it has one.

## End-to-end check: local ledger moves to a server

`e2e.ts` loads the shipped engine bundle (`apps/ios/HowMuch/Engine/howmuch-engine.js`) over `bun:sqlite` with the bundled migrations, as `LocalEngine.swift` does, and drives it through `handle`. It builds a local ledger (one card account, one spend flagged red, a miles Rewards card with a red flag name, miles valuation 0.02), exports the snapshot from the engine, posts it to `import_snapshot` on a real `apps/api/src/server.ts` with an empty database (plan `e2e-server`), then reads the server's Rewards cards, settings and Rewards report.

```sh
.amp/in/artifacts/snapshot-rewards-move/e2e.sh after "$PWD"
git worktree add /tmp/move-e2e/main b29e5d69
.amp/in/artifacts/snapshot-rewards-move/e2e.sh before /tmp/move-e2e/main   # engine bundle from main
```

The server is this round's API in both runs; only the phone's engine bundle differs.

Expected: the server has the card and the settings, and its Rewards report matches the phone's.

Observed (`before.txt`, `after.txt`, each with a read of the server's SQLite file):

| | main engine | this round |
|---|---|---|
| `snapshot.rewards` | absent | 1 card, `{"milesValuation":0.02}` |
| `imported.rewards_cards` | 0 | 1 |
| `rewards_tracker_cards` rows | `[]` | 1 live row on `acct-e2e-card` |
| server Rewards report | `[]` | 63 miles, equal to the phone's |
| result | FAIL | PASS |

## Other checks

- `bun test`: 813 pass, 0 fail, including `snapshots cross backends > Rewards cards and settings move with the ledger` (SQLite to D1 and back; it failed before the change with the card, settings and report all missing).
- `bun run --cwd apps/web typecheck`, `bun run --cwd apps/worker typecheck`, `verify-ios-confirm-presentation`, `verify-ios-disclosure-chevron`: pass.
- `bun scripts/build-ios-engine.ts check` with Bun 1.4.0: up to date.
- `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on an Amp Mac satellite (Xcode 27.3, iOS 27.3 simulator), fresh build: 822 run, 10 failures, all in `CaptureSnapshotTests` with empty accessibility trees (new simulator). Rerun of `HowMuchTests/CaptureSnapshotTests`: 30 of 30 pass.
- After the rebase onto `b18bd895`: `bun test` 813 pass, both typechecks and the iOS source lints pass, engine bundle up to date, and `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` runs 822 tests with 0 failures (1 skipped).

## Not covered

- The account-arrangement carry-over was not driven in the Simulator UI; it is compiled and covered only by the existing account-preferences tests.
