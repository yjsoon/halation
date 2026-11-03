# Welcome copy refinement

Source revision: `f807e90892a64a2a3a471b6f7899c07710c67257`. Subsequent commits in this round contain evidence only.

Removed the redundant line **“Track what you spend, account by account.”** and its own top spacing. Kept the web slogan **“Clarity for a longer view”**, the device-local/no-sign-in explanation, both setup actions and all setup/error behaviour. The source diff is four deleted presentation lines in WelcomeView.swift. No review: copy only, under the repository's landing policy. No main merge or release was performed.

## Verification

Amp Mac satellite, macos-26, Xcode 26.1.1, HowMuch / Debug, iOS 26.1 simulators. Ad-hoc simulator signing only; no physical device or publication.

1. Applied the existing disposable `.amp/in/artifacts/halation-welcome/validation-harness.patch` using `git apply --unidiff-zero`, then ran `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/LocalModeTests`. Fresh build-for-testing succeeded, followed by **12 tests, zero failures**. This exercised actual WelcomeView accessibility actions, server Connection/Back, real local SQLite plan/settings persistence with four starter category groups, and real local-engine failure recovery. It also rendered default light/dark, compact, landscape and accessibility3 states. Both buttons remain at least 44 points high and reachable.
2. Removed that disposable patch using `git apply --reverse --unidiff-zero`, leaving no test-source changes. Reran the same wrapper command on the clean committed source: **TEST BUILD SUCCEEDED**, **10 tests, zero failures**, **TEST EXECUTE SUCCEEDED**. Build-for-testing finished in 5 seconds and confirmed the products match this worktree.
3. Installed the clean-source app on iPhone Air and iPad Pro 13-inch (M5), launched the actual app root, switched simulator appearance and captured both themes with `xcrun simctl io "$UDID" screenshot`. Standardised the synthetic status bar to 09:41. Screenshots are not generated mockups.
4. Inspected all four final screenshots and the six-state contact sheet. Confirmed the removed copy is absent, brand/slogan and essential privacy copy remain complete, controls are readable and unobstructed, and the landscape remains intact. Compact and accessibility states have no horizontal clipping. JPEG conversion used quality 88 without resizing.
5. `git diff --check` passed. No new permanent tests or unrelated code changes.

## Updated previews

All paths are under `/home/user/workspace/repo/.amp/in/artifacts/halation-welcome-copy/` in the lead orb; captures were produced on the Mac satellite and downloaded there.

| File | Device / orientation | Native size |
| --- | --- | --- |
| iphone-portrait-dark.jpg | iPhone Air, portrait, dark | 420×912 pt; 1260×2736 px |
| iphone-portrait-light.jpg | iPhone Air, portrait, light | 420×912 pt; 1260×2736 px |
| ipad-portrait-dark.jpg | iPad Pro 13-inch (M5), portrait, dark | 1032×1376 pt; 2064×2752 px |
| ipad-portrait-light.jpg | iPad Pro 13-inch (M5), portrait, light | 1032×1376 pt; 2064×2752 px |
| layouts.jpg | Native-window probes, not separate devices | Reading order: default dark, default light, compact, landscape scrolled, accessibility3, iPad-sized portrait |

This refinement does not change the earlier verification limits: no physical-device or VoiceOver gesture pass; actual iPad landscape rotation remains unavailable in the current simulator windowing mode. Main landing remains blocked by protection-visibility checks; this request grants no new merge or release authority. No Slack post was made.
