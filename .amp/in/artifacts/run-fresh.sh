#!/usr/bin/env bash
# Usage (repo root): .amp/in/artifacts/run-fresh.sh <driver.cjs> <out-dir>
# Relaunches a disposable verify stack (private state root), runs a Playwright driver against it, tears down.
set -euo pipefail
export HOWMUCH_VERIFY_STATE_ROOT=/tmp/hm-verify-ac114
export PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH"
control-howmuch cleanup >/dev/null 2>&1 || true
control-howmuch launch >/dev/null 2>&1
WEB=$(control-howmuch state | sed -n 's/.*"web_url": "\(.*\)",/\1/p')
API=$(control-howmuch state | sed -n 's/.*"api_url": "\(.*\)",/\1/p')
mkdir -p "$2"
NODE_PATH=/opt/node22/lib/node_modules WEB="$WEB" API="$API" OUT="$2" node "$1"
control-howmuch cleanup >/dev/null 2>&1 || true
