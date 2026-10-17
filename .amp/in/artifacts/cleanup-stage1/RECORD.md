# Cleanup Stage 1: verification record

## Revisions

- Base: `main` at `84ffa96`.
- Branch: `claude/cleanup-refactor-e8gknk` at `7d11e14` (the commits before this record).

## TypeScript, web and worker

Run from the repository root on Linux, Bun 1.4.2.

| Check | Main | Branch |
| --- | --- | --- |
| `bun test` | 751 pass, 0 fail | 751 pass, 0 fail |
| `bun run --cwd apps/web build` (typecheck and bundle) | pass | pass |
| `bun run verify:worker` (`wrangler deploy --dry-run`) | pass | pass |
| `verify:ios-*` and `verify:cleared-status-toggle` scripts | pass | pass |
| `check:ios-engine` with Bun 1.4.0 | up to date | up to date after the rebuild commit |

`verify:ios-focus-zoom` needs `CHROME_PATH=/opt/pw-browsers/chromium` in this container, on main and on the branch. `verify:ynab-parity` needs a private database and export, so it was not run.

## Web pages, main against branch

Fixture: `control-howmuch launch`, which seeds `fixtures/demo-ledger.json` into a fresh SQLite file. One stack from a `main` worktree, then one from the branch, each driven by `capture-pages.mjs` in this folder:

```sh
control-howmuch launch
node .amp/in/artifacts/cleanup-stage1/capture-pages.mjs "$(control-howmuch state | jq -r .web_url)" <out_dir>
control-howmuch cleanup
```

The script signs in as `verifier`, then loads 13 routes (Ledger, Scheduled, Rewards, new reward card, the four reports, Spending over the demo date range, Settings, API tokens, Rewards import and quick entry) at 1280×900 and 390×844, and saves each page's `#root` markup and a full-page screenshot.

Expected: the same markup on main and the branch.

Observed: all 26 captures match once the checkout path in the logo URL is normalised. The only other difference is the API base URL on the API tokens page, which shows the stack's own random port. Five screenshots differ by a hover highlight on one table row, or by that port.

Screenshots: `/mnt/project-files/cleanup-stage1/main/` and `/mnt/project-files/cleanup-stage1/branch/` in the project files.

## iOS

Devin macOS runner, Xcode 27.0 RC (27A266a), iPhone 17 simulator with accessibility enabled as `apps/ios/AGENTS.md` describes.

| Check | Main `84ffa96` | Branch `7d11e14` |
| --- | --- | --- |
| `scripts/ios-xcodebuild.sh test` | 779 run, 778 pass, 1 skipped (opt-in live model test) | First full run: 779 run, 775 pass, 3 CaptureSnapshotTests failed with empty accessibility lookups, 1 skipped |
| `CaptureSnapshotTests` on their own | | 32 of 32 pass |
| `scripts/ios-xcodebuild.sh test`, second full run | | 779 run, 778 pass, 0 failed, 1 skipped |
| Unsigned generic device build | | succeeded |
| Periphery 3.8.0 scan | 43 results | 13 results, all reviewed false positives (App Intent descriptions, SwiftUI bindings, Hashable keys, test fixtures) |

The three CaptureSnapshotTests failures in the first full run did not recur: the same commit passed the whole class on its own and then passed a second full run with no failures. Main's full run was also clean. This reads as intermittent suite-level flakiness in those accessibility lookups, not a regression from this branch.
