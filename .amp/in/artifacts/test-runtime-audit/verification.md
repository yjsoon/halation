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
- The first round inspected the 46 iOS test files without changing native tests. The follow-up below optimises the measured rendering hotspots.
- Use scoped Bun paths and Xcode `-only-testing` while iterating, then run the checks required for the affected contracts and landing. Do not use global concurrency: several web tests replace process-global fetch, storage and money configuration.

## iOS rendering optimisation

- Baseline for this round: `c5e0583dbad10db92d04dfb68a8e61146c30ea4b`, including a clean merge of `origin/main` at `45b6896e`.
- Tested implementation: `4f677aa8abfc0d7cede21c38c9302d30b4105ba4`.
- Same Amp mac.medium satellite, Xcode 27.2, Debug HowMuch scheme and iPhone SE (3rd generation) simulator as above. Existing synthetic fixtures, enabled accessibility and warm DerivedData. Runs were sequential, with no concurrent builds.
- Command for every full run: `scripts/ios-xcodebuild.sh test`. Every run rebuilt successfully before executing, so none reused stale test products.

| Run | Build stage | Test stage | XCTest elapsed | Result |
| --- | --- | --- | --- | --- |
| Fresh control at `c5e0583d` | 14 s | 211 s | 196.511 s | 827 tests, 1 intentional skip, 0 failures |
| Final working tree, identical code to `4f677aa8` | 20 s | 180 s | 163.176 s | 827 tests, 1 intentional skip, 0 failures |
| Exact commit `4f677aa8` | 13 s | 182 s | 165.906 s | 827 tests, 1 intentional skip, 0 failures |
| Control repeat at `c5e0583d`, after both final runs | 19 s | 199 s | 184.331 s | 827 tests, 1 intentional skip, 0 failures |

The two-run means fall from 190.421 s to 164.541 s, about 14% (26 s). The test stage averages 181 s versus 205 s. This is a local simulator measurement, not a CI promise: the controls range from 184 to 197 s, and the earlier audit baseline took 179.185 s, showing meaningful machine/run variance.

| Rendering suite | Fresh control | Control repeat | Final run | Exact-commit repeat |
| --- | --- | --- | --- | --- |
| CaptureSnapshotTests, 33 cases | 114.584 s | 107.098 s | 92.680 s | 93.251 s |
| RewardsSnapshotTests, 10 cases | 39.842 s | 36.004 s | 27.507 s | 29.385 s |
| RewardRowProjectionTests, all 34 cases | 13.803 s | 13.673 s | 14.704 s | 14.360 s |

The unchanged projection suite did not get faster; the saving is concentrated in the two optimised suites. No test methods or existing scenario assertions were removed. Accurate Vision recognition, 2× images, light/dark/large-text variants, visible-line checks, and application state/persistence assertions remain. The polling helper no longer captures an image it immediately overwrites, and Vision reads the captured CGImage directly rather than round-tripping through JPEG. Readiness waits whose OCR return values were discarded now poll accessibility; presentation waits use the existing navigation-settling helper. Accessibility is not used as a substitute for rendered-text assertions.

### Failure controls and intermediate results

- Temporary profiling on 13 representative tests found 67 polling calls and 79 attempts: discarded captures cost 6.314 s and OCR cost 40.470 s. Profiling code was removed before the final runs.
- An intermediate Capture run failed because the new readiness needle used the display string `GPT 5.6 Luna`, while accessibility exposes the fixture model ID `gpt-5.6-luna`. Corrected the readiness needle, not the model-selection assertions. Both final full runs above pass.
- Negative visual control: temporarily added `.hidden()` to the root view in `testBlankConversationIgnoresRememberedManualEntry`, leaving assertions unchanged. Ran `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/CaptureSnapshotTests/testBlankConversationIgnoresRememberedManualEntry`. Fresh build succeeded; the test failed at its rendered `Add Transactions` assertion and `Send` accessibility assertion (1 test, 2 failures, exit 65). Removed the mutation before committing. The exact-commit full run passes that same test, demonstrating the optimised helper still rejects missing rendered text.
- Integration check at `f69960f7` (only this verification record subsequently changed): `/usr/bin/time -p bun test`, 823 pass, 0 fail, 68 files, 24.77 s. This confirms the earlier Bun optimisation still passes after the upstream merge.
- No product UI or production implementation changed. No signing credentials, physical-device installation, Speedflight or deployment were involved.

### Independent review and safeguards

Opus 5.5, reused at its recorded max-effort launch settings, reviewed `45b6896e...f69960f7` and the new `c5e0583d...f69960f7` diff. It independently ran 47 affected tests on a fresh Mac satellite: 110.17 s optimised versus 143.23 s control, with zero failures. Twelve cold-process stress cases also passed. It reported two low-severity findings; both were accepted rather than relying only on the passing assertions:

- The adaptive sheet's scroll geometry was still fractional when measured. Retained the original 600 ms geometry wait in that one test, after readiness and navigation settling, instead of introducing a new geometry-polling helper.
- The faster helper stopped incidentally calling production `SlipImageText.recognize`. One existing rendered-screen test now explicitly sends its screenshot through that production path and asserts recognised content. The other snapshot assertions still exercise direct-CGImage OCR.

