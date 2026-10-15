#!/usr/bin/env bash
# Benchmarks one revision of the HowMuch iOS app on a simulator.
#
# Usage (from anywhere inside the repo):
#   SIMULATOR_UDID=<udid> run-bench.sh <label> <git-rev> [measure|profile|both|idle|placement]
#
# Environment:
#   PERF_MODE        local (default: seeded on-device ledger) or server
#   PERF_SERVER_URL  server mode: API (or latency proxy) URL reachable from the simulator
#   PERF_USERNAME / PERF_PASSWORD  server mode credentials
#   PERF_ITERATIONS  iterations per measured test (default 8)
#   PERF_LOCAL_DB    local mode: seeded howmuch.sqlite (default ../fixture/howmuch.sqlite)
#   PERF_WORK        scratch root (default ~/perf-work)
#   PERF_ONLY        optional space-separated test names to measure, e.g. "test03_OpenAllRegister test09_LoadOlderPage"
#   PERF_PATCH       optional space-separated patches applied to the worktree before building
#   XCTRACE          xctrace binary to record with (default: xcrun xctrace); Xcode 26.6's
#                    records empty traces on some hosts, so point this at a working one
#
# Each run builds the revision in Release with the throwaway UI-test target,
# reinstalls the app from scratch (so every revision starts from the same
# state), runs the one-time setup test, then the measured tests and/or a
# Time Profiler tour. Results land in $PERF_WORK/results/<label>-<stamp>/.
set -euo pipefail

LABEL="$1"
REV="$2"
WHAT="${3:-measure}"
HARNESS="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git -C "$HARNESS" rev-parse --show-toplevel)"
WORK="${PERF_WORK:-$HOME/perf-work}"
UDID="${SIMULATOR_UDID:?set SIMULATOR_UDID}"
read -r -a XCTRACE_CMD <<<"${XCTRACE:-xcrun xctrace}"
MODE="${PERF_MODE:-local}"
ITER="${PERF_ITERATIONS:-8}"
LOCAL_DB="${PERF_LOCAL_DB:-$HARNESS/../fixture/howmuch.sqlite}"
BUNDLE=sg.soon.howmuch
STAMP="$(date +%Y%m%d-%H%M%S)"
SRC="$WORK/src-$LABEL"
DD="$WORK/dd-$LABEL"
OUT="$WORK/results/$LABEL-$STAMP"
mkdir -p "$OUT" "$WORK"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$OUT/run.log"; }

log "label=$LABEL rev=$REV what=$WHAT mode=$MODE iterations=$ITER udid=$UDID"

# 1. Fresh detached worktree at the revision, plus the throwaway perf target.
if [[ -d "$SRC" ]]; then
  git -C "$ROOT" worktree remove --force "$SRC" 2>/dev/null || rm -rf "$SRC"
fi
git -C "$ROOT" worktree prune
git -C "$ROOT" worktree add --force --detach "$SRC" "$REV" >>"$OUT/run.log" 2>&1
RESOLVED="$(git -C "$SRC" rev-parse HEAD)"
log "worktree $SRC at $RESOLVED"
echo "$RESOLVED" >"$OUT/revision.txt"
if [[ -n "${PERF_PATCH:-}" ]]; then
  # Apply local patches (extra logging, or one fix on its own) to the worktree.
  for patch in $PERF_PATCH; do
    git -C "$SRC" apply "$patch"
    log "applied $patch"
  done
fi
ruby "$HARNESS/add-perf-target.rb" "$SRC" "$HARNESS/HowMuchPerfUITests.swift" | tee -a "$OUT/run.log"

