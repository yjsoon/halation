# Native welcome redesign verification

## Revision and scope

Production source: `ca0669559d685a264693550c87321d1ea57cfbf5`, based on `34d5dc8f4f64bfe6dac8859441e17d34dcb0e3c7`.
Changes after that source revision in this evidence round are artefacts only.

- Reused the actual web `signin-light.webp` and `signin-dark.webp` artwork, converted with ImageMagick to JPEG at quality 92. No regenerated replacement illustration.
- Reused bundled Instrument Serif Italic for the brand and the web slogan. Matched the web ivory/plum, ink and interactive accent tokens locally to WelcomeView, without restyling the ledger.
- Native controls retain both original actions and identifiers. New scroll layout keeps them reachable at small sizes, landscape and accessibility Dynamic Type.
- A build prerequisite splits the existing currency formatter cache-key expression into an explicitly typed string array and join. Identical values, ordering and separator. No money calculation or formatting behaviour change.

Source hashes:

```text
c0761423cfd88eac9ea525aa47a5d36c86cc309a80ab3fc59587dedcdf41a250  WelcomeView.swift
215d34bfcc92933b638d098fe450c232a307425f0f095c6d79e52f0f64aa6d41  Formatting.swift
```

## Design reference and exploration

Inspected the actual public signed-out front page at `https://howmuch.tk.sg`, plus SignInPage.tsx, controls.css and tokens.css. Read the original design thread `T-01a17fbf-bd0e-70ed-93b4-3409ac937d57` to preserve its clouds, irregular foliage, warm sun and blending method rather than recreating the rejected geometric approximation.

Painter compared editorial top-brand/bottom-landscape and central-illustration layouts, grounded in the actual website screenshot and supplied old iOS screenshot. Selected the editorial direction without an approval pause. Painter output was a concept only, not verification evidence:
https://ampcode.com/user-content/attachments/ed59b0625e4f62c64bcb756ce493d33b2414ff29f4586cf06468a6c196e65dcf-file.png

Acceptance: same artwork and display type, readable controls on quiet paper, no decorative hit targets, no horizontal overflow, at least 44-point actions, both setup choices preserved. Intentional differences: native controls and system UI font, scroll instead of clipping on short screens, constrained content width on iPad. Scrolled captures intentionally crop text above the viewport. Calm negative space above the landscape is deliberate, matching the website.

## Native environment and commands

Amp Mac satellite, macos-26, Xcode 26.1.1, iPhone Air simulator on iOS 26.1, HowMuch scheme / Debug, ad-hoc simulator signing only. No Apple credentials, provisioning, physical devices, publication or production data.

```sh
UDID=$(scripts/ios-xcodebuild.sh destination)
xcrun simctl boot "$UDID"
xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility AccessibilityEnabled -bool true
xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility ApplicationAccessibilityEnabled -bool true
scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/LocalModeTests -only-testing:HowMuchTests/SlipReaderMappingTests
xcrun simctl install "$UDID" "$(scripts/ios-xcodebuild.sh app-path)"
xcrun simctl launch "$UDID" com.tinkertanker.halation
xcrun simctl ui "$UDID" appearance dark
xcrun simctl io "$UDID" screenshot /tmp/welcome-root-dark.png
xcrun simctl ui "$UDID" appearance light
xcrun simctl io "$UDID" screenshot /tmp/welcome-root-light.png
```

Final clean-source run at the committed source above:

```text
runner: build-for-testing finished in 3s exit=0
runner: build-for-testing succeeded; products match this worktree
Executed 10 tests, with 0 failures (LocalModeTests)
Executed 36 tests, with 0 failures (SlipReaderMappingTests)
Executed 46 tests, with 0 failures
** TEST EXECUTE SUCCEEDED **
```

The currency tests include positive and negative half-cent rounding, euro symbol-after formatting, hidden symbols and large sums. `git diff --check` passes. The installed app was launched from its real root view and captured in both themes, not just rendered in a preview.

## Real-stack welcome recipe

The adjacent `validation-harness.patch` is a disposable validation patch, not a permanent test suite addition. It uses the repository's existing SnapshotSurface native UIWindow/accessibility harness with the actual WelcomeView, SettingsView, AppModel, bundled JS backend and isolated on-device SQLite. It was removed from the source before the clean-source run. Its production sources are byte-identical to the committed source revision above.

