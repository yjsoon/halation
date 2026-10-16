# Perf pass benchmark harness

Benchmark-only tooling for the iOS perf pass. Nothing here ships in the app or
the Xcode project: `run-bench.sh` adds a throwaway UI-test target to a
temporary worktree of the revision under test.

## What it measures

`HowMuchPerfUITests.swift` (XCTest UI tests, app built in **Release**, seeded
synthetic ledger from `../fixture/`):

| Test | What | Metrics |
| --- | --- | --- |
| `test01_ColdLaunch` | process launch to first responsive frame | `XCTApplicationLaunchMetric(waitUntilResponsive:)` |
| `test02_LaunchToAccountsContent` | launch until the Accounts list shows "Everyday Account" | clock, app CPU, app memory |
| `test03_OpenAllRegister` | tap All until the first row is on screen (repeat visit) | clock, app CPU |
| `test04_OpenBusyAccountRegister` | tap Everyday Account until its first row is on screen | clock, app CPU |
| `test05_OpenQuietAccountRegister` | tap Savings Pot 2 (2-4 rows a month) until its first row is on screen | clock, app CPU |
| `test06_FirstRegisterOpenAfterLaunch` | cold launch, then tap Everyday Account until rows show | clock, app CPU |
| `test07_ScrollAllRegister` | three fast flings down the All register | scroll hitch/frame metrics, app CPU |
| `test08_ReachSixMonthsBack` | from the top of All, fling (tapping Load older when it is on screen) until a row from six months back shows | clock, app CPU |
| `test09_LoadOlderPage` | tap an idle Load older until the page has landed; a tap that loads nothing fails the test. With prefetch the button is never idle on screen, so the test fails before measuring; prefetch is measured by the walks | clock, app CPU, memory |
| `test10_OpenReflectTab` | switch to Reflect until the Spending card shows Top Categories | clock, app CPU |
| `test11_OpenSpendingBreakdown` | open the Spending Breakdown detail | clock, app CPU |
| `testZZ_ProfileTour` | an unmeasured tour of the above, recorded with the Time Profiler | – |

`test00_Setup` runs once per clean install: local mode taps **Start on this
iPhone** (the seeded database's one plan is adopted); server mode signs in
through **Connection**. It then opens All and Reflect once so every measured
launch is a warm launch with a snapshot on disk.

## Running (macOS, Xcode 26+)

```sh
# once
gem install --user-install xcodeproj
bun install --frozen-lockfile
bun .amp/in/artifacts/perf-pass/fixture/make-snapshot.ts
bun .amp/in/artifacts/perf-pass/fixture/make-local-db.ts

H=.amp/in/artifacts/perf-pass/harness
export SIMULATOR_UDID=<an iPhone 17 / iOS 26.x simulator>
# local mode (on-device engine, no server)
$H/run-bench.sh base <base-rev> both
$H/run-bench.sh fix  <fix-rev>  both
# server mode against a local API (optionally behind a latency proxy)
.amp/in/artifacts/perf-pass/fixture/serve.sh 8899 60
PERF_MODE=server PERF_SERVER_URL=http://127.0.0.1:8900 $H/run-bench.sh base-server <base-rev> measure

python3 $H/parse-measure.py --table ~/perf-work/results/base-*/results.json ~/perf-work/results/fix-*/results.json
```

Results land in `~/perf-work/results/<label>-<stamp>/`: `measure.log` (raw
xcodebuild output with every `measured [...]` line), `results.json` (parsed),
`*-summary.txt` (Time Profiler summaries of the cold launch and the tour) and
the `.trace` / `.xcresult` bundles.

A failed setup stops the run before anything is measured. A failed test keeps
its log, its samples go under `failed_metrics` (not `metrics`, so `compare.py`
never reads them), and `run-bench.sh` exits non-zero at the end.

Compare revisions on the same machine and simulator, interleaved (base, fix,
base, fix), with nothing else building.
