#!/bin/zsh
# signin.sh <udid> <api-port> : from a fresh install's welcome screen, sign in to the forwarded verify API.
# Uses the disposable verify credentials from .cursor/skills/verify-howmuch/SKILL.md.
U="$1"; PORT="$2"
xcrun simctl terminate $U com.tinkertanker.halation >/dev/null 2>&1
xcrun simctl launch $U com.tinkertanker.halation >/dev/null; sleep 3
axe tap --id welcome-connect-server --udid $U --post-delay 2 >/dev/null
axe tap --value 'halation.example.com' --udid $U --post-delay 1 >/dev/null
axe type "http://127.0.0.1:$PORT" --udid $U >/dev/null
axe tap --value 'Username' --udid $U --post-delay 1 >/dev/null
axe type 'verifier' --udid $U >/dev/null
axe tap --value 'Password' --udid $U --post-delay 1 >/dev/null
axe type 'howmuch-verify-15' --udid $U >/dev/null; sleep 1
# On short screens (Duo outer display) the keyboard covers Sign in: scroll it into view first.
axe swipe --start-x 200 --start-y 300 --end-x 200 --end-y 120 --udid $U >/dev/null; sleep 1
axe tap --label 'Sign in' --element-type Button --udid $U --post-delay 6 >/dev/null
axe swipe --start-x 200 --start-y 150 --end-x 200 --end-y 400 --udid $U >/dev/null; sleep 1
"$(dirname "$0")/ui.sh" $U | grep -q 'Signed in as verifier' || { echo "sign-in failed on $U"; exit 1; }
axe tap --label Save --element-type Button --udid $U --post-delay 3 >/dev/null
echo "signed in on $U"
