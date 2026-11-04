# Test runtime audit

## Revisions and environment

- Baseline: `90e283dcdcdf96117ac632ce98edba6747a84930`.
- Tested change: `9d6e9f92deac71a39c5d877261b64f1a6d0f37bc`.
- Linux Amp orb, Bun 1.4.4, existing frozen dependencies.
- Synthetic in-memory SQLite databases and the existing SQLite-backed fake D1 binding. No remote databases, deployment or publication.
- Test-only fixture change and README commands. No production code or test cases removed.

## Repeatable checks

From the repository root, run `/usr/bin/time -p bun test`. The baseline repeat used a detached worktree at the baseline revision with `bun install --frozen-lockfile`. Runs were sequential on the same orb, not concurrent.

| Run | Revision | Expected and observed | Wall time |
| --- | --- | --- | --- |
| Baseline | `90e283dc` | 823 pass, 0 fail, 68 files | 34.98 s |
| Changed working tree | Same code as `9d6e9f92` | 823 pass, 0 fail, 68 files | 26.41 s |
| Committed change | `9d6e9f92` | 823 pass, 0 fail, 68 files | 25.07 s |
| Baseline repeat | `90e283dc` | 823 pass, 0 fail, 68 files | 33.17 s |

The two-run mean decreased from 34.08 s to 25.74 s, about 24%. This is a local measurement, not a CI or iOS runtime claim. A first attempt in the detached worktree lacked workspace dependencies and was discarded; installing the frozen dependencies resolved it.

`/usr/bin/time -p bun test apps/web packages` passed all 351 tests across 36 files in 0.67 s on the changed code. This scoped command does not exercise the entire API or iOS suites.

## Coverage preserved

The 24 account-basics tests retain all their scenario assertions. Their summed reported case times fell from 18.26 s to 12.04 s in the first comparison. Previously 18 cases each performed one setup and two login requests just to obtain sessions. They now share one real production-cost password credential but create fresh sessions in a fresh database for each case. The requests under test still execute the real handlers, password verification and selected SQLite or D1 auth store.

The fixture uses SQLiteAuthStore to seed the SQLite database beneath either backend. This no longer incidentally tests D1 setup in every password-change scenario. Dedicated coverage remains: the delayed-login case in account-basics still uses the real setup route on both backends, api.test.ts covers setup and login, and d1.test.ts covers successful D1 store setup and refusal of tokenless Worker setup. Password-change checks still prove old-password rejection, new-password acceptance, cookie and bearer rotation, personal-token survival, throttling and stale concurrent credential writes.

No browser recipe was rerun: application code and UI are unchanged. The relevant executable verification here is the real-handler and persisted-state suite being optimised, not a replacement claim for browser E2E or remote D1.

## Native timing audit

Ran `scripts/ios-xcodebuild.sh test` at `3f660accce47d1c2bbf858bfc36d1223fe2abb71` on an Amp mac.medium satellite, macos-27, Xcode 27.2, Debug HowMuch scheme, iPhone SE (3rd generation) simulator. Enabled the two simulator accessibility preferences required by apps/ios/AGENTS.md before execution. Used the wrapper's ad-hoc simulator signing and default DerivedData; no certificates or publication.

- Fresh build-for-testing: 159 s, exit 0; wrapper confirmed products match this worktree.
- Test-without-building stage: 201 s, exit 0, TEST EXECUTE SUCCEEDED.
- XCTest: 827 tests, 1 skipped, 0 failures, 179.185 s elapsed.
- The skipped case is `CaptureInterpreterTests/testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery`, which explicitly requires `HOWMUCH_LIVE_MODEL_VERIFY=1`. No live-model coverage is claimed.

| Rendering cases | Count | Summed test execution |
| --- | --- | --- |
| CaptureSnapshotTests | 33 | 103.300 s |
| RewardsSnapshotTests | 10 | 35.060 s |
| RewardRowProjectionTests/testStatusRowsRenderLightDarkAndLargeText | 1 | 13.182 s |

These 44 cases consume about 85% of test execution time. The slowest individual case is `RewardsSnapshotTests/testCategoryDetailFitsContentAndScrollsOnlyWhenNecessary` at 17.067 s. It renders five sheet variants, measures content and scrolling, waits for presentation, and repeatedly recognises screenshots. These are application layout checks, not simply tests of SwiftUI itself. Optimise or scope this rendering work before deleting fast logic tests; no native cases were removed or changed in this round.

Then ran the README's scoped example, `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/RegisterApprovalTests`, on unchanged code and warm DerivedData. Build-for-testing took 3 s; test-without-building took 5 s; 7 tests passed, 0 failed. This is an iteration example, not full-suite coverage or a cold-build comparison.

## Independent review and delivery

Both read-only reviewers inspected base `90e283dc` through head `3f660acc` and returned clean verdicts with no blocking findings:

- Opus 5.5, launched at max effort: thread `T-01a1a531-6ebe-71ba-99bc-3ec0f673bc56`. Independently reproduced 823 passing tests and approximately 23% full-suite speed-up over two runs per revision.
- Fable 5.1, launched at high effort: thread `T-01a1a531-7701-7360-9fc0-d183cded7e21`. Independently reproduced 823 passing tests, and account-basics improved from 24.72 s to 16.49 s on its orb. Corrected its wording finding about Worker setup above. Retained the lazy credential cache and local fixture rather than broadening the shared harness for optional simplifications.

This final artefact update changes no tested code and requires no re-review under the repository procedure. Landing is blocked: GitHub returns 403 for branch protection and effective branch rules, and the router records `branch_protection_unknown`. Commits remain local; no branch or main push, merge, deployment or publication occurred.

## Audit limits and recommendations

- Inspected the measured hotspots, web helpers and selected iOS tests. This is not a case-by-case certification of every test.
- Web/helper cases are cheap: the original web case timings totalled about 0.43 s. Removing them wholesale would not address the main Bun bottleneck.
- Existing history includes `742009f4`, which already removed duplicate web tests and repaired assertions that could not fail, and `9a8d6165`, which pruned IntakeSkillTests. Do not repeat those deletions by assuming every simple remaining test is redundant.
- Keep password races, malformed persisted payloads, money/date boundaries and partial-write checks. These assert application contracts, not merely language or framework behaviour.
- The iOS tree has 46 test files. The full suite was run and its hotspots inspected, but native tests were not changed and no native implementation speed-up is claimed.
- Use scoped Bun paths and Xcode `-only-testing` while iterating, then run the checks required for the affected contracts and landing. Do not use global concurrency: several web tests replace process-global fetch, storage and money configuration.
