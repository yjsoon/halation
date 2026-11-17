# CI cost and feedback audit, 17 November 2026

## Scope and source revision

Baseline: `yjsoon/halation` at
[`42e55615`](https://github.com/yjsoon/halation/commit/42e556156d159343daba6861294ebb413870d115).
Measured GitHub Actions, local landing checks in an Amp Linux orb, simulator
validation on an Amp Mac satellite, and daily Xcode Cloud distribution. These
are different workloads and machines, not one interchangeable CI bill.

During baseline collection, no deployments, remote writes, workflow dispatches,
required-check changes, repository settings, Xcode Cloud settings, tester changes
or releases were made.
All financial fixtures were synthetic. No existing test was removed or selected
out of the full Bun suite.

Read [Vincent Koc's article](https://vincent.build/openclaw-ci-cost-reduction/),
its [pinned CI workflow](https://github.com/openclaw/openclaw/blob/a7d05c7af04aa17ac57c994da238d0c60f058ca6/.github/workflows/ci.yml)
and [changed-test planner](https://github.com/openclaw/openclaw/blob/a7d05c7af04aa17ac57c994da238d0c60f058ca6/scripts/lib/ci-changed-node-test-plan.mts).
The workflow separates PR, main and hourly work, gates jobs before setup,
uses a manifest and selected test shards, and collects adaptive observations.
The planner resolves explicit executable owners and returns an unresolved
result when inputs or owners are missing. That is not a dependency graph we
can reuse here. Its model observations are not permission to omit our tests.
The article's 95.5% estimate compares changing workloads and sponsored compute,
not a controlled speedup or a paid invoice. None of its percentages are used
as Halation estimates.

## Highest-value decisions

1. **Reject cheap failures before expensive work. Implemented locally.** Check
   platform eligibility first, then types, selected source lints and engine
   freshness, then the entire Bun suite and required native tests. There is no
   new parallelism, result cache or affected-test selector. Passing rounds
   retain the existing check set; first-failure order changes deliberately.
2. **Make uncertainty explicit and measurable. Implemented locally.**
   `bun run check --full` runs every scripted check on a Mac, even on a clean
   checkout without `origin/main`. Each command reports wall, user and system
   time and exit status. Bad flags fail. Default diff-based routing remains;
   it is not claimed to be an exhaustive dependency analysis. Use `--full`
   when that routing cannot establish the affected boundary. Interactive
   feature recipes remain separate obligations.
3. **Consider avoiding unchanged daily archives, subject to separate approval.**
   Builds 31 and 32 archived the same source SHA. Build 32's archive occupied
   304.681 seconds. Avoiding that one archive would remove 6.35% of this
   sample's scheduled archive time, not 6.35% of an invoice. Any future reuse
   policy must also bind workflow, resolved dependencies and toolchain, require
   a previous success and allow periodic fresh builds. A source SHA alone is
   insufficient. No scheduling or distribution changes were made.
4. **Keep Xcode incremental build validation.** `test` always invokes
   `build-for-testing`, but does not clean DerivedData. This is already build
   reuse, not a fresh compilation on every invocation. Skipping it would
   reintroduce the stale-test-products failure documented in issue #166.
   Changing Xcode Cloud's `clean: true` would be a separate, measured experiment,
   not a safe deduction from local incremental timings.
5. **Do not add a test-selection service, runner fleet or deployment cache.**
   The Bun suite is about 35 seconds, the combined typechecks about 2 seconds,
   and the latest deploy's dependency install 3 seconds. Graph maintenance,
   extra job setup and cache restore could exceed the savings. Slow password
   tests exercise real production-cost scrypt and both stores. Their shared
   initial credential is already cached; hashing costs are not evidence of
   redundant protection. No cryptography or assertions were weakened.

Automating main-branch regression checks could improve enforcement, but would
add compute rather than save an existing Actions workload. That and any new
required checks need their own approval, not inclusion in this optimisation.

## GitHub Actions baseline

Read-only queries: `gh api repos/yjsoon/halation/actions/runs` filtered to
`created=2026-11-01..2026-11-17`, each run's `/jobs` and `/timing`,
`actions/runs?event=push&branch=main`, `branches/main`, `rulesets`,
`rules/branches/main`, and the baseline commit's `/check-runs`.

- Six runs in the date window, all successful first-attempt Deploy tag runs.
  No main-push Actions runs were returned. Current workflow source has only
  `v*` tag pushes and manual dispatch, not a main-push test workflow.
- Branch metadata reports `protected: false`, enforcement off and no required
  contexts; both ruleset queries returned empty lists. The dedicated legacy
  protection endpoint returned 403, so that endpoint alone could not establish
  policy. No settings were changed.
- The baseline commit has an Xcode Cloud archive check, not a Bun or XCTest
  Actions result. No Actions test result is being inferred from a deployment.

| Run | Feedback, creation to last job completion | Job occupancy |
| --- | ---: | ---: |
| 42833498220, v1.0.9 | 61 s | 58 s |
| 42768780740, v1.0.8 | 50 s | 47 s |
| 42556694763, v1.0.7 | 54 s | 51 s |
| 42473213703, v1.0.6 | 192 s | 189 s |
| 42448826749, v1.0.5 | 51 s | 48 s |
| 42331120602, v1.0.4 | 57 s | 55 s |

Median feedback: 55.5 seconds. Sum of job occupancy: 448 seconds (7.47 runner
minutes). All six timing responses report zero billable Ubuntu milliseconds;
the repository is public. Occupancy is not zero simply because billing is.

[Latest deployment](https://github.com/yjsoon/halation/actions/runs/42833498220):
checkout 21 s, Bun setup 2 s, frozen install 3 s, migration guard 4 s, checked
web build 3 s, deployment 9 s, health check including its wait 10 s. The
migration guard, checked build, deploy serialisation and health check remain
unchanged. This audit did not execute the deployment workflow.

## Xcode Cloud baseline

Read only through App Store Connect: the app's `ciProduct`, its `workflows`
and `buildRuns`, and every returned run's `actions`. The API returned 12 runs,
builds 21 to 32, with no next-page link. All succeeded. Eleven were scheduled
(7 to 17 November, Asia/Singapore), one was manual. Live workflow settings:
enabled Daily TestFlight, daily 03:00 Asia/Singapore, `main`, clean archive of
HowMuch for App Store eligibility. The old Default workflow is disabled.

| Build | Trigger | Archive action seconds | Creation to workflow completion seconds |
| --- | --- | ---: | ---: |
| 21 | Scheduled | 347.832 | 381.493 |
| 22 | Manual | 400.169 | 64600.561 |
| 23 | Scheduled | 324.506 | 24644.128 |
| 24 | Scheduled | 511.038 | 906.672 |
| 25 | Scheduled | 1228.979 | 1621.885 |
| 26 | Scheduled | 360.659 | 824.437 |
| 27 | Scheduled | 385.610 | 781.893 |
| 28 | Scheduled | 357.776 | 740.124 |
| 29 | Scheduled | 381.472 | 710.386 |
| 30 | Scheduled | 314.846 | 382.636 |
| 31 | Scheduled | 278.836 | 495.973 |
| 32 | Scheduled, same source as 31 | 304.681 | 653.025 |

Scheduled archive time totals 4796.235 s (79.94 minutes); median 357.776 s
(5.96 minutes), range 278.836 to 1228.979 s. Including the manual archive,
the total is 86.61 minutes. Scheduled queue time median is 35.697 s.

The workflow-completion median is 740.124 s (12.34 minutes). It includes
TestFlight external-testing post-actions and review waiting, not just build
compute. For example, build 22's external post-action took 64177.473 s while
its archive took 400.169 s. The API labels the external post-action `TEST`;
it is distribution to testers, not a run of HowMuchTests. Do not bill its
entire elapsed time as Mac runner compute. Archive action wall time is still
only a usage proxy; Apple billing hours and the owner's plan were not read.

## Local Linux baseline

Linux x64 Amp orb, two logical CPUs, Bun 1.4.4, Node 26.13.1, TypeScript 7.0.2,
dependencies already installed with the lockfile. Engine check uses Bun 1.4.0.
Three sequential repetitions of every command, without overlapping CPU work.
Wall and child-process CPU measured with Python `time.monotonic()` and
`resource.getrusage(RUSAGE_CHILDREN)`. Browser daemon CPU is not exhaustively
accounted for. Medians and ranges are descriptive, not confidence intervals.

| Command | Wall seconds, repetitions 1 / 2 / 3 |
| --- | --- |
| `bun test` | 34.117 / 37.219 / 35.375 |
| `bun run --cwd apps/web typecheck` | 1.978 / 1.492 / 1.289 |
| `bun run --cwd apps/worker typecheck` | 0.609 / 0.776 / 0.631 |
| `bun scripts/verify-ios-focus-zoom.ts` | 7.224 / 0.963 / 0.850 |
| `bun scripts/verify-ios-confirm-presentation.ts` | 0.026 / 0.024 / 0.021 |
| `bun scripts/verify-ios-disclosure-chevron.ts` | 0.040 / 0.039 / 0.033 |
| `bunx bun@1.4.0 scripts/build-ios-engine.ts check` | 1.169 / 0.062 / 0.052 |

Every command passed. Bun: 810 tests, 68 files, 75913 assertions. The first
browser and pinned-Bun invocation include cold setup effects. This is not an
empty `check.sh` invocation, which would have done no work at the clean base.

## Matched CLI experiments

Used a disposable detached worktree of the baseline with its own
`bun install --frozen-lockfile`. Ran the actual old and new `scripts/check.sh`,
not mocked checks, three times per condition with no simultaneous Linux
benchmark. Same app source, dependencies, runner and 810-test inventory in
both sides; the two new gate tests were verified separately and in the main
worktree's full 812-test suite. Timings exclude dependency installation.

| Condition | Old median wall | New median wall | Old median CPU | New median CPU |
| --- | ---: | ---: | ---: | ---: |
| Web TS2322 failure | 34.375 s | 1.604 s | 36.162 s | 2.192 s |
| Passing web-scoped round | 33.529 s | 32.953 s | 35.447 s | 34.816 s |
| iOS-scoped round on Linux, rejected | 33.118 s | 0.024 s | 35.201 s | 0.029 s |

For TS2322, create an untracked `apps/web/src/ci-audit-probe.ts` containing
`export const ciAuditProbe: number = "intentional type error";`. Both versions
report that same error and exit 1. Old runs first pass all 810 Bun tests; new
runs reject at the web typecheck. Median feedback improves 95.3%, and measured
CPU falls 93.9%. These are savings for this rejected-change scenario only.

For the passing control, rename that probe to `.ts.fixture` so it remains a
web-scoped diff but is not TypeScript input. Both versions pass the same Bun
inventory, both typechecks and the focus-zoom check. The small timing
difference is treated as noise: **no successful-round speedup is claimed**.

For host rejection, additionally create an untracked text file
`apps/ios/ci-audit.fixture`. Both versions reject with exit 1 because Linux
cannot run the required native tests. The new version rejects immediately,
avoiding a complete Bun run that would need repeating on the Mac.

An initial replay using only a symlink to the root node_modules failed module
resolution because package-level workspace links were missing. Those samples
were discarded, dependencies installed in the replay worktree, and all
reported replay measurements rerun. Setup failures are not speedups.

At a fixed runner rate the failed TS example avoids about 0.546 occupied
runner minutes per occurrence. No failure-frequency census was collected,
so this is not extrapolated to monthly savings. User/system CPU is not
vCPU allocation, and no Amp price or Apple invoice was inferred.

## Native validation and implementation verification

The first mac.medium attempt became unresponsive to diagnostic commands after
starting a cold Xcode 27.2 build. Its recovered log showed compiler work and
heartbeats through 2664 s, normal memory pressure and no swap, but no final
build/test result. After roughly 55 minutes the unusable satellite was stopped
and replaced. This interrupted attempt and provisioning are audit overhead,
not silently excluded successful timings or evidence that Xcode hung. Its
partial log is retained in the thread's scratch backup.

Replacement satellite: mac.medium, six vCPUs, 14 GiB RAM, Xcode 27.2 (27B52),
Debug HowMuch scheme, iPhone 17 Pro simulator on iOS 27.2, one pinned
destination, `build/xcode/DerivedData-simulator`, jobs 2, ad-hoc simulator
signing and no signing secrets. Accessibility enabled as required by the
repository's snapshot-test harness. No project or compiler settings changed.

Commands, with `DEVELOPER_DIR` set to Xcode 27.2 and `SIMULATOR_UDID` pinned
to the selected iOS 27.2 device:

```sh
/usr/bin/time -lp scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests
/usr/bin/time -lp bun run check --full
```

| Run | Build-for-testing | Test-without-building | Native result |
| --- | ---: | ---: | --- |
| Cold baseline | 169 s | 188 s | 822 tests, 1 skipped, 0 failures |
| First unchanged warm run | 5 s | 169 s | 822 tests, 1 skipped, 0 failures |
| Final full gate, warm | 2 s | 167 s | 822 tests, 1 skipped, 0 failures |

Cold native wrapper wall time: 357.95 s. Final full gate wall time: 185.67 s,
including 15.097 s for all 812 Bun tests, both typechecks, all three source
lints and engine freshness. Every command exited 0 and the gate printed
`check: pass`. This comparison demonstrates pre-existing incremental reuse;
**it is not a speedup caused by this patch**. The sole native skip is the
existing opt-in `testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery`, which
requires `HOWMUCH_LIVE_MODEL_VERIFY=1` and an available on-device model.

The cold wrapper's measured child CPU was 275.38 s; the final complete gate's
was 30.21 s. These are partial process-accounting values: the simulator test
host is launched through system services, so child CPU is not whole-Mac CPU.
Use native elapsed/occupancy, not these CPU totals, for capacity comparisons.
The completed cold run reported memory pressure 2 and 638.5 MiB swap; runs
were serial with jobs 2. No parallel-runner or memory tuning is claimed.

The initial warm full invocation exposed a missing prerequisite: Mac mirrors
do not include `.git`. Its checks ran, but it could not identify the revision,
so its final `check: pass` was not accepted as qualified gate evidence. Added
a failing regression before fixing full mode to reject an unreadable revision.
Initialised Git metadata on the Mac, fetched the exact public baseline and
used `git reset --mixed FETCH_HEAD` to establish the index without changing
worktree files. Then mirrored the final gate and reran the complete command.
The final log names the correct baseline SHA plus worktree changes.

Final gate source SHA-256:
`d3b18c59347bdaf7c3177ab2a4231b51cbae24428d27f0457937a0129e15eab2`.
Final gate-test source SHA-256:
`8c39a8a07fd484eb1be32fd50548aa2bd74cdb49dd20a044eeacdf962bf13f9a`.
Final native result bundle on the satellite:
`build/xcode/DerivedData-simulator/Logs/Test/Test-HowMuch-2026.11.17_05-33-28-+0000.xcresult`.
Full cold, warm and final logs were downloaded to the thread scratch backup.

Gate tests were written before implementation. The original script failed
the clean/no-base full-run test (exit 128 rather than the injected failure)
and accepted a misspelt option. Before the early platform check, a failing
test could mask an unsupported-host diagnostic. All those cases now pass.
These are isolated CLI contract tests with real Git repositories and stand-in
commands, not application E2E tests. They inject failure into each of the
eight checks to ensure none can disappear behind a successful gate.

A scratch CLI routing comparison covered 14 default change shapes: root and
nested docs, web, API, Worker, iOS app, engine, shared package, lockfile,
package manifest, source-lint script, engine-builder script, unknown script
and unknown configuration. The old and new gates selected the same check
sets on a supported host in every case. This is routing validation with
stand-in commands, separate from the real full-suite execution above.

`bun run check` on Linux: both typechecks and 812 tests across 69 files passed.
An intermediate full-mode run passed both typechecks, all three source lints,
engine freshness and all 812 tests, then correctly rejected native execution
on Linux. Final full mode rejects Linux before those checks, as intended.
`bash -n scripts/check.sh` and `git diff --check` passed. No app UI changed, so
no product feature recipe or screenshot is claimed as evidence for this work.

Raw experiment scripts, JSON and logs stay in `.amp/in/orb-backup/ci-audit/` in
this thread, not Git. This text record contains the fixtures, commands,
revision, results and limits needed to repeat the measurements.

## Landing verification and delivery boundary

YJ explicitly authorised committing, rebasing and pushing this round to main,
without a pull request, independent review or deployment. Rebased cleanly onto
[`f4cd9971`](https://github.com/yjsoon/halation/commit/f4cd99713b3a47558b49c39038ad37a597f43204).
The baseline and matched measurements above retain their original revision.

Rebased `bun run check` on Linux passed both typechecks and all 812 Bun tests
across 69 files, with zero failures and `check: pass`. The Bun suite took
37.170 seconds. `bash -n scripts/check.sh` and the diff whitespace check passed.

Repeated `bun run check --full` on a new mac.medium satellite with Bun 1.4.4,
Xcode 27.2 (27B52), iPhone 17 Pro on iOS 27.2, accessibility enabled and the
same canonical cache and native wrapper described above. The Mac source tree
was verified against the rebased Git tree before execution, and the exact
unpushed commit metadata was reconstructed locally without changing source.
All eight commands exited 0: both typechecks, all three lints, engine freshness,
812 Bun tests and 822 native tests (one existing opt-in skip, zero failures).
Cold build-for-testing took 205 seconds; test-without-building took 211 seconds.
The whole gate took 449.69 seconds and printed `check: pass`. This is landing
correctness evidence, not another controlled speedup measurement.

An initial landing attempt auto-selected an iOS 27.3 simulator. One password
authentication test exceeded its existing 5000 ms limit while simulator
wallpaper and system processes consumed heavy CPU. The gate correctly failed
and did not run native tests. Shut down that simulator and pinned the same
iOS 27.2 configuration used for the baseline; the complete rerun above passed
without code or timeout changes. Both logs are retained in the thread scratch
backup as `ci-landing-full.log` and `ci-landing-full27.log`.

Only this round's text record was updated after the successful full run.
Before pushing, main advanced again to
[`9562e4c8`](https://github.com/yjsoon/halation/commit/9562e4c8151ccdf7759cd8b748dad1a089ccf632),
changing only web report scope and its documentation. Rebased again and reran
`bun run check`: both typechecks and all 812 Bun tests passed, zero failures,
`check: pass` (Bun 39.760 seconds). Also reran the focus-zoom check: every
measured text-entry control was at least 16px. Native, API, shared packages,
lockfile and scripts were unchanged from the full Mac run.
No product behaviour changed in this round, so no product feature E2E recipe applies.
The authorised push contains only this audit, the check script, its CLI
regression tests and README guidance. It does not change required checks,
repository or Xcode Cloud settings, trigger builds, tag or deploy anything.
