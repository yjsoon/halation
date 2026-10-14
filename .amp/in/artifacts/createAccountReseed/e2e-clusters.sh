#!/usr/bin/env bash
# Usage: e2e-clusters.sh <worktree> <outfile>
# Starts an isolated local API (temp SQLite, synthetic data), drives the four
# cluster flows over HTTP and writes a normalised transcript to <outfile>.
set -u
WT="$1"; OUT="$2"
DIR=$(mktemp -d)
PORT=$((20000 + RANDOM % 20000))
cd "$WT"
HOWMUCH_DB_PATH="$DIR/t.db" HOWMUCH_PORT=$PORT PORT=$PORT HOWMUCH_API_TOKEN=tok HOWMUCH_DEFAULT_PLAN_ID=plan-a HOWMUCH_TRANSITION_READ_ONLY=false \
  bun apps/api/src/server.ts >"$DIR/api.log" 2>&1 &
PID=$!
for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 0.2; done
PORTB=$((PORT + 1))
HOWMUCH_DB_PATH="$DIR/t.db" HOWMUCH_PORT=$PORTB PORT=$PORTB HOWMUCH_API_TOKEN=tok HOWMUCH_DEFAULT_PLAN_ID=plan-b HOWMUCH_TRANSITION_READ_ONLY=false \
  bun apps/api/src/server.ts >"$DIR/apib.log" 2>&1 &
PIDB=$!
trap 'kill $PID $PIDB 2>/dev/null' EXIT
for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORTB/health" >/dev/null && break; sleep 0.2; done
bun "$(dirname "$0")/e2e-clusters.mjs" "http://127.0.0.1:$PORT" "$DIR/t.db" "http://127.0.0.1:$PORTB" >"$OUT" 2>&1
echo "exit=$?"