# 2. Release build for testing, signed ad hoc for the simulator (no team, no profile).
SIGNING=(
  CODE_SIGNING_ALLOWED=YES
  CODE_SIGN_IDENTITY=-
  CODE_SIGNING_REQUIRED=NO
  CODE_SIGN_STYLE=Manual
  PROVISIONING_PROFILE=
  PROVISIONING_PROFILE_SPECIFIER=
)
COMMON=(
  -project "$SRC/apps/ios/HowMuch.xcodeproj"
  -scheme HowMuchPerf
  -configuration Release
  -destination "platform=iOS Simulator,id=$UDID"
  -derivedDataPath "$DD"
)
log "build-for-testing (Release)"
set +e
xcodebuild "${COMMON[@]}" -jobs 4 COMPILER_INDEX_STORE_ENABLE=NO "${SIGNING[@]}" build-for-testing >"$OUT/build.log" 2>&1
BUILD_STATUS=$?
set -e
if [[ $BUILD_STATUS -ne 0 ]]; then
  log "BUILD FAILED (exit $BUILD_STATUS); last lines:"
  tail -60 "$OUT/build.log" | tee -a "$OUT/run.log"
  exit 1
fi
APP="$DD/Build/Products/Release-iphonesimulator/HowMuch.app"
[[ -d "$APP" ]] || { log "no app at $APP"; exit 1; }
log "built $(du -sh "$APP" | cut -f1) app; executable $(stat -f%z "$APP/HowMuch" 2>/dev/null || wc -c <"$APP/HowMuch") bytes"

# 3. Same starting state for every revision: clean install, seeded ledger.
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
xcrun simctl uninstall "$UDID" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$UDID" "$APP"
if [[ "$MODE" == local ]]; then
  DATA="$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)"
  mkdir -p "$DATA/Library/Application Support/HowMuch/Local"
  cp "$LOCAL_DB" "$DATA/Library/Application Support/HowMuch/Local/howmuch.sqlite"
  rm -f "$DATA/Library/Application Support/HowMuch/Local/howmuch.sqlite-wal" \
    "$DATA/Library/Application Support/HowMuch/Local/howmuch.sqlite-shm"
  # Adopting the seeded plan would otherwise add the starter categories to it
  # (duplicate "Everyday", "Bills", "Groceries"), which server mode never sees.
  xcrun simctl spawn "$UDID" defaults write "$BUNDLE" HowMuch.StarterCategoriesSeeded.plan_perfbench0000 -bool YES
  log "seeded local ledger into $DATA"
fi

run_tests() {
  local name="$1"
  shift
  log "xcodebuild test-without-building: $name"
  set +e
  env \
    TEST_RUNNER_PERF_MODE="$MODE" \
    TEST_RUNNER_PERF_ITERATIONS="$ITER" \
    TEST_RUNNER_PERF_SERVER_URL="${PERF_SERVER_URL:-}" \
    TEST_RUNNER_PERF_USERNAME="${PERF_USERNAME:-perf}" \
    TEST_RUNNER_PERF_PASSWORD="${PERF_PASSWORD:-perf-bench-password-15}" \
    xcodebuild "${COMMON[@]}" "${SIGNING[@]}" \
      -resultBundlePath "$OUT/$name.xcresult" \
      -collect-test-diagnostics never \
      test-without-building "$@" >"$OUT/$name.log" 2>&1
  local status=$?
  set -e
  log "$name exit=$status; $(grep -E 'Executed [0-9]+ tests?' "$OUT/$name.log" | tail -1)"
  grep -E "error:|failed|Failing tests|timed out" "$OUT/$name.log" | head -20 | tee -a "$OUT/run.log" || true
  return 0
}

T=HowMuchPerfUITests/HowMuchPerfUITests
run_tests setup -only-testing:"$T/test00_Setup"

if [[ "$WHAT" == measure || "$WHAT" == both ]]; then
  if [[ -n "${PERF_ONLY:-}" ]]; then
    ONLY=()
    for name in $PERF_ONLY; do
      ONLY+=(-only-testing:"$T/$name")
    done
    run_tests measure "${ONLY[@]}"
  else
    run_tests measure -only-testing:"$T" -skip-testing:"$T/test00_Setup" \
      -skip-testing:"$T/testYY_AssistantPlacement" -skip-testing:"$T/testZZ_ProfileTour"
  fi
  python3 "$HARNESS/parse-measure.py" "$LABEL" "$OUT/measure.log" >"$OUT/results.json"
  log "results: $OUT/results.json"
