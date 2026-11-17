#!/usr/bin/env bash
# Runs the real Worker locally (`apps/worker`, env `local`) over a local D1
# database kept in STATE_DIR. Used by `bun run dev:stack` and verify-howmuch's
# control-howmuch, so local development runs the code production runs.
#
#   scripts/local-worker.sh prepare STATE_DIR [PLAN_NAME]
#     Apply the D1 migrations. With PLAN_NAME, create plan `local-plan` with
#     that name (the API has no plan-rename route).
#   scripts/local-worker.sh start STATE_DIR PORT [wrangler dev args...]
#     Serve the API on 127.0.0.1:PORT, for example with
#     --var HOWMUCH_API_TOKEN:<token> --inspector-port <port>.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export WRANGLER_SEND_METRICS=false

wrangler() { (cd "$ROOT/apps/worker" && bunx wrangler "$@"); }

cmd="${1-}"; state="${2-}"
[[ -n "$state" ]] || { echo "usage: $0 prepare|start STATE_DIR ..." >&2; exit 1; }
mkdir -p "$state"; state="$(cd "$state" && pwd)"

case "$cmd" in
  prepare)
    wrangler d1 migrations apply DB --local --env local --persist-to "$state" >/dev/null
    if [[ -n "${3-}" ]]; then
      name="${3//\'/\'\'}"
      wrangler d1 execute DB --local --env local --persist-to "$state" --command \
        "INSERT INTO plans(id,name,external_ynab_id,first_month,last_month) VALUES ('local-plan','$name','local-plan',strftime('%Y-%m','now'),strftime('%Y-%m','now')) ON CONFLICT(id) DO NOTHING" >/dev/null
    fi
    echo "local D1 ready in $state"
    ;;
  start)
    port="${3-}"; [[ -n "$port" ]] || { echo "usage: $0 start STATE_DIR PORT" >&2; exit 1; }
    shift 3
    # Wrangler refuses to start without the assets directory. Vite serves the
    # web app in development, so an empty one is enough.
    mkdir -p "$ROOT/apps/web/dist"
    cd "$ROOT/apps/worker"
    exec bunx wrangler dev --env local --local --persist-to "$state" \
      --ip 127.0.0.1 --port "$port" --test-scheduled "$@"
    ;;
  *) echo "usage: $0 prepare|start STATE_DIR ..." >&2; exit 1 ;;
esac
