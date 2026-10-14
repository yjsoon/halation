#!/usr/bin/env bash
# Re-runs every browser probe in this folder against the disposable stack.
# WEB defaults to the URL in common.mjs; set it from `control-howmuch state`.
set -uo pipefail
cd "$(dirname "$0")"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
for probe in statement drilldown keyboard compose-focus icon-focus delete-focus multiselect-focus clear-filters-focus bulk-clear-focus rewards-done-focus toast-focus confirm-focus; do
  echo "== $probe"
  node "$probe.mjs" 2>&1 | grep -v '^    at '
done
