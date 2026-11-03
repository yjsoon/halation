# Consistent welcome alignment

Source revision: `c3e1086cc8b2a935072572a1ee3c4fa7cc5ccf5b`.

Chose centred alignment to match the existing native setup button labels and privacy copy. The wordmark, slogan, wrapping text and setup actions now share the same centreline on iPhone and iPad. The 420-point content cap, reduced copy, privacy explanation, artwork and both setup behaviours are unchanged. Source change: three presentation lines added, two replaced in WelcomeView.swift; no logic changes.

## Executed native verification

Amp Mac satellite, macos-26, Xcode 26.1.1, HowMuch / Debug, simulator ad-hoc signing. No signing secrets or production data used.

- Applied the existing disposable `.amp/in/artifacts/halation-welcome/validation-harness.patch` with `git apply --unidiff-zero` and ran `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/LocalModeTests`. Fresh cold build succeeded in 156 seconds. The first run passed the layout/server/local-persistence scenario, but the failure-state scenario threw `InvalidTransition { phase: idle; targetPhase: failed(deinit) }`. No root cause was established. Reran the same fresh-build command without code or harness changes: **12 tests, zero failures**. Both local actions, persisted local SQLite plan and four starter groups, Connection/Back and real filesystem-failure recovery passed. Local button height 58pt at default text size, 126pt at accessibility3; server target 44pt. All probed actions were reachable and within horizontal bounds.
- Removed the disposable patch with `git apply --reverse --unidiff-zero`, re-read the original test source and ran the same command again: **TEST BUILD SUCCEEDED**, products match this worktree, **10 existing tests, zero failures**, **TEST EXECUTE SUCCEEDED**. No permanent test changes.
- Installed the clean-built app using `xcrun simctl install`, launched its real root using `xcrun simctl launch`, changed appearance with `xcrun simctl ui … appearance dark/light`, and captured framebuffer screenshots using `xcrun simctl io … screenshot`. Synthetic status bar: 09:41, full Wi-Fi and battery.
- Inspected all four final native screenshots plus six native-window layout probes. Wordmark, slogan, wrapped privacy text and button labels are centred consistently. No redundant subtitle, clipping, overlap or horizontal overflow. Compact and accessibility3 text wraps cleanly; landscape controls remain reachable by scrolling.
- `git diff --check` passed. Only this round's alignment source and evidence are included.

## Reviewable captures

Exact executor-local directory: `/home/user/workspace/repo/.amp/in/artifacts/halation-welcome-alignment/`. JPEG quality 88, no resizing of device captures.

| File | Device / orientation / theme | Native size |
| --- | --- | --- |
| iphone-portrait-dark.jpg | iPhone Air, portrait, dark, iOS 26.2 | 420×912 pt; 1260×2736 px |
| iphone-portrait-light.jpg | iPhone Air, portrait, light, iOS 26.2 | 420×912 pt; 1260×2736 px |
| ipad-portrait-dark.jpg | iPad Pro 13-inch (M5), portrait, dark, iOS 26.1 | 1032×1376 pt; 2064×2752 px |
| ipad-portrait-light.jpg | iPad Pro 13-inch (M5), portrait, light, iOS 26.1 | 1032×1376 pt; 2064×2752 px |
| layouts.jpg | Native-window probes, not separate device captures | Dark, light, compact, scrolled landscape, accessibility3, iPad-sized portrait |

Limits: no physical-device installation, VoiceOver gesture pass or actual iPad landscape capture. Setup actions were activated through native accessibility, not physical touch. This is an alignment-only refinement, not a change to interaction mechanics. No merge, release or Slack post is authorised or performed.

Independent review routing selected HIGH_AUDIT / NONE for this round with purpose review-only. Existing Opus 5.5/high external Claude Code reviewer is requested to cover correctness, compatibility and operability of the exact alignment diff and its evidence. Main delivery is outside this request.
