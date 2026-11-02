#!/bin/bash
# Archives HowMuch (Halation) for App Store distribution and exports an App
# Store Connect IPA. It never uploads: there is no ASC key, no
# -allowProvisioningUpdates and the export destination is "export", so the
# Apple account cannot change from this script. Upload, export compliance and
# TestFlight testers are separate, owner-approved steps. Not Speedflight:
# scripts/speedflight.sh stays the ad hoc path.
#
#   TESTFLIGHT_P12_PATH=... TESTFLIGHT_P12_PASSWORD=... \
#   TESTFLIGHT_PROFILE_APP=... TESTFLIGHT_PROFILE_SHARE=... \
#   [TESTFLIGHT_EXPECTED_SHA=<40-char sha>] scripts/testflight-export.sh
#
# The p12 holds an Apple Distribution identity for team PQ6U5ESLN2. The two
# IOS_APP_STORE profiles must be named "Halation TestFlight <bundle id>".
# Command-line settings reach every target, including SwiftPM resource
# bundles that reject profiles, so the profile is looked up per bundle id
# and stays empty for anything that is not the app or the share extension.
# Outputs land in build/testflight (replaced each run): App.xcarchive,
# export/*.ipa, logs, validation.txt and SHA256SUMS.
set -euo pipefail
# HOWMUCH_REPO lets a copy of this script outside the checkout build an
# exact revision that predates it.
cd "${HOWMUCH_REPO:-$(dirname "$0")/..}"

: "${TESTFLIGHT_P12_PATH:?set TESTFLIGHT_P12_PATH}"
: "${TESTFLIGHT_P12_PASSWORD:?set TESTFLIGHT_P12_PASSWORD}"
: "${TESTFLIGHT_PROFILE_APP:?set TESTFLIGHT_PROFILE_APP}"
: "${TESTFLIGHT_PROFILE_SHARE:?set TESTFLIGHT_PROFILE_SHARE}"
[[ "$(uname)" == Darwin ]] || { echo "error: needs macOS with Xcode" >&2; exit 1; }

PROJECT="apps/ios/HowMuch.xcodeproj"
SCHEME="HowMuch"
TEAM_ID="PQ6U5ESLN2"
APP_ID="com.tinkertanker.halation"
SHARE_ID="com.tinkertanker.halation.share"
PROFILE_PREFIX="Halation TestFlight"
OUT="$PWD/build/testflight"
DERIVED_DATA="$PWD/build/xcode/DerivedData-testflight"
XCODE_JOBS="${HOWMUCH_XCODE_JOBS:-2}"

COMMIT="$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree must be clean so the IPA matches $COMMIT" >&2; exit 1
fi
if [[ -n "${TESTFLIGHT_EXPECTED_SHA:-}" && "$COMMIT" != "$TESTFLIGHT_EXPECTED_SHA" ]]; then
  echo "error: HEAD $COMMIT is not the requested $TESTFLIGHT_EXPECTED_SHA" >&2; exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT/logs" "$DERIVED_DATA"

# Throwaway keychain so the identity never lands in the login keychain.
KC="$OUT/signing.keychain-db"
KC_PASS="$(openssl rand -hex 16)"
OLD_KEYCHAINS=()
while IFS= read -r k; do OLD_KEYCHAINS+=("$(sed -E 's/^[[:space:]]*"(.*)"$/\1/' <<<"$k")"); done < <(security list-keychains -d user)
cleanup() {
  security list-keychains -d user -s ${OLD_KEYCHAINS[@]+"${OLD_KEYCHAINS[@]}"} || true
  security delete-keychain "$KC" 2>/dev/null || true
}
trap cleanup EXIT
security create-keychain -p "$KC_PASS" "$KC"
security set-keychain-settings -lut 7200 "$KC"
security unlock-keychain -p "$KC_PASS" "$KC"
security import "$TESTFLIGHT_P12_PATH" -k "$KC" -P "$TESTFLIGHT_P12_PASSWORD" -f pkcs12 \
  -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KC_PASS" "$KC" >/dev/null
security list-keychains -d user -s "$KC" ${OLD_KEYCHAINS[@]+"${OLD_KEYCHAINS[@]}"}
IDENTITY="$(security find-identity -v -p codesigning "$KC" | awk '/Apple Distribution: .*\('"$TEAM_ID"'\)/ {print $2; exit}')"
[[ -n "$IDENTITY" ]] || { security find-identity -v -p codesigning "$KC" >&2; echo "error: no valid Apple Distribution identity for $TEAM_ID" >&2; exit 1; }
echo "signing identity sha1=$IDENTITY"

# Install the profiles where both older and current Xcode look for them.
profile_uuid() { security cms -D -i "$1" > "$OUT/profile.plist" && plutil -extract UUID raw -o - "$OUT/profile.plist"; }
for dir in "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"; do
  mkdir -p "$dir"
  for p in "$TESTFLIGHT_PROFILE_APP" "$TESTFLIGHT_PROFILE_SHARE"; do
    cp "$p" "$dir/$(profile_uuid "$p").mobileprovision"
  done
done

