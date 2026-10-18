#!/usr/bin/env bash
set -e
cd /home/user/howmuch
export HOWMUCH_VERIFY_STATE_ROOT=/tmp/howmuch-verify-web HOWMUCH_VERIFY_RUN_ID=cardpay-web PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH"
control-howmuch cleanup >/dev/null 2>&1 || true
rm -rf /tmp/howmuch-verify-web/cardpay-web
control-howmuch launch | tail -6
control-howmuch doctor
