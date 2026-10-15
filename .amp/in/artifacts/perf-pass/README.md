# iOS perf pass: run record

What was measured, how, and what came out, for the perf pass on branch
`claude/perf-pass-3hgk4z`. All data is synthetic; no real ledger was used.

- Base: `f2bdc3f` (main when the pass started).
- Head: `89ff898` (app code as of `de7d578`; later commits only touch this folder).
- One fix at a time: base plus one patch from [`diag/`](diag/), so each fix has its own before and after.

## Where the time went

1. **The floating Assistant button scanned the screen ten times a second.** It
   found the tab row's Add button by walking every accessibility element in the
   window on each display tick. Under UI automation (and VoiceOver, which also
   turns accessibility on) that walk was the largest single cost in the app:
   14.9 s of the 60.7 s main-thread time in the profiled tour. With
   accessibility off, as on most phones, the walk found nothing, so the button
   never appeared, and it still cost about 190 ms of every 30 s.
2. **Older content waited for the reader.** The register loaded 100 rows at a
   time and only when the reader reached the end of the list and tapped Load
   older.
3. Launch, screen opens and scrolling had no other app hotspot worth a change:
   the rest is SwiftUI, the local engine and the system.

## Fixes

| Fix | Commits | Patch for the one-fix runs |
| --- | --- | --- |
| Floating Assistant anchored to the tab bar's own views by geometry, so it shows without accessibility and the scan is gone | `5385707`, `de7d578` | `diag/fix-assistant.patch` (`diag/fix-pins.patch` is the superseded first version, which only cached the scan) |
| Next older page starts loading 40 rows before the end of the register | `967cebd` | `diag/fix-prefetch.patch` |
| Load older and a focused account's fill fetch 250 rows a page; the launch fill stays at 100 | `3d96f84`, `78b0e68` | `diag/fix-pages.patch` |

## Environment

