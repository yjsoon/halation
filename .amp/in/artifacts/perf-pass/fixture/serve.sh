#!/usr/bin/env bash
# Isolated HowMuch API loaded with perf-snapshot.json, for benchmarking.
#
#   serve.sh <port> [latency_ms]   start the API on 127.0.0.1:<port> with a fresh
#                                  SQLite file, create the owner, import the
#                                  snapshot; with latency_ms > 0 also start a
#                                  delaying proxy on <port+1>
#   serve.sh stop [port]           stop what serve.sh started (every instance,
#                                  or just <port>) and delete its temp dir
#
# Prints one JSON state line on success. No tmux; processes run in the
# background with pid and log files next to the database. Works with macOS
# bash 3.2 and BSD tools as well as Linux. Needs bun and curl.
#
# Environment:
#   HOWMUCH_PERF_SNAPSHOT    snapshot to import (default: perf-snapshot.json here)
#   HOWMUCH_PERF_STATE_ROOT  parent of the run dirs (default: $TMPDIR or /tmp)
#   HOWMUCH_PERF_KEEP=1      on stop, keep the run dir (db and logs)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
SNAPSHOT="${HOWMUCH_PERF_SNAPSHOT:-$HERE/perf-snapshot.json}"
STATE_PARENT="${HOWMUCH_PERF_STATE_ROOT:-${TMPDIR:-/tmp}}"
STATE_ROOT="${STATE_PARENT%/}/howmuch-perf"
PLAN_ID="plan_perfbench0000"
USERNAME="perf"
PASSWORD="perf-bench-password-15"
SETUP_TOKEN="perf-bench-bootstrap"
IMPORT_KEY="perf-bench-import-0001"
SGD_FORMAT='{"iso_code":"SGD","example_format":"$123,456.78","decimal_digits":2,"decimal_separator":".","symbol_first":true,"group_separator":",","currency_symbol":"$","display_symbol":true}'

RUN_DIR=""

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

log() { printf '%s\n' "$*" >&2; }

die() {
  log "error: $*"
  if [ -n "$RUN_DIR" ] && [ -d "$RUN_DIR" ]; then
    if [ -f "$RUN_DIR/api.log" ]; then
      log "--- last lines of $RUN_DIR/api.log ---"
      tail -n 20 "$RUN_DIR/api.log" >&2 || true
    fi
    kill_pidfile "$RUN_DIR/proxy.pid"
    kill_pidfile "$RUN_DIR/api.pid"
    log "left $RUN_DIR for inspection"
  fi
  exit 1
}

need() { command -v "$1" >/dev/null 2>&1 || die "missing $1 on PATH"; }

# json_get <dotted.path> < json   (bun is required anyway; jq is not on stock macOS)
json_get() {
  JSON_PATH="$1" bun -e '
    const value = (process.env.JSON_PATH ?? "").split(".").filter(Boolean)
      .reduce((node, key) => (node == null ? undefined : node[key]), JSON.parse(await Bun.stdin.text()));
    if (value === undefined) process.exit(3);
    console.log(typeof value === "string" ? value : JSON.stringify(value));
  '
}

alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

kill_pidfile() {
  local file="$1" pid i
  [ -f "$file" ] || return 0
  pid="$(cat "$file" 2>/dev/null || true)"
  if alive "$pid"; then
    kill "$pid" 2>/dev/null || true
    i=0
    while alive "$pid" && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
    alive "$pid" && kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$file"
}

