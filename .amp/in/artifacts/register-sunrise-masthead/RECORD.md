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

## Follow-up verification (9 Nov 2026, on 52d8e60 plus the fade fix)

These were driven through the same temporary host on the rebased tree, which includes the swipe fix's 16pt List inset. The List frame was x 16, width 370 on iPhone 17, and x 16, width 802 on iPad Pro 11. Taps went through the elements' accessibility activation. The ⋯ menu was opened through the button's real context-menu interaction, and its "Select Transactions" action came from the presented menu.

| Check | Expected | Observed |
| --- | --- | --- |
| Tap the `Not reconciled` caption | Reconcile opens for this account | Pass: the Reconcile sheet opens on Account Travel Card, with Statement date and Statement balance |
| Tap the reward words | Card details open over the register | Pass: the sheet shows Travel Card, Period 1 Nov – 30 Nov, Done and Edit Rewards |
| Search | Drawer opens; the masthead stays intact | Pass: the field sits at the bottom and the bar hides, as on an account without a card (`final/search-drawer.jpg`). Closing search was not exercised, because the host could not reach the system Close |
| ⋯ menu → Select Transactions, then Done | Plain header while selecting, sunrise back after Done | Pass: Select All and Done take the bar, and the plain balance and paper reward row show. After Done the sunrise returns, in light and dark (`final/selection-mode.jpg`) |
| iPad Pro 11 after the swipe inset | Full-width sky; words aligned with the inset card | Pass (`final/ipad-rest.jpg`) |
| Scroll, iPad 40–140pt and iPhone 30–100pt | Nothing ghosts behind the title | Initially failed on iPad at 100pt: the reward line showed faintly behind the title. The fade now reaches zero 8pt into the bar instead of 24pt. Rechecked as a pass (`final/ipad-scroll-dark.jpg`, `final/iphone-scroll-fade.jpg`) |

HowMuchTests ran 825 tests, 1 skipped, 0 failures, on a fresh build that matched the worktree.

## Scroll away and back (10 Nov 2026)

- **Report (YJ, on the 03:00 TestFlight build):** "When I scroll down and then back up there's no more rewards header."
- **Cause:** the header row reset the sky's row height to 0 in `onDisappear`. Once the list unloads the row a few screens down, its height is unchanged when it comes back, so `onGeometryChange` never reports again and the sky stays transparent. The words, which live in the row, came back without it.
- **Fix:** drop the reset. The sky is drawn only when the header row is (both read the same `mastheadScene`), and while the row is off screen the sky's own scroll-position fade already hides it.
- **Setup:** the same stack, plus 120 invented October rows on Travel Card (`acct-credit`), so the header leaves the list.
- **Driven:** a temporary XCTest host (removed before landing) mounted the real `RegisterView` in a `NavigationStack` on iPhone 17. It scrolled the list 3000pt down in 120pt steps, then back to the top, and captured each stage.

| Stage | Before the fix | After the fix |
| --- | --- | --- |
| Rest | Sunrise behind the header | Same |
| 3000pt down | No sky | No sky |
| Back at the top, settled | Balance and words on the plain page, no sunrise | Sunrise as at rest (the capture matches the rest capture byte for byte in size) |

`final/scroll-back-before-after.jpg` shows rest, back before the fix, and back after the fix.

HowMuchTests: 825 tests, 1 skipped, 0 failures on a fresh build of the fixed tree (Xcode 27.3, iPhone 17). A first run on the cold simulator failed four Add Transaction sheet snapshot tests with empty accessibility trees; they passed on rerun and the full rerun was clean. `bun test` 823 pass; web and worker typechecks pass.

## Web (10 Nov 2026)

- **Request (YJ):** "Let's see if we can do this on the web too."
- **Before:** the web register showed the title and working balance on the plain page, with no reward words (`web/before-desktop.jpg`).
- **Change:** `components/RegisterMasthead.tsx` draws the card's strip (`ExposureFace`, variant `strip`) behind the register header of a card account with exactly one reward card. The details are in the spec's "Register masthead", under Web.
- **Setup:** the same control-howmuch stack (web on Vite, API on Bun/SQLite), owner `verifier`. Travel Card (`acct-credit`) has seven invented November spends and 120 invented October rows. The rewards export is `fixtures/rewards-tracker-export.json` with flag categories off and an $800 minimum, varied by `web/states.sh`.
- **Driven:** agent-browser (Chromium) at 1280 × 860 and 390 × 844, light and dark (`html[data-mode]`), plus 320, 820, 1024 and 1440 wide.

| Check | Expected | Observed |
| --- | --- | --- |
| Gate, light and dark, desktop and phone | Sky from under the app bar to above Filters, full content width. Title and balance left in the sky; `$X to minimum`, deadline and basis on the ground; no second card name | As expected (`web/desktop-light.jpg`, `web/desktop-dark.jpg`, `web/phone-light-dark.jpg`) |
| Met, capped, card named differently, two cards | Sun lifted; capped gold sky; `Halo Miles` shown on the ground; two cards keep the plain header | As expected (`web/states-phone.jpg`). `states.sh` reports `rest`, `capped`, `gate` and `plain` |
| No reward card (Everyday Account) | Plain header | As expected |
| Contrast, capped dark (the worst sky) | Soft ink at least 4.5:1 | Failed at 3.46:1 before the pour and bloom were held to 35%; now 5.37:1 for the breakdown line and 7.3:1 for the balance, from sampled pixels |
| Dark scrim | No slab edge under the words | Failed first (a hard bottom edge); the scrim now runs into the fade and softens in above the words |
| Widths 320, 390, 820, 1024, 1440 | No horizontal scroll; scene spans the report body | Overflow 0 at every width; masthead left and right equal the report body's |
| Keyboard | Tab reaches the ground words with a visible ring; Enter opens Rewards for this card | Focus ring shown; Enter opened `/rewards?accounts=acct-credit`, which lists only Travel Card |
| Accessible name | `Rewards, {card}. {spoken status}` | `Rewards, Travel Card. $800.00 to minimum. $0.00 of $800.00, 0 per cent. 21 days left, ends 30 Nov. ...` |
| Save a spend in the register | Words update without a reload | Added `Test Bakery` −$50.00 through + Add transaction: within 2s the ground read `$350.00 to minimum` and `$450.00 / $800.00` |

Checks: `bun run check` (bun test and the web and worker typechecks). No iOS files changed.
