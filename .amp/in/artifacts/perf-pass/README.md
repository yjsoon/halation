# iOS perf pass: run record

What was measured, how, and what came out, for the perf pass on branch
`claude/perf-pass-3hgk4z`. All data is synthetic; no real ledger was used.

- Base: `f2bdc3f` (main when the pass started).
- Head: round 1 at `89ff898` (app code as of `de7d578`), round 2 at `bfbf4f0`
  (adds the review fixes to prefetch in `d3369f6`); later commits only touch
  this folder.
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
WALKS="test08_ReachSixMonthsBack test08b_QuietAccountReachSixMonthsBack"
PERF_ONLY="$WALKS" $H/run-bench.sh walk-base f2bdc3f measure
PERF_ONLY="$WALKS" PERF_PATCH="$D/fix-pages.patch" $H/run-bench.sh walk-fix-pages f2bdc3f measure   # likewise fix-prefetch, fix-assistant
PERF_ONLY=test09_LoadOlderPage PERF_ITERATIONS=6 $H/run-bench.sh t09-base f2bdc3f measure   # tap re-measure, stricter harness
PERF_ONLY=test08_ReachSixMonthsBack PERF_WALK_ITERATIONS=1 PERF_PATCH="$D/fix-assistant.patch" $H/run-bench.sh hang-fix-assistant f2bdc3f measure
$H/run-bench.sh final-r1 89ff898 measure                                    # head round 1, all tests incl. walks
$H/run-bench.sh final-r2 bfbf4f0 measure                                    # head round 2
PERF_ONLY="$WALKS" $H/run-bench.sh walk-final 89ff898 measure
PERF_PATCH="$D/open-all-on-launch.patch" $H/run-bench.sh idle-base f2bdc3f idle   # accessibility off
$H/run-bench.sh assist-place b7b6a45 placement                              # Assistant placement
SRV="test02_LaunchToAccountsContent test03_OpenAllRegister test05_OpenQuietAccountRegister test06_FirstRegisterOpenAfterLaunch $WALKS test09_LoadOlderPage"
PERF_MODE=server PERF_SERVER_URL=http://127.0.0.1:8900 PERF_ITERATIONS=6 PERF_ONLY="$SRV" $H/run-bench.sh srv-base f2bdc3f measure   # and srv-final bfbf4f0
python3 $H/compare.py results/<base>.json results/<other>.json ...
```

Each run's parsed values and medians are in [`results/`](results/). Short
tests ran 6 iterations in the base and one-fix runs and 8 in the head runs
(launch metrics report a few more), walks 3. Base and fixes were run
interleaved over two rounds; base below pools `r1-base-b`, `r2-base` and
`walk-base`, and head pools `final-r1`, `final-r2` and `walk-final`.

## Results: head against base (local mode)

Medians. CPU is the app's own CPU time, which is what the app controls; the
clock times for opening a screen are mostly XCTest's own waiting and the
navigation animation, so they barely move whatever the app does. Run-to-run
drift between rounds was up to about 10%.

| Measure | Base | Head |
| --- | --- | --- |
| launch to first responsive frame | 1.34 s | 1.13 s (-16%) |
| launch to Accounts list, CPU | 2.36 s | 1.80 s (-24%) |
| open All register, CPU | 0.70 s | 0.39 s (-44%) |
| open busy account, CPU | 0.85 s | 0.51 s (-40%) |
| open quiet account, CPU | 0.78 s | 0.45 s (-42%) |
| launch then open an account, CPU | 3.17 s | 2.38 s (-25%) |
| three fast flings down All, CPU | 2.74 s | 1.65 s (-40%) |
| open Reflect, CPU | 0.60 s | 0.28 s (-53%) |
| open Spending Breakdown, CPU | 0.71 s | 0.34 s (-52%) |
| quiet account: scroll back six months, clock | 28.7 s | 14.2 s (-50%) |
| quiet account: scroll back six months, CPU | 13.3 s | 5.9 s (-56%) |
| All: scroll back six months, clock | 324.8 s | 303.2 s (-7%) |
| All: scroll back six months, CPU | 111.1 s | 72.0 s (-35%) |
| open a screen, clock (All, account, Reflect, Breakdown) | 2.2 to 2.8 s | unchanged (within 2%) |
| launch to Accounts list, clock | 4.36 s | 4.24 s (-3%) |

The two head rounds agree within 2%, except the All walk's CPU (71.9 s and
78.0 s medians; one round-2 sample took 94 s).

Every head launch (1.09 to 1.21 s over both rounds) was faster than every
base launch (1.22 to 1.51 s). The launch, screen-open and fling gains come
from removing the Assistant's accessibility scan, so they are measured with
accessibility on (UI tests); on a phone without VoiceOver the scan was cheap,
and those gains are small there. The six-month walks need the paging fixes
(see one fix at a time below), and those gains apply everywhere.

A manual Load older tap (`test09`) is left out above. In round 1 it did not
always tap: with prefetch, the next page was often already loading when the
button came on screen, so a sample could time the tail of a prefetch rather
than a tap (review on #339). The harness now fails any sample that is not a
tap loading a page. With that harness the head has no tap to time: in
`srv-final`, 120 fast flings down All (389 s) never found Load older idle on
screen, because the next page was always already loaded or loading. The tap
itself is compared without prefetch, base against the 250-row pages fix (one
fix at a time, below). The walks above are unaffected: each must reach the
six-month-old header to pass.

## Results: head against base (server mode)

The real API on a fresh SQLite file behind a proxy adding 60 ms per request
(`srv-base` at `f2bdc3f`, `srv-final` at `bfbf4f0`, both with harness
`a4df340`; short tests 6 iterations, walks 3).

| Measure | Base | Head |
| --- | --- | --- |
| launch to Accounts list, CPU | 2.15 s | 1.76 s (-18%) |
| open All register, CPU | 0.67 s | 0.38 s (-43%) |
| open quiet account, CPU | 0.73 s | 0.45 s (-39%) |
| launch then open an account, CPU | 3.03 s | 2.29 s (-24%) |
| quiet account: scroll back six months, clock | 28.2 s | 13.6 s (-52%) |
| quiet account: scroll back six months, CPU | 13.2 s | 5.9 s (-56%) |
| All: scroll back six months, clock | 323.6 s | 301.3 s (-7%) |
| All: scroll back six months, CPU | 110.3 s | 71.1 s (-36%) |
| open a screen or launch, clock | 2.3 to 6.8 s | unchanged (within 3%) |

Base's single Load older tap took 1.77 s (0.58 s CPU) against the API; the
head has none to time, as above.

## Results: one fix at a time (local mode)

Base plus one patch from [`diag/`](diag/). Base and head pooled as above;
prefetch and pages pool two rounds of short tests and one walk run each. The
Assistant column is one round (`r1-fix-assistant`), its quiet walk
`walk-fix-assistant` and its All walk a single walk (`hang-fix-assistant`, see
below). The Load older rows use the stricter harness only: `t09-base`,
`r1-fix-assistant` and `r2-fix-pages`.

| Measure | Base | Assistant fix | Prefetch | 250-row pages | Head (all three) |
| --- | --- | --- | --- | --- | --- |
| launch to first responsive frame | 1.34 s | 1.15 s (-14%) | 1.48 s (+10%) | 1.36 s (+1%) | 1.13 s (-16%) |
| launch to Accounts list, CPU | 2.36 s | 1.88 s (-20%) | 2.37 s (0%) | 2.31 s (-2%) | 1.80 s (-24%) |
| open All register, CPU | 0.70 s | 0.39 s (-44%) | 0.73 s (+5%) | 0.71 s (+2%) | 0.39 s (-44%) |
| open busy account, CPU | 0.85 s | 0.54 s (-36%) | 0.85 s (0%) | 0.82 s (-4%) | 0.51 s (-40%) |
| three fast flings, CPU | 2.74 s | 1.67 s (-39%) | 2.92 s (+7%) | 2.75 s (+1%) | 1.65 s (-40%) |
| open Reflect, CPU | 0.60 s | 0.29 s (-51%) | 0.55 s (-9%) | 0.58 s (-4%) | 0.28 s (-53%) |
| one Load older tap until the page shows, clock | 1.76 s | 1.43 s (-18%) | no tap | 1.43 s (-19%) | no tap |
| one Load older tap, CPU | 0.58 s | 0.41 s (-30%) | no tap | 0.58 s (0%) | no tap |
| quiet account: six months back, clock | 28.7 s | 27.7 s (-4%) | 29.1 s (+1%) | 14.5 s (-50%) | 14.2 s (-50%) |
| quiet account: six months back, CPU | 13.3 s | 9.1 s (-32%) | 13.2 s (-1%) | 8.2 s (-38%) | 5.9 s (-56%) |
| All: six months back, clock | 324.8 s | 348.0 s (+7%, one walk) | 304.8 s (-6%) | 312.8 s (-4%) | 303.2 s (-7%) |
| All: six months back, CPU | 111.1 s | 117.2 s (+5%, one walk) | 104.9 s (-6%) | 107.5 s (-3%) | 72.0 s (-35%) |

- The Assistant fix carries the launch, screen-open and fling gains. Prefetch
  and page size do not touch launch or screen opens; their launch columns are
  within the drift between rounds.
- Prefetch takes about 20 s off the All walk, roughly the time base spent
  waiting on its Load older taps. With prefetch there is no idle Load older to
  tap (see above).
- 250-row pages halve the quiet account's walk, and one tap brings 250 rows in
  less time than base took for 100.
- No single fix cuts the All walk's CPU by much; the head's 35% needs the three
  together. This pass did not isolate why.

### Stalls in the Assistant-only All walk

Two of the first three Assistant-only All walk runs (`walk-fix-assistant`,
`walk-fix-assistant-2`: base plus `fix-assistant.patch`, so 100-row pages and
no prefetch) went silent late in the test, 837 s and 969 s in, and XCTest
ended them without metrics. A 704 s run (`hang-fix-assistant`) did not stall.
During a full-length repeat (`hang-fix-assistant-3`) the Mac's disk was found
full (benchmark results and leftover worktrees), and two simulators left over
from a VM restart had been booted before the run; the silent stalls fit both.
After the disk was cleared that run failed differently: in its third walk Load
older did nothing three taps in a row. Its row had come to rest under the
minimised tab bar (row y 787 to 851, bar 791 to 874), XCTest's element tap
landed on the bar, and a coordinate tap at the same point reached the list.
The Assistant sat at (326, 740, 48, 48), clear of the row. So none of these
runs points at the app hanging; the first is a full disk, the second a tap the
harness aims badly. Eight other full-length All walk runs (1,260 to 1,360 s
each, on base, the head and the other one-fix builds) finished cleanly, and the
head almost never taps Load older because of prefetch. The Assistant column's
All walk is therefore a single walk.

## Accessibility off (no UI automation)

`run-bench.sh … idle` launches straight into the All register (via
`diag/open-all-on-launch.patch`) and records 30 s of Time Profiler with no
XCTest attached.

| Revision | App CPU in 30 s | Main thread | Assistant tracking | Assistant on screen |
| --- | --- | --- | --- | --- |
| base `f2bdc3f` | 1292 ms | 976 ms | 189 ms | no |
| scan cached (`fix-pins`) | 1229 ms | 957 ms | 177 ms | no |
| geometry anchor `b7b6a45` | 1124 ms | 837 ms | 35 ms | yes, 56 pt above Add |
| head `bfbf4f0` (`idle-final`) | 1048 ms | 791 ms | 31 ms | yes, above Add |

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