fi

if [[ "$WHAT" == profile || "$WHAT" == both ]]; then
  # Launch profile: record the simulator's processes while the app cold-launches.
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  sleep 2
  log "xctrace: cold launch"
  "${XCTRACE_CMD[@]}" record --template 'Time Profiler' --device "$UDID" --all-processes \
    --time-limit 15s --output "$OUT/launch.trace" >>"$OUT/run.log" 2>&1 &
  TRACE_PID=$!
  sleep 4
  xcrun simctl launch "$UDID" "$BUNDLE" >>"$OUT/run.log" 2>&1 || true
  wait "$TRACE_PID" || true
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true

  log "xctrace: register/reflect tour"
  "${XCTRACE_CMD[@]}" record --template 'Time Profiler' --device "$UDID" --all-processes \
    --time-limit 150s --output "$OUT/tour.trace" >>"$OUT/run.log" 2>&1 &
  TRACE_PID=$!
  sleep 4
  run_tests tour -only-testing:"$T/testZZ_ProfileTour"
  kill -INT "$TRACE_PID" 2>/dev/null || true
  wait "$TRACE_PID" || true

  for name in launch tour; do
    if [[ -d "$OUT/$name.trace" ]]; then
      "${XCTRACE_CMD[@]}" export --input "$OUT/$name.trace" \
        --xpath '/trace-toc/run[@number="1"]/data/table[@schema="time-profile"]' \
        --output "$OUT/$name-tp.xml" >>"$OUT/run.log" 2>&1 || log "export failed for $name"
      if [[ -f "$OUT/$name-tp.xml" ]]; then
        python3 "$HARNESS/tp-summary.py" "$OUT/$name-tp.xml" --process HowMuch >"$OUT/$name-summary.txt" 2>&1 || true
        log "profile summary: $OUT/$name-summary.txt"
      fi
    fi
  done
fi

if [[ "$WHAT" == placement ]]; then
  # Floating Assistant placement on Accounts, in a scrolled register and back
  # at the top, then a tap. Screenshots stay in placement.xcresult.
  run_tests placement -only-testing:"$T/testYY_AssistantPlacement"
  grep PERFPLACE "$OUT/placement.log" | tee -a "$OUT/run.log" || true
fi

if [[ "$WHAT" == idle ]]; then
  # No UI automation: launch straight into the All register (needs
  # diag/open-all-on-launch.patch in PERF_PATCH) and profile it sitting idle,
  # so accessibility stays off as on most phones.
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  sleep 2
  log "xctrace: All register, idle, no UI automation"
  "${XCTRACE_CMD[@]}" record --template 'Time Profiler' --device "$UDID" --all-processes \
    --time-limit 30s --output "$OUT/idle.trace" >>"$OUT/run.log" 2>&1 &
  TRACE_PID=$!
  sleep 4
  xcrun simctl launch "$UDID" "$BUNDLE" -PerfOpenAll >>"$OUT/run.log" 2>&1 || true
  wait "$TRACE_PID" || true
  xcrun simctl io "$UDID" screenshot "$OUT/idle.png" >/dev/null 2>&1 || true
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  "${XCTRACE_CMD[@]}" export --input "$OUT/idle.trace" \
    --xpath '/trace-toc/run[@number="1"]/data/table[@schema="time-profile"]' \
    --output "$OUT/idle-tp.xml" >>"$OUT/run.log" 2>&1 || log "export failed for idle"
  if [[ -f "$OUT/idle-tp.xml" ]]; then
    python3 "$HARNESS/tp-summary.py" "$OUT/idle-tp.xml" --process HowMuch >"$OUT/idle-summary.txt" 2>&1 || true
    python3 "$HARNESS/tp-summary.py" "$OUT/idle-tp.xml" --process HowMuch --callers 'onDisplayTick' --depth 4 \
      >"$OUT/idle-display-tick.txt" 2>&1 || true
    log "profile summary: $OUT/idle-summary.txt"
  fi
fi

log "done: $OUT"
