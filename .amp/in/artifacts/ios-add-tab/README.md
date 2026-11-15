# iOS: Add is a tab everywhere; no floating buttons above the tab bar

- **Request (YJ, 15 Nov 2026, TestFlight build 30 from `54a58452`):** "what brought back the green plus button that brings up assistant add? ... the plus button should be standard bottom right tab with standard add". Keep the Assistant tab. Follow-up: "also remove the glass Assistant button above + on iPhone".
- **Base:** `origin/main` at `54a58452`.

## Why the green button came back

The green circle is `RootAddControl`, added for the iPad sidebar in `b18eb1f7` (#147, 8 Sep). It floated at the bottom right of the sidebar layout and opened the conversational add (`presentAddTransactions`, a blank capture), with the standard form only behind a long press. The compact layout has had a standard Add tab since `b0b90e90` / `2376b958`.

`d6c5cf8a` (3 Nov, "choose the sidebar by size class so iPhone Duo gets the split layout") changed `RootChrome.usesSidebar` from "iPad idiom and regular width" to "regular width and regular height". The open iPhone Duo is regular in both, so it took the iPad's sidebar tree, which draws its tab bar along the bottom on a phone but has no Add tab, and the root overlay added `RootAddControl` beside it. Later Duo commits (`1eb5ca19`, `52b1d6eb`, `2dfc70b6`, `160672d7`, `c2638c5d`) only adjusted the split, the selection bar and the header; none added the button.

## Change

- The sidebar `TabView` (iPad, iPhone Duo open) now ends with the same `RootCaptureTab` Add as the compact bar. Both trees select through one `RootBarSelection` binding: picking Add opens the standard transaction form and keeps the current destination.
- `RootAddControl`, its overlay and insets, and `AppModel.presentAddTransactions` (its only caller) are removed.
- Add's tab role: `.prominent` on iPhone (iOS 27), keeping it a separate circle at the end of the bar; `.search` on iPad, where `.prominent` drew a labelled "Add Transaction" tab that the top bar pushed behind its overflow chevron in both orientations.
- The compact layout's glass Assistant button above Add (`RootTabBarFloatingAssistant`, since September) is removed, with the bottom inset that reserved room for it and Rewards' extra 64pt bottom margin (now 16pt). On iPhone and the folded Duo, Assistant opens from **More** → **Assistant** on Accounts and Insights, as before.
- Docs and recipes that described the floating Assistant or the sidebar's floating plus are updated (`docs/frontend/intake-ui.md`, `verify-howmuch` SKILL.md and two feature recipes).

## How it was driven

Amp Mac satellite (mac.large, macos-27), Xcode 27.3 beta, iOS 27.3 simulators "Add iPhone" (iPhone 18 Pro), "Add Duo" (iPhone Duo) and "Add iPad" (iPad Pro 11-inch M5). Local mode ("Start on this iPhone"), one synthetic account "Everyday Account" at $0.00, no server. The Duo and iPad got the iPhone's local-mode container copied in; poses and iPad rotation from Device Hub. iPhone and iPad driven with `axe`, the Duo with clicks on Device Hub.

| Device and pose | Expected | Observed |
| --- | --- | --- |
| iPhone | Accounts, Rewards, Insights pill, + circle at bottom right; + opens Add Transaction | As expected; + opened Add Transaction (form, Everyday Account) |
| iPhone, after removing the glass Assistant | Nothing above the tab bar on Accounts or Rewards; More lists Assistant and opens it | As expected: tab bar shows only the pill and Add (`axe` lists `Tab Bar` and `Add Transaction`, no Assistant button); More → Assistant opened Assistant home with Back |
| Duo folded (outer display) | Compact bar with + at the end, no green button | As expected |
| Duo open (inner display) | Accounts, Rewards, Insights, Assistant tabs, + circle at the end, no green button; + opens Add Transaction with Accounts still selected; Assistant tab opens Assistant | As expected |
| iPad landscape, sidebar shown | Sidebar lists Add Transaction after Assistant; no floating button | As expected |
| iPad landscape and portrait, sidebar hidden | Top bar: Accounts, Rewards, Insights, Assistant, + icon at the end | As expected; + opened Add Transaction in portrait and landscape |

## Checks

- `bun test`: 810 pass, 0 fail. Web and worker `tsc --noEmit` clean. `verify-ios-confirm-presentation` and `verify-ios-disclosure-chevron` exit 0.
- `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on "Add iPhone", fresh build-for-testing ("products match this worktree"): `Executed 825 tests, with 1 test skipped and 0 failures` before the follow-up; `Executed 822 tests, with 1 test skipped and 0 failures` after it (three tests that only covered the floating Assistant hiding and returning were deleted; the tab-row tests now assert no Assistant button on the compact bar). `IPadLayoutTests.testSidebarRootTabViewHostsAddTabAndNoFloatingAssistant` now requires the sidebar's Add tab, that it opens the manual form and that the destination stays Accounts (it previously asserted the sidebar had no Add).

## Not exercised

- The Rewards board end with real cards after the 16pt margin (local mode had none). A physical iPhone Duo or iPad. The Duo's partly folded pose. iPad Split View widths that fall back to the compact tree.
