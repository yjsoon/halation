#!/bin/bash
# Quick pre-push checks for landing on main (AGENTS.md, "Landing work on
# main"). Selects checks from the paths this round changes against
# origin/main, committed or not:
#   docs/artefacts only  -> nothing to run
#   anything else        -> bun test, web and worker typecheck
#   web or iOS sources   -> scripts/verify-ios-* source lints
#   api/engine/packages  -> iOS engine freshness (pinned Bun 1.4.0)
#   iOS app or project   -> scripts/ios-xcodebuild.sh test (Mac only)
# HOWMUCH_CHECK_BASE overrides the base ref. Exits non-zero on any failure,
# including iOS changes checked on a machine without Xcode.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_REF="${HOWMUCH_CHECK_BASE:-origin/main}"
BASE="$(git merge-base "$BASE_REF" HEAD)"
CHANGED="$( { git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u)"

if [[ -z "$CHANGED" ]]; then echo "check: no changes against $BASE_REF"; exit 0; fi
echo "check: base $BASE_REF ($BASE)"; sed 's/^/  /' <<<"$CHANGED"

has() { grep -Eq "$1" <<<"$CHANGED"; }
step() { echo; echo "==> $*"; "$@"; }

# Verification media stays out of git (AGENTS.md, #371). Artefacts are often
# force-added past the ignore rule, so check the index too.
MEDIA="$(git ls-files -- .amp/in/artifacts .cursor/skills/verify-howmuch/artifacts | grep -Ei '\.(png|jpe?g|gif|webp|mp4|webm|mov)$' || true)"
if [[ -n "$MEDIA" ]]; then
  echo "check: screenshots and recordings must not be committed; keep the text record only:" >&2
  sed 's/^/  /' <<<"$MEDIA" >&2; exit 1
fi

if ! grep -Evq '(\.md$|^\.amp/in/)' <<<"$CHANGED"; then
  echo "check: docs and artefacts only, nothing to run"; exit 0
fi

step bun test
step bun run --cwd apps/web typecheck
step bun run --cwd apps/worker typecheck

# Source lints for iOS behaviour that simulator runs miss. Plain Bun, so they
# run on Linux too. Focus zoom measures the web CSS that iOS Safari renders.
if has '^(apps/web/|scripts/verify-ios-focus-zoom)'; then
  step bun scripts/verify-ios-focus-zoom.ts
fi
if has '^(apps/ios/|scripts/verify-ios-|scripts/lib/ios-disclosure-chevron)'; then
  step bun scripts/verify-ios-confirm-presentation.ts
  step bun scripts/verify-ios-disclosure-chevron.ts
fi

if has '^(apps/api/|apps/ios/engine/|apps/ios/HowMuch/Engine/|packages/|scripts/build-ios-engine\.ts|bun\.lock)'; then
  # The engine bundle is only reproducible with this exact Bun.
  step bunx bun@1.4.0 scripts/build-ios-engine.ts check
fi

if grep -Ev '(\.md$|^apps/ios/engine/)' <<<"$CHANGED" | grep -Eq '^(apps/ios/|scripts/ios-xcodebuild\.sh)'; then
  if [[ "$(uname)" != Darwin ]]; then
    echo; echo "check: iOS files changed; rerun scripts/check.sh on an Amp Mac satellite" >&2; exit 1
  fi
  step scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests
fi

echo; echo "check: pass"
