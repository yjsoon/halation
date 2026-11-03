# iPhone Duo outer display: SDK compatibility letterbox

Report: on the Duo's outer display, build 19 showed a bottom tab bar and the floating Assistant and Add over account rows, with a black status strip on the right.

## Root cause

Build 19 (0.1.0, `34d5dc8f`) was archived with Xcode 27.0 (27A266a) against the iPhoneOS 27.0 SDK. The iPhone Duo device type exists only from iOS 27.1 (`minRuntimeVersion` 27.1 in the simulator's `iPhone Duo.simdevicetype` profile). iOS runs an app linked against an older SDK in a compatibility letterbox on the outer display: the app gets a narrower window with an ordinary bottom tab bar, and the system draws its status in the black strip outside it. Our layout code never sees the side bar region, so the asymmetric safe area and the side tab bar don't apply.

## Reproduction (same source, two SDKs)

- Revision: `origin/main` `34d5dc8f`, unchanged app code. The sign-in shortcut used a temporary local edit to the DEBUG bootstrap that was reverted before commit.
- Environment: Amp Mac satellite (macos-27), "iPhone Duo" simulator, iOS 27.1, closed (outer display, `simctl io --display=1`), dark appearance. Synthetic data from `control-howmuch launch` (HowMuch Demo plan), signed in as `verifier` through a forwarded port.
- SDK 27.0 build: `DEVELOPER_DIR=/Applications/Xcode_27.app/Contents/Developer HOWMUCH_SIM_DERIVED=build/xcode/DerivedData-sim270 scripts/ios-xcodebuild.sh build` (Info.plist `DTSDKName iphonesimulator27.0`, `DTXcode 2700`).
- SDK 27.2 build: default Xcode 27.2 `scripts/ios-xcodebuild.sh build` (`DTSDKName iphonesimulator27.2`, `DTXcode 2720`).

| Capture | Expected | Observed |
|---|---|---|
| `outer-sdk27.0-welcome.png`, `outer-sdk27.0-accounts.png` | Reproduces the report | Letterboxed window, black right strip with the status, bottom tab bar, floating Assistant over Travel Card's balance. Matches YJ's screenshot. |
| `outer-sdk27.2-welcome.png`, `outer-sdk27.2-accounts.png` | Full outer display | Content uses the full width. The system puts the status, toolbar and tab bar in a vertical trailing column with the Add action at the bottom; no rows covered. |
| `outer-sdk27.1-welcome.png` | The 27.1 floor is enough | Built with Xcode 27.1 (`DTSDKName iphonesimulator27.1`, `DTXcode 2710`): fills the outer display like the 27.2 build, with no black strip. Added after review. |
| `ipad-sdk27.2-portrait.png` | iPad unaffected | iPad Pro 13-inch (M5) on the iOS 26.5 runtime, which the macos-27 image does carry (`simctl list runtimes`), portrait: the sidebar is shown as an overlay over the Accounts split with the Everyday Account register, and the floating Add sits bottom right. A system "Ready for Apple Intelligence" banner covers the toolbar. |

### Recordings

Same setup on a fresh Mac satellite, with twelve extra synthetic "Demo …" accounts posted through `POST /v1/plans/local-plan/accounts` so the list scrolls. Recorded with `xcrun simctl io <duo> recordVideo --codec=h264 --display=1` while Device Hub (Xcode 27.2-RC) showed the closed Duo. Input came from posted scroll-wheel events and `cliclick` taps. Both builds followed the same steps: scroll Accounts down and back up, then tap Rewards, Insights, Accounts and Add.

| File | Observed |
|---|---|
| `duo-outer-before-sdk270.mp4` | SDK 27.0: letterboxed, black status strip, bottom tab bar (collapses to one icon while scrolling), floating Assistant and Add over row balances. |
| `duo-outer-after-sdk272.mp4` | SDK 27.2: full width; tabs and Add stay in the trailing column; no rows covered; Add opens Add Transaction. |
| `duo-outer-before-after.mp4` | Both, side by side, each half labelled. |

The Duo open (inner display) layout with an Xcode 27.2 build was already verified in `duo-size-class-gate-consolidation/`; no app code changed here.

## Fix

`scripts/testflight-export.sh` and `scripts/speedflight.sh` refuse an iPhoneOS SDK older than 27.1, and `docs/speedflight.md` preflight says so. Speedflight checks after `PREFLIGHT_COMPLETE` so its Linux preflight test is unaffected.

- Guard against installed Xcodes on the Mac: Xcode 27.0 (SDK 27.0) refused, 27.1 and 27.2 pass. Both scripts carry the same check.
- `bun test scripts/speedflight.test.ts`: 11 pass, 0 fail. `bash -n` on both scripts: ok.

Rerun for landing on scripts identical to `f79fde4` (later commits change only `.amp/in/artifacts/`). Each script's guard was extracted and run separately: both refuse Xcode 27.0 and pass Xcode 27.1 and 27.2. `bun test scripts/speedflight.test.ts` gave 11 pass, 0 fail, and `bash -n` was ok.

## Not covered

- A physical Duo. Simulator only.
- The floating Assistant is still missing in the side-bar layout (`RootTabBarFloatingAssistant` looks for a bottom tab bar); Assistant remains reachable from the More menu. This was a deferred item and is out of this fix.
- Outer landscape and half-folded poses.

## Review

One reviewer, Claude Code external agent launched with `model:claude-opus-5-5`, `effort:high` (thread T-01a1a16c-e4a7-76a5-8ec9-ac9f799b8c64), on `34d5dc8f...475c31a4`: CLEAN, no Critical or Required findings.

- Optional 1 (27.1 floor untested): fixed by evidence, `outer-sdk27.1-welcome.png` above.
- Optional 2 (validation.txt reads the toolchain SDK, not the IPA's DTSDKName): not done. The project pins no SDKROOT version, so the guard's SDK is the linked SDK; reading DTSDKName is a possible follow-up.
- Nit 3 (empty SDK prints a blank version): not done; it still fails closed.
- Nit 4 (preflight sentence): reworded in `docs/speedflight.md`.
- Nit 5 (iPad runtime and state): the iOS 26.5 runtime is installed on the macos-27 image; the iPad row is described more exactly.
- FYI 6: noted.

Fixes after review only reword docs and add artefacts, so they need no re-review under AGENTS.md step 3.