port_busy() { curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$1/" ; }

wait_health() {
  local url="$1" pidfile="$2" i=0
  while [ "$i" -lt 300 ]; do
    if curl -fsS --max-time 2 "$url/health" 2>/dev/null | grep -q '"ok":true'; then return 0; fi
    alive "$(cat "$pidfile")" || die "process in $pidfile exited before $url/health answered"
    sleep 0.1
    i=$((i + 1))
  done
  die "timed out waiting for $url/health"
}

cmd_stop() {
  local only="${1:-}" pointer dir found=0
  [ -d "$STATE_ROOT" ] || { log "nothing to stop"; return 0; }
  for pointer in "$STATE_ROOT"/port-*; do
    [ -f "$pointer" ] || continue
    if [ -n "$only" ] && [ "$pointer" != "$STATE_ROOT/port-$only" ]; then continue; fi
    found=1
    dir="$(cat "$pointer")"
    kill_pidfile "$dir/proxy.pid"
    kill_pidfile "$dir/api.pid"
    rm -f "$pointer"
    if [ "${HOWMUCH_PERF_KEEP:-0}" = "1" ]; then
      log "stopped ${pointer##*/}; kept $dir"
    else
      case "$dir" in
        "$STATE_ROOT"/run.*) rm -rf "$dir" ;;
        *) log "not deleting unexpected dir $dir" ;;
      esac
      log "stopped ${pointer##*/}; removed $dir"
    fi
  done
  [ "$found" = 1 ] || log "nothing to stop${only:+ on port $only}"
}