# Signed with the distribution identity at archive time: an unsigned archive
# loses its entitlements and the export re-sign does not restore them.
xcodebuild -project "$PROJECT" -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED_DATA" \
  -archivePath "$OUT/App.xcarchive" \
  -jobs "$XCODE_JOBS" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  HALATION_TF_PROFILE_com_tinkertanker_halation="$PROFILE_PREFIX $APP_ID" \
  HALATION_TF_PROFILE_com_tinkertanker_halation_share="$PROFILE_PREFIX $SHARE_ID" \
  'PROVISIONING_PROFILE_SPECIFIER=$(HALATION_TF_PROFILE_$(PRODUCT_BUNDLE_IDENTIFIER:c99extidentifier))' \
  OTHER_CODE_SIGN_FLAGS="--keychain $KC" \
  COMPILER_INDEX_STORE_ENABLE=NO \
  archive 2>&1 | tee "$OUT/logs/archive.log"

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>signingStyle</key><string>manual</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>$APP_ID</key><string>$PROFILE_PREFIX $APP_ID</string>
    <key>$SHARE_ID</key><string>$PROFILE_PREFIX $SHARE_ID</string>
  </dict>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "$OUT/App.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" \
  2>&1 | tee "$OUT/logs/export.log"

IPA="$(ls "$OUT"/export/*.ipa)"
(cd "$OUT" && shasum -a 256 export/*.ipa ExportOptions.plist > SHA256SUMS && cat SHA256SUMS)

# Check what was actually signed, from the IPA rather than the archive.
V="$OUT/validation.txt"
CHECK="$OUT/ipa-check"
rm -rf "$CHECK"; mkdir -p "$CHECK"
ditto -x -k "$IPA" "$CHECK"
APP="$(ls -d "$CHECK"/Payload/*.app)"
fail=0
expect() { if [[ "$2" == "$3" ]]; then echo "ok   $1 = $3"; else echo "FAIL $1: expected '$2', got '$3'"; fail=1; fi; }
ent() { /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || echo "<absent>"; }
{
  echo "commit $COMMIT"
  xcodebuild -version | tr '\n' ' '; echo
  echo "sdk $(xcrun --sdk iphoneos --show-sdk-version)"
  echo "macOS $(sw_vers -productVersion) ($(sw_vers -buildVersion))"
  for bundle in "$APP" "$APP"/PlugIns/*.appex; do
    name="$(basename "$bundle")"
    echo "== $name"
    if verify="$(codesign --verify --deep --strict --verbose=2 "$bundle" 2>&1)"; then
      echo "ok   $name codesign --verify --deep --strict"
    else
      echo "FAIL $name codesign --verify: $verify"; fail=1
    fi
    info="$(codesign -dvv "$bundle" 2>&1)"
    expect "$name authority" "Apple Distribution: Tinkertanker ($TEAM_ID)" "$(sed -n 's/^Authority=//p' <<<"$info" | head -1)"
    expect "$name team" "$TEAM_ID" "$(sed -n 's/^TeamIdentifier=//p' <<<"$info")"
    (cd "$CHECK" && rm -f leaf* && codesign -d --extract-certificates=leaf "$bundle" 2>/dev/null)
    echo "   leaf cert sha1 $(openssl x509 -inform DER -in "$CHECK/leaf0" -noout -fingerprint -sha1 | cut -d= -f2)"
    codesign -d --entitlements - --xml "$bundle" 2>/dev/null > "$CHECK/$name.ent.plist"
    plutil -p "$CHECK/$name.ent.plist" | sed 's/^/   /'
    security cms -D -i "$bundle/embedded.mobileprovision" > "$CHECK/$name.profile.plist"
    echo "   profile $(plutil -extract Name raw -o - "$CHECK/$name.profile.plist") $(plutil -extract UUID raw -o - "$CHECK/$name.profile.plist")"
    expect "$name profile has no device list" "<absent>" "$(ent "$CHECK/$name.profile.plist" ProvisionedDevices | head -1)"
    expect "$name get-task-allow" "false" "$(ent "$CHECK/$name.ent.plist" get-task-allow)"
    expect "$name beta-reports-active" "true" "$(ent "$CHECK/$name.ent.plist" beta-reports-active)"
    expect "$name app group" "group.sg.soon.howmuch" "$(ent "$CHECK/$name.ent.plist" com.apple.security.application-groups:0)"
    echo "   bundle $(ent "$bundle/Info.plist" CFBundleIdentifier) version $(ent "$bundle/Info.plist" CFBundleShortVersionString) ($(ent "$bundle/Info.plist" CFBundleVersion))"
    echo "   ITSAppUsesNonExemptEncryption $(ent "$bundle/Info.plist" ITSAppUsesNonExemptEncryption)"
  done
  expect "app associated domain" "webcredentials:howmuch.soon.sg" "$(ent "$CHECK/$(basename "$APP").ent.plist" com.apple.developer.associated-domains:0)"
  expect "app time-sensitive" "true" "$(ent "$CHECK/$(basename "$APP").ent.plist" com.apple.developer.usernotifications.time-sensitive)"
  expect "app application-identifier" "$TEAM_ID.$APP_ID" "$(ent "$CHECK/$(basename "$APP").ent.plist" application-identifier)"
  [[ $fail == 0 ]] && echo "RESULT pass" || echo "RESULT FAIL"
} | tee "$V"
rm -rf "$CHECK"
grep -q '^RESULT pass$' "$V"
