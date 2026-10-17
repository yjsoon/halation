# Cleanup Stage 2: verification record

## Revisions

- Base: `main` at `f548c8e` (Stage 1 merged).
- Branch: `claude/cleanup-refactor-e8gknk` at `acda374` (the commits before this record).

## TypeScript, web and worker

Run from the repository root on Linux, Bun 1.4.2.

| Check | Main | Branch |
| --- | --- | --- |
| `bun test` | 751 pass, 0 fail | 751 pass, 0 fail |
| `bun run --cwd apps/web build` (typecheck and bundle) | pass | pass |
| `tsc --noEmit --noUnusedLocals` in `apps/web` | | clean |
| Strict `tsc` over `apps/api`, `scripts`, `packages` (no project script; temporary config) | 31 errors | the same 31 errors, none new |
| `bun run --cwd apps/worker build` (`wrangler deploy --dry-run`) | pass | pass |
| `verify:ios-*`, `verify:cleared-status-toggle` and `verify:worker` scripts (`CHROME_PATH=/opt/pw-browsers/chromium`) | `verify:ios-focus-zoom` pass | all pass |
| `check:ios-engine` with Bun 1.4.0 | up to date | up to date (rebuilt in the wire types commit) |

The 31 strict `tsc` errors on main are in tests, the worker's Cloudflare globals and two scripts. They are not part of any build and are left alone.

### Stylesheet split

`bun run --cwd apps/web bundle` before and after the `app.css` split: all three built CSS files (`index-DX-I2Fdr.css`, `Rewards-DofiIMFQ.css`, `reward-tools-Dgvv72yR.css`) are byte-identical (`cmp`).

## Web pages, main against branch

Fixture: `control-howmuch launch`, which seeds `fixtures/demo-ledger.json` into a fresh SQLite file. Each stack is launched with the `control-howmuch` script from its own checkout, because the script serves the checkout it lives in:

```sh
<checkout>/.cursor/skills/verify-howmuch/bin/control-howmuch launch
U=$(<same script> state | jq -r .web_url)
node .amp/in/artifacts/cleanup-stage1/capture-pages.mjs "$U" <out_dir>
node .amp/in/artifacts/cleanup-stage2/capture-organiser.mjs "$U" <out_dir>
<same script> cleanup
```

`capture-pages.mjs` loads 13 routes at 1280×900 and 390×844. `capture-organiser.mjs` opens the account organiser from the sidebar and saves the dialog.

Expected: the same markup, except the organiser class names and ids that moved to British spelling (`account-organizer*` to `account-organiser*`, `organizer-*` to `organiser-*`).

Observed, after normalising the checkout path and port:

- The two Add pages match exactly.
- The other 24 pages differ only in the two Organise buttons: `mobile-organizer-entry` and `account-organizer-entry` became `mobile-organiser-entry` and `account-organiser-entry`.
- The organiser dialog differs only in the renamed classes and ids (20 attributes). Its screenshot is pixel-identical, so the renamed CSS selectors still apply.
- 23 of 26 page screenshots are pixel-identical. API tokens differs by the stack's port, Net worth by the sidebar's entry animation caught at a different frame, and Income by two pixels.

Screenshots and markup: `/mnt/project-files/cleanup-stage2/` in the project files.

## iOS

Devin macOS runner, Xcode 27.0 RC (27A266a), iPhone 17 simulator, as `apps/ios/AGENTS.md` describes.

| Check | Main `f548c8e` | Branch `acda374` |
| --- | --- | --- |
| `scripts/ios-xcodebuild.sh test` | Stage 1 head `1c07984`, same code: 779 run, 778 pass, 1 skipped | 779 run, 778 pass, 0 failed, 1 skipped (opt-in live model test) |
| Unsigned generic device build | succeeded at Stage 1 | succeeded |
| Periphery 3.8.0 scan | 13 results | the same 13 results, all reviewed false positives |

The build compiles the six Models files from the hand-written `project.pbxproj` entries, and the full suite includes `CaptureSnapshotTests`, which exercise the merged capture-blocking modifier.
