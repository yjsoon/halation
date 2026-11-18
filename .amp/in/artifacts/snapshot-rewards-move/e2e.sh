#!/usr/bin/env bash
# usage: both.sh <label> <engine-repo> ; server always runs this worktree's API.
set -u
label=$1; engine_repo=$2; dir=/tmp/move-e2e/$label
rm -rf "$dir"; mkdir -p "$dir"
HOWMUCH_DB_PATH=$dir/server.sqlite PORT=8791 HOWMUCH_API_TOKEN=e2e-server-token HOWMUCH_DEFAULT_PLAN_ID=e2e-server bun apps/api/src/server.ts > "$dir/server.log" 2>&1 &
server=$!
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8791/health >/dev/null && break; sleep 0.5; done
bun .amp/in/orb-backup/move-e2e/run.ts "$engine_repo" http://127.0.0.1:8791 e2e-server-token > "$dir/run.log" 2>&1; echo "run exit=$?" >> "$dir/run.log"
bun -e 'const {Database}=require("bun:sqlite");const db=new Database(process.argv[1],{readonly:true});console.log("rewards_tracker_cards:",JSON.stringify(db.query("SELECT plan_id,id,account_id,name,type,deleted FROM rewards_tracker_cards").all()));console.log("rewards_tracker_snapshots:",JSON.stringify(db.query("SELECT plan_id, json_extract(payload_json, ?) AS settings FROM rewards_tracker_snapshots").all("$.settings")))' "$dir/server.sqlite" > "$dir/db.txt" 2>&1
kill $server; wait $server 2>/dev/null
