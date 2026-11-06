# Risk-based test pruning ledger

Method: the rules in gauravmm/g9k-skills `minimal-risk-tests` (read, applied by hand, not installed), within the AGENTS.md testing policy. Builds on the 4 Nov pass (`c9d75ae7`), which optimised runtime and cut four cases; this pass does not repeat its decisions.

## Risk policy

Protected, keep a witness or bring the loss to YJ: auth, sessions and tokens; D1 atomic writes and leases; money and rewards calculations; YNAB API compatibility and parity; import security; capabilities the app deliberately withholds.

Removal categories: redundant (a retained test exercises the same path, boundary and assertion), configuration/constant pin, retired behaviour, upstream responsibility, accepted risk (named lost detection; outside protected areas only unless YJ accepts).

## Baseline

`origin/main` `faa4eadd`, Linux orb, Bun 1.4.4: `bun test` 823 pass, 0 fail, 68 files, 38.59 s (`/usr/bin/time -p`: real 38.84 s). The 4 Nov record measured 24 to 34 s on other orbs; compare within one orb only.

## Round 1: pilot

### `apps/web/src/lib/register-row-edit.test.ts` (56 to 51)

Owner: `apps/web/src/lib/register-row-edit.ts`, the register's inline edit state machine and commit planner.

Retained: amount entry parsing and its storage cap, rounding and comma-plan cases (money); every `planRowCommit` case (field diffing, sign from the filled column, transfer and split integrity, approval); `beginRowEdit` refusals and seeding; the reducer's begin-is-idle-only and ignore-out-of-state matrix (edits during commit must not be lost); payee list self-transfer and closed-account omissions; `rowFieldWritable` on a regular row with a transfer draft and on a transfer split line.

| Removed | Category | Detection lost |
| --- | --- | --- |
| `registerRowDomId` format | Constant pin | Exact DOM id spelling. The id is only compared with itself and with a mirror in `halation-bloom.ts` that this test never checked; a drift there shows as no bloom after save. |
| `sameRow and rowId` | Accepted risk (UI) | A split line and its parent being treated as one row would open or highlight the wrong editor. Visible on the first split edit in the transactions-register recipe. |
| `focusForRowError` | Accepted risk (UI) | Keyboard focus after a validation error could land on the wrong field. The message is still shown and nothing is written. |
| `sessionRowGone` | Accepted risk (UI) | A row deleted elsewhere while being edited could leave an orphan editor; saving it fails at the server, which owns the write. |
| `rowFieldWritable` on a saved transfer | Redundant | `beginRowEdit` "keeps payee focus on a saved transfer and snaps category onto date" covers the same focus decisions, and `planRowCommit` "does not patch payee or category on a transfer posted row" covers the locked category through the same predicate. |

Validation: `scripts/check.sh` at rebased head `d137f7a8` (base `faa4eadd`): `bun test` 818 pass, 0 fail, 68 files, 33.31 s; web and worker typechecks pass; `check: pass`. Pushed to `main` as `d137f7a8`. No GitHub workflow runs on `main` pushes.

## Round 2

### `apps/api/tests/api.test.ts` (95 to 93)

Owner: the account PATCH route in `apps/api/src/http.ts` and the SQLite repository. Every YNAB-compatibility, transfer, split, schedule, reconciliation, import, auth and transition-lock case in this file was read and retained.

| Change | Category | Detection lost |
| --- | --- | --- |
| Removed "rejects on_budget alone" | Redundant | None. The same `hasOwnProperty("on_budget")` guard runs before any other check and is witnessed by "rejects a type patch that also sends on_budget". If that guard were narrowed to type patches, an `on_budget`-only body still writes nothing (the empty-patch guard rejects it with 400), so the withheld capability stays witnessed. |
| Removed "patches checking to savings and keeps on_budget and balances" | Redundant | None. Its assertions (name, `on_budget: true`, balance and cleared balance unchanged after checking to savings) moved into "follows the type default icon and keeps a custom icon", which already made the same PATCH. The mortgage case still witnesses derived `on_budget: false`. |
| "rejects an unknown type" now checks the message prefix, not the full list of kinds | Constant pin | The full kinds list, which is built from `ACCOUNT_KINDS`. The 400 and the start of the message remain. |

### `apps/api/src/categoriser.test.ts` (20, unchanged count)

"normalised payee retrieval is bounded and shared by all targets in a batch" asserted the exact spy call list (`{ q: "seve", limit: 150 }` then eight `{ payeeId, limit: 50 }`). It now asserts the contract those pinned: one payee scan for the batch, at most nine history reads for two targets (unshared reads would be eighteen), every read bounded by a limit of at most 150, plus the unchanged evidence result. Category: mock call shape and constant pin. Lost: the exact search stem and page sizes, which are tuning.

### `apps/web/src/lib/schedules.test.ts` (3 to 2)