Fix implementation: `f49955990cfdbd79a42cd0f4574d80290e3f07a3`. Full `scripts/ios-xcodebuild.sh test` passed at that exact code: 827 tests, one intentional skip, zero failures, 145.242 s XCTest; build 19 s, test stage 159 s. The short sheet measured content 653.5 and settled visible height 654.0, matching the control geometry. The earlier 14% comparison above predates these safeguards and is not the final timing claim.

Additional temporary negative controls separately covered the paths the hidden-view check did not: forced production `SlipImageText.recognize` to return an empty string and requested an absent readiness marker in the same existing test. A fresh targeted run failed exactly at the production-text assertion and `waitForContent`'s missing-accessible-content assertion (one test, two failures, exit 65). Both mutations were removed before committing; the full fixed run passes. Production source is byte-identical to baseline.

The same reviewer returned **clean, no findings** on `f69960f7...e644f507`; both fixes are resolved. The reviewer inspected the final logs but did not run native tests again in the fix round. `e644f507` differs from tested implementation `f4995599` only in this verification record.

### Final timing after both safeguards

Ran a fresh control between two full runs of the fixed implementation on the same satellite:

| Run | Revision | Build | Test stage | XCTest | Result |
| --- | --- | --- | --- | --- | --- |
| Fixed implementation | `f4995599` | 19 s | 159 s | 145.242 s | 827 tests, 1 intentional skip, 0 failures |
| Contemporaneous control | `c5e0583d` | 15 s | 191 s | 177.631 s | 827 tests, 1 intentional skip, 0 failures |
| Final repeat | `e644f507` | 15 s | 158 s | 144.804 s | 827 tests, 1 intentional skip, 0 failures |

Final mean is **145.023 s versus 177.631 s**, about **18% faster, saving 33 s** of XCTest execution. The final test stage averages 158.5 s versus 191 s. CaptureSnapshotTests averages 80.835 s versus 103.538 s (22% faster); RewardsSnapshotTests averages 28.008 s versus 34.765 s (19% faster). The original and intermediate numbers remain above rather than being discarded. Machine/run variance is real; these measurements do not promise an equivalent CI saving.

The final repeat log names `e644f507117d07a1b472294c908638b312bae067` and verifies SHA-256 hashes of both changed test files and restored production OCR source before building. The clean orb tree was mirrored immediately before that run. Both final runs measure short-sheet visible height 654.0, matching the control.

The follow-up is implemented, verified and independently reviewed. Final record-only updates need no further review under the repository procedure. Landing remains blocked by unread branch protection; neither branch nor main has been pushed. No deployment or publication occurred.

## Targeted pruning after the redundancy audit

The user authorised the small prune list after the read-only audit. Baseline is `e56565bc24620ef00bec37121b743ef8b90be281`; tested implementation is `92e08f9bae319fa9a4d3b190dc3aa0a703256fd3`. `origin/main` remains `45b6896e`; the branch already contains it. Only five test files changed, with no production, fixture or UI implementation changes.

- Removed `testTheFileIsWrittenAtomically`: it injected its own atomic writer, bypassing the production writer, and therefore could not detect removal of production atomic writing. The retained outbox tests still check relaunch persistence, failed-write preservation, corruption quarantine and refusal to overwrite unreadable files. They are not claimed to prove crash-time atomicity.
- Removed two assertions of counters computed entirely by the local bulk-test fixture. Kept the production completeness and remaining-work assertions, and renamed the test to describe what it actually checks.
- Removed two generic web parsing cases. All 16 original input/expected-result pairs remain in the shared money parser suite: five already existed and eleven were moved into the existing groups. One moved invalid input adds a parameterised case, so the net Bun count decreases by one, not two. Web currency configuration, format/parse round trips and stored-amount preservation checks remain.
- Combined the two overview account-selection cases with three different account IDs: the first-listed account is Rainy Day Saver, the remembered account is Everyday, and the focused register is Travel Card. Returning either the first account or the focused register now fails the same retained assertion. Other origins and fallback cases remain.

### Repeatable verification

- `bun test` at `92e08f9b`: **822 pass, 0 fail, 68 files**, 24.01 s. Previously 823 tests. No additional speed-up is inferred from this run.
- `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/CaptureOriginTests -only-testing:HowMuchTests/OutboxStoreTests` at the same code on a fresh Amp mac.medium satellite, macos-27, Xcode 27.2, Debug HowMuch scheme: **26 tests, 0 failures**, 13 in each suite. Build-for-testing passed in 118 s; test stage passed in 39 s. This is targeted validation, not a new full-native-suite run.
- The native log records the source revision and changed-file SHA-256 hashes, which match the orb files: CaptureOriginTests `9f8fa1aaab080e218c98f67048be0f23ba3862bffab08fd3b1d478ec53f8d531`; OutboxStoreTests `166bf5e6c6aa321a136b4afd81866a3822f425e48ef3eebffec739b6b21d7fc6`.
- A read-only comparison of the two old web cases against the shared parser tests found **16 input/expectation pairs, zero missing equivalents**. This was an audit check, not a permanent source-text test.
- `git diff --check` passed. No live data, remote database, signing credentials, deployment or publication was involved.

Independent review of this pruning round is pending. The previous landing blocker has not been bypassed.