- Devin macOS runner: VirtualMac2,1 (Apple M4 Pro, virtual), 16 GiB, macOS 26.6.2 (25G83).
- Builds: Xcode 26.6 (17F113), Release, ad hoc simulator signing (no team).
- Profiles: `xctrace` from Xcode 27.0 RC (Xcode 26.6's recorded empty traces on this host).
- Simulator: iPhone 17, iOS 26.5 (23F73), the only simulator booted during benchmark runs.

## Fixture and setup

- [`fixture/`](fixture/README.md): a deterministic synthetic ledger, 14,000
  transactions from Oct 2020 to Oct 2026 across about 28 accounts, built with
  the app's own engine. "Everyday Account" is the busy account; "Savings Pot 2"
  is the quiet one (two to four rows a month).
- Local mode (the on-device engine) unless stated. `run-bench.sh` reinstalls
  the app from scratch for every run, seeds the database and runs
  `test00_Setup` once, so every measured launch is a warm launch with a
  snapshot on disk.
- Server mode: `fixture/serve.sh 8899 60` (the real API on a fresh SQLite
  file, behind a proxy adding 60 ms per request), `PERF_MODE=server
  PERF_SERVER_URL=http://127.0.0.1:8900`.

## Commands

From the repository root on the Mac (see [`harness/README.md`](harness/README.md)):

```sh
H=.amp/in/artifacts/perf-pass/harness D=.amp/in/artifacts/perf-pass/diag
export SIMULATOR_UDID=<perf-iphone17> XCTRACE=/Applications/Xcode-27.0-RC.app/Contents/Developer/usr/bin/xctrace
SHORT="test01_ColdLaunch test02_LaunchToAccountsContent test03_OpenAllRegister test04_OpenBusyAccountRegister test05_OpenQuietAccountRegister test06_FirstRegisterOpenAfterLaunch test07_ScrollAllRegister test09_LoadOlderPage test10_OpenReflectTab test11_OpenSpendingBreakdown"
PERF_ONLY="$SHORT" PERF_ITERATIONS=6 $H/run-bench.sh r1-base-b f2bdc3f measure   # base, round 1
PERF_ONLY="$SHORT" PERF_ITERATIONS=6 PERF_PATCH="$D/fix-prefetch.patch" $H/run-bench.sh r1-fix-prefetch f2bdc3f measure
PERF_ONLY="test08_ReachSixMonthsBack test08b_QuietAccountReachSixMonthsBack" $H/run-bench.sh walk-base f2bdc3f measure
$H/run-bench.sh final-r1 89ff898 measure                                    # head, all tests incl. walks
PERF_PATCH="$D/open-all-on-launch.patch" $H/run-bench.sh idle-base f2bdc3f idle   # accessibility off
$H/run-bench.sh assist-place b7b6a45 placement                              # Assistant placement
python3 $H/compare.py results/<base>.json results/<other>.json ...
```

Each run's parsed values and medians are in [`results/`](results/). Short
tests ran 6 iterations in the base and one-fix runs and 8 in the head runs
(launch metrics report a few more), walks 3. Base and fixes were run
interleaved over two rounds; base below pools `r1-base-b`, `r2-base` and
`walk-base`.

## Results: head against base (local mode)

Medians. CPU is the app's own CPU time, which is what the app controls; the
clock times for opening a screen are mostly XCTest's own waiting and the
navigation animation, so they barely move whatever the app does. Run-to-run
drift between rounds was up to about 10%.

| Measure | Base | Head (round 1) |
| --- | --- | --- |
| launch to first responsive frame | 1.34 s | 1.12 s (-16%) |
| launch to Accounts list, CPU | 2.36 s | 1.78 s (-24%) |
| open All register, CPU | 0.70 s | 0.39 s (-43%) |
| open busy account, CPU | 0.85 s | 0.51 s (-40%) |
| open quiet account, CPU | 0.78 s | 0.45 s (-42%) |
| launch then open an account, CPU | 3.17 s | 2.38 s (-25%) |
| three fast flings down All, CPU | 2.74 s | 1.66 s (-39%) |
| open Reflect, CPU | 0.60 s | 0.28 s (-53%) |
| open Spending Breakdown, CPU | 0.71 s | 0.34 s (-52%) |
| quiet account: scroll back six months, clock | 28.7 s | 14.7 s (-49%) |
| quiet account: scroll back six months, CPU | 13.3 s | 5.9 s (-56%) |
| All: scroll back six months, clock | 324.8 s | 301.9 s (-7%) |
| All: scroll back six months, CPU | 111.1 s | 71.9 s (-35%) |
| open a screen, clock (All, account, Reflect, Breakdown) | 2.2 to 2.8 s | unchanged (within 2%) |
| launch to Accounts list, clock | 4.36 s | 4.23 s (-3%) |

Every head launch (1.09 to 1.15 s) was faster than every base launch (1.22 to
1.51 s). The launch, screen-open and scrolling gains come from removing the
Assistant's accessibility scan, so they are measured with accessibility on
(UI tests); on a phone without VoiceOver the scan was cheap, and those gains
are small there. The older-content gains apply everywhere.

A manual Load older tap (`test09`) is left out above. In these runs it did not
always tap: with prefetch, the next page was often already loading when the
button came on screen, so a sample could time the tail of a prefetch rather
than a tap (review on #339). The harness now fails any sample that is not a
tap loading a page, and base and head are being re-measured with it. The walks
above are unaffected: each must reach the six-month-old header to pass.

## Results: one fix at a time (local mode)

Base pooled as above; `fix-pins` and `fix-prefetch` pool two rounds.

| Measure | Base | Assistant scan cached (first version) | Prefetch | 250-row pages |
| --- | --- | --- | --- | --- |
| open All register, CPU | 0.70 s | 0.47 s (-33%) | 0.73 s (+5%) | 0.73 s (+4%) |
| open busy account, CPU | 0.85 s | 0.60 s (-29%) | 0.85 s (0%) | 0.85 s (0%) |
| three fast flings, CPU | 2.74 s | 1.92 s (-30%) | 2.92 s (+7%) | 2.91 s (+6%) |
| open Reflect, CPU | 0.60 s | 0.35 s (-41%) | 0.55 s (-9%) | 0.60 s (0%) |
| Load older until the page shows, clock | 2.37 s | 2.38 s (+1%) | not comparable | 1.69 s (-29%) |
| Load older until the page shows, CPU | 0.69 s | 0.47 s (-33%) | not comparable | 0.66 s (-5%) |
| launch to first responsive frame | 1.34 s | 1.33 s (0%) | 1.48 s (+10%) | 1.42 s (+6%) |

Prefetch and page size do not touch launch or screen opens; their launch
columns are within the drift between rounds. The prefetch column's Load older
samples are left out for the reason above; without prefetch every sample was a
tap. Prefetch is measured by its own six-month walks (`walk-fix-prefetch`).

## Accessibility off (no UI automation)

`run-bench.sh … idle` launches straight into the All register (via
`diag/open-all-on-launch.patch`) and records 30 s of Time Profiler with no
XCTest attached.

| Revision | App CPU in 30 s | Main thread | Assistant tracking | Assistant on screen |
| --- | --- | --- | --- | --- |
| base `f2bdc3f` | 1292 ms | 976 ms | 189 ms | no |
| scan cached (`fix-pins`) | 1229 ms | 957 ms | 177 ms | no |
| geometry anchor `b7b6a45` | 1124 ms | 837 ms | 35 ms | yes, 56 pt above Add |

## Floating Assistant checks (E2E)

At `b7b6a45` (same app code as the head):

- `CaptureSnapshotTests` on a separate iPhone 17 simulator with accessibility
  enabled: 32 executed, 32 passed, including the four `testTabRow*` tests
  (floats above Add, hides while capture is presented, hides when the tab bar
  hides, hides while an Assistant conversation is pushed).
- `run-bench.sh assist-place b7b6a45 placement` (`testYY_AssistantPlacement`):
  passed. Expected: Assistant above Add, centred on it within 18 pt, at least
  44 pt, hittable, in each state; tapping it opens the Assistant. Observed:

  ```
  PERFPLACE accounts add=(319.0, 791.0, 62.0, 62.0) assistant=(322.0, 725.0, 56.0, 56.0) hittable=true
  PERFPLACE register-scrolled add=(326.0, 798.0, 48.0, 48.0) assistant=(326.0, 740.0, 48.0, 48.0) hittable=true
  PERFPLACE register-top add=(319.0, 791.0, 62.0, 62.0) assistant=(322.0, 725.0, 56.0, 56.0) hittable=true
  ```

  In the scrolled screenshot the tab bar is minimised and the Assistant shrinks
  to 48 pt with it; after the tap the Assistant screen ("New conversation") is
  shown.
- Idle run with accessibility off (`assist-idle`): the screenshot shows the
  glass Assistant button above Add at bottom right; on base it never appeared.

## Caveats

- Simulator on a virtual Mac, not a phone. Compare columns, not absolute times.
- XCTest keeps accessibility on and logs every query; the harness sets
  `OS_ACTIVITY_DT_MODE=NO` so the app's logging is not mirrored to stderr.
- CPU cycle and instruction counters read 0 on the simulator and are ignored.
- The All six-month walk is dominated by XCTest's swipes and queries (about
  300 s either way); its CPU column is the meaningful one.
