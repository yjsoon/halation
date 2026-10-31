# iOS Rewards

Rewards is a tab. It shows imported Rewards Tracker cards against the HowMuch ledger. There is no live YNAB connection.

## Sub-features

- `ios-rewards-tab` opens Rewards from the tab bar. Navigation title is `Rewards`.
- `ios-rewards-empty` on a fresh verify instance, with no export imported, shows `No Reward Cards`, **Set Up Rewards**, and **Import Rewards**.
- `ios-rewards-import-then-view` after importing `fixtures/rewards-tracker-export.json` shows Travel Card.
- `ios-rewards-flags` lists Dining and Online in the Categories section of Travel Card's detail sheet.
- `ios-rewards-group` opens Range Report from the board's menu, switches Group to Payee and lists Candlenut.
- `ios-rewards-exposure-states`, `ios-rewards-exposure-sheet`, `ios-rewards-exposure-motion`, `ios-rewards-exposure-register` and `ios-rewards-exposure-accessibility`: the Sun Arc card in each state the fixture reaches. See [Exposure card](#exposure-card).
- `ios-rewards-skyline` sizes board rows by urgency and opens a card in place. See [Board rows open in place (Skyline)](#board-rows-open-in-place-skyline).

## How to get to it (user POV)

- Choose **Rewards** in the tab bar.
- From an empty Rewards screen, choose **Add card** or **Rewards import**, or open **More → Settings → Rewards import & export**.
- Assistant is not an iPhone tab. Choose **More**, then **Assistant**. On iPad regular width it is a sidebar destination. Insights is a tab.

## Driving it with control-howmuch

Preconditions:

- `control-howmuch doctor` passes.
- [iOS connection](./ios-connection.md) signed in as `verifier` against this stack.
- Demo ledger still contains Travel Card spends (Grab, Scoot, MUJI, Candlenut).
- Xcode Simulator is running HowMuch (`sg.soon.howmuch`). If Simulator is missing, skip this whole file.

- **Open empty.** Choose tab `Rewards`. Navigation title `Rewards`. Status is `No Reward Cards`. Buttons **Set Up Rewards** and **Import Rewards** are present.
- **Import.** Choose `Rewards import`, or Settings → `Rewards import & export`. Choose `fixtures/rewards-tracker-export.json`. Choose `Import export`. Stored cards lists `Travel Card`.
- **Open filled.** Return to `Rewards` if needed. Pull to refresh. A row named `Travel Card` is visible; with the as-of date on 24 May 2026 it reads `Minimum met · Resets in 8 days`.
- **Group by payee.** Open **Range Report** from the board's menu. Group includes `Flag`, `Payee`, `Category`, `Memo`. Choose `Payee`; the groups include `Candlenut`.
- **HTTP match.** `control-howmuch http GET "/api/reports/rewards?plan_id=local-plan&group=payee"` returns `data.cards` with `card-travel` and `data.groups` containing Candlenut. Do not POST the import from `control-howmuch http` and call the tab verified.
- **Proof.** Screenshot the empty tab (`artifacts/ios-rewards/empty.png`), the Travel Card tile after import (`artifacts/ios-rewards/travel-card.png`), the payee groups table (`artifacts/ios-rewards/group-payee.png`), and save the GET JSON (`artifacts/ios-rewards/report.json`).

## Account-register details stay in context

- From **Accounts → Travel Card**, tap the rewards row. The card-detail sheet opens over the register, with **Edit** and without **View Transactions**. The app must not select the Rewards tab.
- Dismiss with **Done**, then repeat and swipe down to dismiss. Both paths return to the same account register with its search/filter state intact.
- Open the row again and choose **Edit**. The editor replaces the details sheet. Cancel returns directly to the account, not to another sheet or the Rewards tab.
- Edit again, change the card name to `Travel Card Edited`, and save. The account's rewards row updates. Reopen it and check the detail title. Confirm the stored name through `GET /api/import/rewards-tracker?plan_id=local-plan`.
- Explicitly select **Rewards** and tap the same card. It opens in place (see below) and its **View Transactions** link still works. Long-press it and choose **Show Details** for the full sheet, which keeps **Edit Rewards**.
- Save the revision, patch hash, fixture setup, executed steps, expected/observed outcomes, accessibility output showing the selected tab and register, screenshots, and persisted API result under `.amp/in/artifacts/ios-register-rewards/`.

## Board rows open in place (Skyline)

Rows on the Rewards board stand as tall as their urgency: a card still short of its minimum is a tall row (about 152pt at the default text size) with the figure set large and a pace line such as `about $5.94 a day to make it` (left to the minimum over the days left, rounded up to the cent so it never reads `$0.00`; none on the last day); a card climbing to a tier or cap is the standard strip (about 100pt); met, capped, no-cap and failed cards are slim rows (about 66pt) with one line, `<status> · <earned> earned` and the reset. Rows grow with the text size; at accessibility sizes every row falls back to the scene band above the words.

- **Open.** Tap a row. The detail unfolds under it inside one lifted card (light `#EBEBE6`, dark `#32312A`): **Period** with the dates, `day N of M` and a day rail (the sun labelled `today · N` on the live date and `as of · N` on a past as-of date; a marker labelled `min met · <date>` when the minimum was met on a known day this period, and Targets prints `met <date>` only then), **View Transactions**, **Targets** (Minimum when the card has one, This month, Next tier and Cap, each with its met or remaining state; a minimum that spend has reached while the server still withholds rewards reads `reached, needs this month's minimum` (pending) or `reached, a month was missed` (failed), not in amber; once the period's qualification has failed, a minimum still short reads `<amount> short, a month was missed` and nothing left to spend is amber; a month that closed below its minimum reads `This month <amount> missed` with a crossed mark in secondary ink, never `to go`; a reached cap reads `reached, <amount> beyond` when spend passed it by at least half a cent, a card with only category caps reads `none on the card, categories cap`, and `Consider another card` shows when the server says to stop using it) and **Categories** (spend, a bar and the rate, never wrapping inside a figure; at accessibility sizes the amount takes its own line above the bar and rate; a category over its cap is amber with `<cap> cap · <amount> beyond`). The rows below slide down. VoiceOver reads the row with `Expanded` and the hint `Collapses the details.`; closed it reads `Collapsed` and `Expands to show the period, targets and categories.` A capped row's value includes `<amount> beyond cap`. Hiding the open card, filtering it out, collapsing its group or switching plan, date or accounts closes it.
- **One at a time.** Tap another row: the first closes as the second opens. Tap the open row to close it.
- **View Transactions.** Choose it in the open card. The Accounts tab opens on that account's register.
- **Show Details.** Long-press a row and choose **Show Details**. The full detail sheet opens with **Edit Rewards**; the VoiceOver actions on the row include **Show Details**, **Edit Rewards** and **Hide**.
- **Reduce Motion.** With Reduce Motion on, the card opens and closes in place with no animation: nothing springs or slides.
- **iPad.** At regular width with the board at least 760pt wide, each row is a sunrise window on the left (248pt at an 820pt board, up to 336pt at 1024; the name stays on one line, shrinking a little and then truncating) with the statement on the right: headline with days left (and the pace line on a tall row), **Earned**, and **Period** as `N of M days` with a short rail. The open card lays Period, Targets and Categories side by side (Categories drops under the other two below about 950pt). Slide Over, a narrow split and accessibility text sizes use the phone rows.
- **Sky.** A quiet sky sits behind the large title and the summary line and fades into the page within about 190pt; it scrolls away with the list.
- **Proof.** Screenshot the board in light and dark with one card open, on iPhone and on iPad landscape and portrait (`artifacts/ios-rewards/skyline-{iphone,ipad-1024,ipad-820}-{light,dark}.png`).

## Exposure card

The Sun Arc card (spec `docs/frontend/rewards-exposure-card.md`). Import `fixtures/rewards-exposure-states.json` (16 cards covering most rows of the spec's state table. No card reaches rows 4, 13, 15 or 16, which only unit tests cover (`RewardsReportTests.swift`, `RewardExposureTests.swift` and the web's `reward-row-projection.test.ts`); rows 8 and 14 have no dedicated test, and no card has a category minimum; it replaces the stored card set and keeps Travel Card), then Rewards → Featured menu → **All Cards**, and Today menu → **Choose Date…** → 24 May 2026. The expected headline, basis and picture for each card are the spec's States fixture table; the local API agreed with every card on 21 Oct 2026 (L reads calm with no "Rewards unlock" slip; see the note under the spec's table). `fixtures/rewards-exposure-states-30.json` holds each card twice, for the scroll check.

- **States.** Screenshot every row in light and dark at the default size, and at AX3 (`xcrun simctl ui "$UDID" content_size accessibility-extra-extra-extra-large`), where rows become paper rows with a scene band. No name, title or banner word truncates or splits: card N wraps to two lines on the strip and fully at AX3, and the `Showing 24 May` banner stacks above **Back to Today** at AX sizes and sits beside it at the default size.
- **Sheet.** Long-press A and choose **Show Details** (a tap opens it in place): the card name is a wrapping heading above a 3:2 print in a 6pt border, with the hairline marker at 0.631 of the width, the half-disc sun on it, `$500.00 minimum` at the top left and a tick where the sun will rest. Then D, F, J, K and P. At AX3 the in-frame label and the tick are gone and the slip text scales. No title truncates.
- **Register.** Accounts → Travel Card: a paper row with a 90 × 60pt print on the trailing side; at AX3 a paper row with a band.
- **Fonts.** Names are Instrument Serif Italic, words IBM Plex Sans and figures IBM Plex Mono. A debug launch asserts every face is bundled.
- **iPad.** Where the board uses the phone rows (Slide Over, a narrow split, accessibility sizes), rows are at most 640pt wide and centred; at regular width the Skyline window rows span the board.
- **Floating button.** Scroll to the end of the board: the floating capture and Assistant buttons cover no text. On iPad in the sidebar layout, the floating capture button covers no text either.
- **Motion.** Record the first showing: gate cards sweep right with the sun riding the edge, cards past a minimum sweep and then rise, and no sun moves diagonally. Scroll away and back: no replay. Under Reduce Motion the faces appear in their final pose.
- **Increase Contrast and VoiceOver.** Increase Contrast adds a row outline and a stronger marker. The accessibility dump shows one element per card, labelled with the card name and valued with the spoken string; the art is not focusable.

Store screenshots, recordings and dumps under `.amp/in/artifacts/rewards-exposure/ios/`.

## Gotchas

- Demo rows are dated 2026-03-01 through 2026-05-24. `This Month` is empty unless today falls in that span. Stay on `All Time`.
- The tab reads the HowMuch ledger, not a second YNAB sync. Import the settings export first.
- Linux CI cannot run Simulator. Native `RewardsReportTests` plus `control-howmuch http` are the proof this VM can produce.
- Do not look for Rewards on Insights. Insights still has four report cards only.