| Removed | Category | Detection lost |
| --- | --- | --- |
| "formats API recurrence values and transfer destinations for register rows" | Constant pin | The display strings for two recurrence values and the "Transfer to" label template. |

Retained: active-schedule scoping and sort, and the split-total amount (money).

### `apps/ios/HowMuchTests/ChartSpeechTests.swift` (10 to 8)

| Removed | Category | Detection lost |
| --- | --- | --- |
| `testEmptySeriesSaysSo`, `testPairedEmptySeriesSaysSo` | Constant pin | The "No data yet." VoiceOver string. The empty guard itself is required by the compiler (`guard let last`), so a crash on an empty chart is not a plausible regression. |

Retained: the single-period, range, tie-breaking, unnamed-series and 52-week brevity cases, which are the failure modes the file header names.

## Inspected and retained without change

These files were read in full this pass. Each test names a distinct failure mode in a protected area or an edge the E2E recipes miss, so no cut met the marginal-value bar:

- Web: `dates`, `reward-tools`, `reward-flag-names`, `rewards-export`, `auth-failure`, `filters`, `new-account`, `unapproved-badge`, `register-current`, `category-suggestions`, `prefs`, `starter-categories`, `rewards-tile`, `account-groups`.
- API and scripts: `account-icon`, `payee-names`, `reward-tools-http`, `rewards/account-config`, `rewards/parse`, `plan-export` (both), `account-basics`, `scripts/speedflight`, `scripts/verify-ios-disclosure-chevron`, `scripts/import-security`, `apps/worker/src/security-headers`.
- iOS: `IntentCatalogTests`, `APISettingsTests` (first cases), `CaptureAITests` (catalog case).

Test names only (not yet read case by case): the rest of `api.test.ts` and `d1.test.ts`, `migrations`, `category-management`, `security-boundaries`, `reward-tools-contract`, `reward-tools`, and the remaining web state and register files. Almost all sit in protected areas (D1 atomic writes and leases, YNAB parity, auth, rewards maths). The remaining 43 iOS files were checked by test name and short-body scan only.

## Proposals needing YJ's decision (not landed)

P1. `account-basics.test.ts` runs every case on SQLite and D1. Its two rate-limit cases ("wrong current passwords are rate limited on their own budget", "anonymous failed logins ... do not block the owner") make 11 to 13 production-cost scrypt checks each and take about 8.5 s of the suite's roughly 33 s across both backends. Running them on SQLite only would save about 4.3 s (13 %). Lost detection: a D1 rate counter that increments but fails to reach the 429 threshold, or resets between attempts within one window. `d1.test.ts` "D1 auth setup is atomic, one-time, and uses returning rate counters" still checks that the D1 counter returns 1 then 2, but not the threshold or the separate password-change key. This is an auth accepted risk, so it needs YJ.

## Round 2 validation

Rebased head: round 2 on `origin/main` `d714f021` (one docs-only upstream commit).

- `scripts/check.sh` on the Linux orb: `bun test` 815 pass, 0 fail, 68 files, 34.46 s; web and worker typechecks pass; `The iOS engine is up to date.`; then `check: iOS files changed; rerun scripts/check.sh on an Amp Mac satellite`, exit 1 by design.
- The Mac satellite (mac.medium, macos-27, Xcode 27.2) mirrors the worktree without `.git`, so `check.sh` cannot compute its path diff there. Ran its iOS step directly: `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` after enabling simulator accessibility. Fresh build (`build-for-testing succeeded; products match this worktree`), `Executed 823 tests, with 1 test skipped and 0 failures`, 147.1 s, `TEST EXECUTE SUCCEEDED`. An earlier run on the pre-rebase worktree also passed (823 tests, 154.0 s). `ChartSpeechTests.swift` SHA-256 `42e1addd58ecdd6f7b91f6ddc29795b98ff3d21b050c64d6b939cdb519ac6529` on both machines. The skipped case is the live-model check gated on `HOWMUCH_LIVE_MODEL_VERIFY=1`.

## Counts and runtime

| Suite | Before (`faa4eadd`) | After | Change |
| --- | --- | --- | --- |
| `bun test` | 823 tests, 68 files | 815 tests, 68 files | -8 |
| HowMuchTests | 825 tests (823 + the 2 removed; only `ChartSpeechTests` changed) | 823 tests, 1 skipped | -2 |

Runtime, same orb, alternating order: baseline `faa4eadd` 32.20 s and 34.78 s; after 34.15 s and 34.83 s (other after runs 33.02 to 34.46 s; the very first baseline run was 38.59 s). There is no measurable Bun runtime change: the removed cases took well under 0.1 s together, and run-to-run noise is about 2 s. iOS XCTest time (147 to 154 s here) is likewise unchanged by two sub-millisecond cases. The runtime lever left in Bun is P1 above, which needs YJ's decision.