cmd_start() {
  local port="$1" latency="${2:-0}" proxy_port api proxy="" db token code import_seconds pointer existing
  case "$port" in ''|*[!0-9]*) die "port must be a number" ;; esac
  case "$latency" in ''|*[!0-9]*) die "latency_ms must be a whole number" ;; esac
  [ "$port" -ge 1024 ] && [ "$port" -le 65534 ] || die "port must be 1024-65534"
  need bun; need curl
  [ -f "$SNAPSHOT" ] || die "no snapshot at $SNAPSHOT (run: bun $HERE/make-snapshot.ts)"
  [ -d "$ROOT/node_modules" ] || die "dependencies missing; from $ROOT run: bun install --frozen-lockfile"

  mkdir -p "$STATE_ROOT"
  pointer="$STATE_ROOT/port-$port"
  if [ -f "$pointer" ]; then
    existing="$(cat "$pointer")"
    if alive "$(cat "$existing/api.pid" 2>/dev/null || true)"; then
      die "serve.sh already runs on port $port ($existing); run: serve.sh stop $port"
    fi
    log "discarding stale state for port $port"
    cmd_stop "$port"
  fi
  port_busy "$port" && die "something already listens on 127.0.0.1:$port"
  proxy_port=$((port + 1))
  if [ "$latency" -gt 0 ]; then
    port_busy "$proxy_port" && die "something already listens on 127.0.0.1:$proxy_port (proxy port)"
  fi

  RUN_DIR="$(mktemp -d "$STATE_ROOT/run.XXXXXX")"
  printf '%s\n' "$RUN_DIR" >"$pointer"
  db="$RUN_DIR/howmuch.sqlite"
  api="http://127.0.0.1:$port"

  log "migrating $db"
  (cd "$ROOT" && HOWMUCH_DB_PATH="$db" bun apps/api/src/migrate.ts >"$RUN_DIR/migrate.log" 2>&1) || die "migration failed; see $RUN_DIR/migrate.log"

  log "starting API on $api"
  (
    cd "$ROOT"
    export HOWMUCH_DB_PATH="$db" HOWMUCH_PORT="$port" PORT="$port" HOWMUCH_HOST=127.0.0.1 \
      HOWMUCH_API_TOKEN="$SETUP_TOKEN" HOWMUCH_DEFAULT_PLAN_ID="$PLAN_ID" HOWMUCH_TRANSITION_READ_ONLY=false \
      HOWMUCH_YNAB_TOKEN= HOWMUCH_YNAB_PLAN_ID= TYPESAFE_API_KEY=
    nohup bun apps/api/src/server.ts </dev/null >"$RUN_DIR/api.log" 2>&1 &
    printf '%s\n' "$!" >"$RUN_DIR/api.pid"
  )
  wait_health "$api" "$RUN_DIR/api.pid"

  log "creating owner $USERNAME"
  code="$(curl -sS -o "$RUN_DIR/setup.json" -w '%{http_code}' -X POST "$api/api/auth/setup" \
    -H "origin: $api" -H "authorization: Bearer $SETUP_TOKEN" -H 'content-type: application/json' \
    --data "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"currency_format\":$SGD_FORMAT,\"date_format\":{\"format\":\"DD/MM/YYYY\"}}")"
  [ "$code" = 200 ] || die "setup returned HTTP $code: $(cat "$RUN_DIR/setup.json")"

  log "signing in"
  code="$(curl -sS -o "$RUN_DIR/token.json" -w '%{http_code}' -X POST "$api/api/auth/token" \
    -H 'content-type: application/json' --data "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")"
  [ "$code" = 200 ] || die "sign-in returned HTTP $code: $(cat "$RUN_DIR/token.json")"
  token="$(json_get data.token <"$RUN_DIR/token.json")" || die "no token in $RUN_DIR/token.json"

  log "importing $(wc -c <"$SNAPSHOT" | tr -d ' ') bytes from $SNAPSHOT"
  code="$( { printf '{"snapshot":'; cat "$SNAPSHOT"; printf '}'; } | curl -sS -o "$RUN_DIR/import.json" \
    -w '%{http_code} %{time_total}' -X POST "$api/v1/plans/$PLAN_ID/import_snapshot" \
    -H "authorization: Bearer $token" -H "idempotency-key: $IMPORT_KEY" -H 'content-type: application/json' \
    --data-binary @-)"
  import_seconds="${code#* }"
  code="${code%% *}"
  [ "$code" = 201 ] || die "import returned HTTP $code: $(head -c 2000 "$RUN_DIR/import.json")"
  log "imported in ${import_seconds}s: $(json_get data.imported <"$RUN_DIR/import.json")"

  if [ "$latency" -gt 0 ]; then
    proxy="http://127.0.0.1:$proxy_port"
    log "starting latency proxy on $proxy (+${latency} ms)"
    nohup bun "$HERE/latency-proxy.ts" "$proxy_port" "$api" "$latency" </dev/null >"$RUN_DIR/proxy.log" 2>&1 &
    printf '%s\n' "$!" >"$RUN_DIR/proxy.pid"
    wait_health "$proxy" "$RUN_DIR/proxy.pid"
  fi

  S_API="$api" S_PROXY="$proxy" S_LATENCY="$latency" S_PLAN="$PLAN_ID" S_USER="$USERNAME" S_PASS="$PASSWORD" \
    S_TOKEN="$token" S_SETUP="$SETUP_TOKEN" S_DB="$db" S_DIR="$RUN_DIR" S_PID="$(cat "$RUN_DIR/api.pid")" \
    S_PROXY_PID="$(cat "$RUN_DIR/proxy.pid" 2>/dev/null || true)" S_IMPORT="$import_seconds" \
    bun -e '
      const e = process.env;
      const state = {
        api_url: e.S_API, plan_id: e.S_PLAN, username: e.S_USER, password: e.S_PASS, db_path: e.S_DB, pid: Number(e.S_PID),
        ...(e.S_PROXY ? { proxy_url: e.S_PROXY, proxy_pid: Number(e.S_PROXY_PID), latency_ms: Number(e.S_LATENCY) } : {}),
        token: e.S_TOKEN, setup_token: e.S_SETUP, run_dir: e.S_DIR, import_seconds: Number(e.S_IMPORT),
      };
      const line = JSON.stringify(state);
      await Bun.write(e.S_DIR + "/state.json", line + "\n");
      console.log(line);
    '
  RUN_DIR=""
}

case "${1:-}" in
  stop) shift; cmd_stop "${1:-}" ;;
  -h|--help|help|"") usage ;;
  *) cmd_start "$1" "${2:-0}" ;;
esac
