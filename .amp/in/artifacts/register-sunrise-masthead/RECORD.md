# Register sunrise masthead

- **Revision:** the commit this folder lands in, rebased on `origin/main` at 8fea66e (the iPad swipe fix).
- **Request (YJ, 9 Nov 2026):**
  - Bleed the rewards sunrise into the navigation title, so the whole header down to the transactions is the scene.
  - Keep every piece of information and repeat nothing.
  - Native SF type.
- **Review:** a council of Sol (GPT-6.1 Sol), Astra (GPT-6 Astra) and Fable (Claude Fable 5.1) graded four looks on a weighted matrix out of 65.
  - All three chose Look 2 SF, with means of 53.3 against 46.3 for the old header.
  - Their findings, applied here: no lit-edge seam, words fade under the bar, the ground fades into the page, the climbing sun stays out of the bar, and the fallbacks for two cards and accessibility sizes.
  - YJ approved Look 2 SF and asked for a quieter reconcile line and the lit edge back.

## Setup

- **Stack:** `control-howmuch launch` (a disposable Bun/SQLite stack seeded with `fixtures/demo-ledger.json`), with owner `verifier`.
- **Rewards:** `fixtures/rewards-tracker-export.json` imported with an $800 minimum and no categories.
- **Transactions:** seven invented November transactions on Travel Card (`acct-credit`), totalling $400.
- **State variants:** minimum $300 for met, and $300 with a $380 cap for capped. A second card on the same account covers the two-card case.
- **Data:** every value is invented.

## How it was driven

- **Simulators:** iPhone 17 (iOS 26.5) and iPad Pro 11-inch (M5).
- **Host:** a temporary XCTest host (removed before landing) mounted the real `RegisterView` in a `NavigationStack` against the stack. It switched appearance, scroll offset, Dynamic Type and push/pop on command. The shell captured each state with `xcrun simctl io screenshot` and the accessibility labels the surface reported.
- **Not driven:** the shipped app was not tapped through, because axe could not attach to the headless Simulator.

| Check | Expected | Observed |
| --- | --- | --- |
| Rest, light and dark | Scene from the status bar to 28pt under the transactions card top, full width after the 16pt List inset. Balance and `Not reconciled` on one line in the sky. Reward words in SF on the ground, with no card name. | As expected (`final/masthead-light-dark-scroll.jpg`) |
| Minimum journey | Lit to the sun and unlit beyond, only in a band at the horizon, never crossing the title or the words | As expected |
| Scroll 60pt and 260pt | Balance and words fade before passing under the bar; the scene fades away | As expected. The faint row under the bar at 260pt is the system scroll edge, and the old header shows the same |
| Push from Accounts, pop | No sky on Accounts; the register arrives with the masthead | As expected (`final/navigation-and-no-card.jpg`). The mid-push capture landed on the end state |
| No reward card (Everyday Account) | Plain header, no sky | As expected |
| Met and capped, light and dark | Sun lifts in the sky. Capped: no gold wash over the bar or the glass buttons | As expected (`final/states-round2.jpg`, captured before the reconcile caption moved) |
| Two cards, AX3 | Plain header with paper rows | As expected (`final/states-round2.jpg`) |
| Accessibility labels | `-$65,230.80`, `Not reconciled yet` (full reconcile label), `Rewards, Travel Card` | As expected |
| iPad Pro 11 | Full-width masthead | As expected in round 1 (`r1`). Not recaptured after the swipe inset |

## Commands

- `bun run check` on the orb: `bun test` 823 pass, 0 fail, and both typechecks ran. The iOS step was handed to the Mac.
- `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on the Mac satellite: see the landing report.

## Not exercised

- Tapping the reconcile caption and the reward words in the shipped app.
- The search drawer over the masthead.
- Selection mode. The code drops the masthead while selecting.
