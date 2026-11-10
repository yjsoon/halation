#!/bin/bash
# Web register masthead states on a control-howmuch stack. Invented values only.
# Usage: states.sh <api_url> <web_url> <out_dir>, with agent-browser signed in as verifier on <web_url>.
# Each export below is fixtures/rewards-tracker-export.json with Travel Card (acct-credit) changed by jq.
set -e
API=$1; WEB=$2; OUT=$3; mkdir -p "$OUT"
FIX=$(cd "$(dirname "$0")/../../../../.." && pwd)/fixtures/rewards-tracker-export.json
TOK=$(curl -s -X POST "$API/api/auth/token" -H 'content-type: application/json' \
  -d '{"username":"verifier","password":"howmuch-verify-15"}' | jq -r '.data.token')
card='.cards[0] |= (.subcategoriesEnabled = false)'
declare -A STATES=(
  [gate]="$card | .cards[0].minimumSpend = 800"
  [met]="$card | .cards[0].minimumSpend = 300"
  [capped]="$card | .cards[0].minimumSpend = 300 | .cards[0].maximumSpend = 380"
  [named]="$card | .cards[0].minimumSpend = 800 | .cards[0].name = \"Halo Miles\""
  [two]="$card | .cards += [.cards[0] + {id: \"card-second\", name: \"Second Card\", type: \"cashback\"}]"
)
for state in gate met capped named two; do
  jq "${STATES[$state]} | {plan_id: \"local-plan\", payload: .}" "$FIX" \
    | curl -s -X POST "$API/api/import/rewards-tracker" -H "Authorization: Bearer $TOK" -H 'content-type: application/json' --data @- >/dev/null
  for mode in light dark; do for vp in "1280 860" "390 844"; do
    agent-browser set viewport $vp 2 >/dev/null
    agent-browser open "$WEB/transactions?accounts=acct-credit&range=all" >/dev/null; sleep 3
    agent-browser eval "document.documentElement.dataset.mode='$mode'" >/dev/null; sleep 1.2
    agent-browser screenshot "$OUT/$state-${vp%% *}-$mode.png" >/dev/null
  done; done
  echo "$state: $(agent-browser eval "document.querySelector('.register-masthead')?.dataset.stage ?? 'plain'")"
done