To repeat on a disposable Mac simulator checkout at that revision: apply the patch with `git apply`, create `/tmp/halation-welcome`, enable accessibility as above, then run:

```sh
mkdir -p /tmp/halation-welcome
scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/LocalModeTests
# After inspection, remove only this disposable patch:
git apply --reverse .amp/in/artifacts/halation-welcome/validation-harness.patch
```

Observed: 12 tests, zero failures, including both temporary welcome scenarios.

1. Rendered 440×956 light/dark, 320×568 compact, 844×390 landscape, 390×844 accessibility3 and 834×1194 iPad-sized native UIWindows. These are layout probes on the iPhone simulator, not claims of separate iPad-device execution. All controls remain within horizontal bounds and reachable by scrolling. Local action is 58 points high at default text size and 126 points at accessibility3; server action is 44 points. Floating-point frame epsilon is allowed only in the scratch measurement, not app code.
2. Activated Connect to a server through the native accessibility action. Model leaves welcome and opens Connection, empty server with `halation.example.com` placeholder, Username, Password and Sign in. Activated Back, returned to welcome without saving a server.
3. Activated local start through the actual WelcomeView button. Model becomes local and authenticated, welcome and connection dismiss, saved settings reload with the same local plan ID, real SQLite contains that plan, starter category fetch returns four groups. No production or mock HTTP call.
4. Pointed the isolated local engine at `/dev/null/unwritable.sqlite`, activated local start and observed a real filesystem failure. Error text appears; model remains on welcome and both buttons re-enable. This synthetic error deliberately includes the invalid test path, not user data.
5. Found and fixed an accessibility-only orphaned final letter in the display wordmark during visual inspection. The final wordmark stays on one line; functional copy still scales and wraps.

Native harness recording `validation.mp4` shows native windows and the Connection screen, trimmed from simctl video, inspected at 3 fps. It uses accessibility activation and harness scrolling, not physical touch or mouse input. Smaller UIWindow probes intentionally occupy part of the simulator, so the video is harness evidence, not a polished device demo.

## Inspected visual evidence

- `welcome-root-dark.jpg`, `welcome-root-light.jpg`: final installed/launchable app at its actual root, normal simulator status bar.
- `dark.jpg`, `light.jpg`: controlled 440×956 native window captures without status-bar chrome.
- `compact.jpg`, `landscape.jpg`, `landscape-actions.jpg`, `accessibility.jpg`, `accessibility-actions.jpg`, `ipad.jpg`: layout probes, default and scrolled states.
- `layouts.jpg`: final six-state contact sheet, reading order light portrait, compact, landscape actions, accessibility initial, accessibility actions, iPad.
- `connection.jpg`, `error.jpg`: native Connection and real local-engine failure state.

All final PNG captures were inspected before conversion to JPEG at quality 88 to keep review artefacts small. The final contact sheet and video frames were also inspected. No clipping in functional controls, no landscape seam, no tabs bleeding through welcome. Text cropped above the viewport in scrolled states is expected.

## Known limits and delivery gate

- No physical-device installation, VoiceOver gesture pass, signed archive, Speedflight or TestFlight. No server sign-in was attempted; the preserved entry/back flow was exercised without touching production.
- The original untouched formatter expression failed to type-check with both Xcode 26.1.1 and 26.3. The explicit string-array type resolved it, and the relevant existing tests pass. Initial attempted engine rebuild was refused by the pinned Bun 1.4.0 guard (orb has 1.4.4); the committed engine was used unchanged, successfully exercised by local SQLite tests.
- First scratch run failed only on `43.999999999999886 >= 44` for an accessibility frame; rerun with a 0.01-point measurement tolerance passed. No app special case was introduced.
- Landing router selected HIGH_AUDIT / REPOSITORY_PROCEDURE but blocked main delivery on unknown protection. GitHub rules and rulesets return HTTP 403 saying the repository plan does not offer the feature; classic branch-protection read returns HTTP 403 for the integration. The explicit no-PR repository procedure is preserved. No main merge or protection bypass is authorised by this failure.
