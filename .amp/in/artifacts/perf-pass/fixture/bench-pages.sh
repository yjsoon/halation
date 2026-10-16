#!/usr/bin/env bash
# Times the transaction-register pages against a running API (or the latency proxy).
#
#   bench-pages.sh <base_url> <bearer_token> [runs] [plan_id]
#   e.g. bench-pages.sh http://127.0.0.1:8787 "$TOKEN" 10
#
# For each page it runs curl <runs> times (default 10) and prints the median,
# min and max of curl's time_total, plus the page's row count and has_more.
# bash 3.2 and BSD tools are enough; needs curl and bun (for JSON).
set -euo pipefail

base="${1:?usage: bench-pages.sh <base_url> <bearer_token> [runs] [plan_id]}"
token="${2:?usage: bench-pages.sh <base_url> <bearer_token> [runs] [plan_id]}"
runs="${3:-10}"
plan="${4:-plan_perfbench0000}"

for query in "limit=100&offset=0" "limit=250&offset=0" "limit=100&offset=10000"; do
  url="${base%/}/v1/plans/$plan/transactions?$query"
  times=""
  i=0
  while [ "$i" -lt "$runs" ]; do
    times="$times $(curl -sS -o /dev/null -w '%{time_total}' -H "authorization: Bearer $token" "$url")"
    i=$((i + 1))
  done
  meta="$(curl -sS -H "authorization: Bearer $token" "$url" | bun -e '
    const d = JSON.parse(await Bun.stdin.text()).data;
    console.log(`rows=${d.transactions.length} has_more=${d.has_more} dates=${d.transactions.at(-1)?.date}..${d.transactions[0]?.date}`);
  ')"
  printf '%s\n' $times | sort -n | awk -v q="$query" -v meta="$meta" '
    { t[NR] = $1 * 1000 }
    END {
      median = (NR % 2) ? t[(NR + 1) / 2] : (t[NR / 2] + t[NR / 2 + 1]) / 2
      printf "%-24s median %7.1f ms  min %7.1f  max %7.1f  (n=%d; %s)\n", q, median, t[1], t[NR], NR, meta
    }'
done
