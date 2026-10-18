#!/bin/bash
# Usage: run.sh <db-dir> <port>. Synthetic data only; disposable SQLite file.
set -e
DB="$1/howmuch.sqlite"; PORT="$2"; TOKEN=e2e-token
start() {
  HOWMUCH_DB_PATH="$DB" PORT=$PORT HOWMUCH_API_TOKEN=$TOKEN bun apps/api/src/server.ts >"$1/server.log" 2>&1 & echo $! >"$1/pid"
  for i in $(seq 50); do
    kill -0 "$(cat "$1/pid")" 2>/dev/null || { echo "server exited; see $1/server.log" >&2; exit 1; }
    curl -sf localhost:$PORT/health >/dev/null && return; sleep 0.2
  done
  echo "server did not answer /health" >&2; exit 1
}
# Wait for the old process to exit, so the next start cannot be answered by it.
stop() { local pid; pid=$(cat "$1/pid"); kill "$pid"; wait "$pid" || true; ! kill -0 "$pid" 2>/dev/null; }
api() { curl -sS -X "$1" "localhost:$PORT$2" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' ${3:+-d "$3"}; }
HOWMUCH_DB_PATH="$DB" HOWMUCH_DEFAULT_PLAN_ID=local-plan bun scripts/seed-demo.ts >/dev/null
start "$1"
PLAN=$(api GET /v1/plans | jq -r '.data.plans[0].id')
ID=$(api POST /v1/plans/$PLAN/accounts '{"account":{"name":"Everyday","type":"checking"}}' | jq -r .data.account.id)
api PATCH /v1/plans/$PLAN/accounts/$ID '{"account":{"name":"💳 Daily"}}' >/dev/null
echo "before restart: $(api GET /v1/plans/$PLAN/accounts | jq -c --arg id $ID '.data.accounts[]|select(.id==$id)|{name,icon}')"
echo "stored row before: $(bun -e "const {Database}=require('bun:sqlite');console.log(JSON.stringify(new Database('$DB').query('SELECT name, icon FROM accounts WHERE id=?').get('$ID')))")"
KNOW_BEFORE=$(api GET /v1/plans/$PLAN/payees | jq .data.server_knowledge)
stop "$1"; start "$1"
echo "after restart:  $(api GET /v1/plans/$PLAN/accounts | jq -c --arg id $ID '.data.accounts[]|select(.id==$id)|{name,icon}')"
echo "stored row after:  $(bun -e "const {Database}=require('bun:sqlite');console.log(JSON.stringify(new Database('$DB').query('SELECT name, icon FROM accounts WHERE id=?').get('$ID')))")"
echo "payee server_knowledge before/after restart: $KNOW_BEFORE / $(api GET /v1/plans/$PLAN/payees | jq .data.server_knowledge)"
echo "transfer payee: $(api GET /v1/plans/$PLAN/payees | jq -c --arg id $ID '.data.payees[]|select(.transfer_account_id==$id)|.name')"
stop "$1"
