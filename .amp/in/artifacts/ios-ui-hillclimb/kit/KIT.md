# iOS audit kit

Worked on an Amp Mac satellite (image `macos-27`, size `mac.large`) on 18 Nov 2026 against `origin/main` `2258ef81`.

## Stack (on the orb; the Mac has no bun)

```sh
export PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH"
control-howmuch launch && control-howmuch doctor
S=/tmp/howmuch-verify/current/state.json
API=$(jq -r .api_url $S) TOKEN=$(jq -r .api_token $S) PASSWORD=$(jq -r .password $S) bun .amp/in/artifacts/ios-ui-hillclimb/kit/seed-audit.ts
```

`seed-audit.ts` creates the owner `verifier` and adds, on top of the demo ledger: accounts with long and short names in every group (cash, credit, tracking, one closed), 37 transactions dated around today (flags, memos, a split, a transfer, unapproved, uncleared, uncategorised, one future-dated card payment), four schedules, and the Travel Card rewards card. All values are synthetic. For the 16 Rewards board states, POST `fixtures/rewards-exposure-states.json` to `/api/import/rewards-tracker?plan_id=local-plan` (it replaces the card set; Travel Card then has many cards and loses its sunrise register header, so capture that header first).

Forward the API port to the Mac: `mac_sidecar` `start` with `forward_ports: ["<api_port>:<api_port>"]`. The simulator then reaches `http://127.0.0.1:<api_port>`.

## Mac

- Default Xcode is 27.3. iOS 27.3 simulators exist for iPhone 18 Pro, iPhone SE (3rd generation), iPhone Duo, iPad Pro 13-inch (M5) and iPad mini (A20 Pro). Look UDIDs up with `xcrun simctl list devices available`.
- Build once (about 2 minutes): `SIMULATOR_UDID=<udid> scripts/ios-xcodebuild.sh build`, then `xcrun simctl install <udid> "$(SIMULATOR_UDID=<udid> scripts/ios-xcodebuild.sh app-path)"`. The same `.app` installs on every simulator. Four booted simulators ran fine together.
- Enable accessibility once per simulator (see `apps/ios/AGENTS.md`), or `describe-ui` comes back empty.
- `brew install cameroncooke/axe/axe` (2.0.4) drives the simulators: `describe-ui`, `tap --id/--label/--value`, `type`, `swipe`, `screenshot`, `displays`, `hinge read|set` and `rotate` (the last two for the iPhone Duo). `axe rotate` does not rotate an iPad simulator; earlier rounds rotated iPads from Xcode's Device Hub.
- iPad rotation (from the iPad auditor, 18 Nov): open Device Hub at `/Applications/Xcode_27.3-Beta.app/Contents/Applications/DeviceHub.app`, select the iPad's row in its outline, then Controls > Rotate Left or Rotate Right.
- iPad narrow window (same source): on iPad mini portrait, `axe drag` from (752,1149) to (480,900) shrank Halation's window to 375×783pt and switched it to the phone layout.
- Copy `ui.sh` and `signin.sh` to the Mac (they are not mirrored: `.amp/in` is gitignored). `signin.sh <udid> <api_port>` signs a fresh install in; `ui.sh <udid>` lists labelled elements with frames in points, which gives tap-target sizes and widths.
- Appearance: `xcrun simctl ui <udid> appearance dark|light`. Text size: `xcrun simctl ui <udid> content_size <size>` (`extra-small` … `extra-extra-extra-large`, `accessibility-medium` … `accessibility-extra-extra-extra-large`).
- `xcrun simctl io <udid> screenshot` captures the Duo's display 1 only; `axe screenshot` follows the active display.
