# iOS Rewards

Rewards is a tab. It shows imported Rewards Tracker cards against the HowMuch ledger. There is no live YNAB connection.

## Sub-features

- `ios-rewards-tab` opens Rewards from the tab bar. Navigation title is `Rewards`.
- `ios-rewards-empty` on a fresh verify instance, with no export imported, shows `No reward cards in this range.`, **Add card**, and a `Rewards import` button.
- `ios-rewards-import-then-view` after importing `fixtures/rewards-tracker-export.json` shows Travel Card on All Time.
- `ios-rewards-flags` lists Dining and Online flag rows on Travel Card.
- `ios-rewards-group` switches Group to Payee and lists Candlenut.
- `ios-rewards-skyline` sizes board rows by urgency and opens a card in place (below).

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

- **Open empty.** Choose tab `Rewards`. Navigation title `Rewards`. Date range chip is `All Time`. Status is `No reward cards in this range.` Detail mentions Rewards import and **Add card** to score one of your HowMuch cards. Buttons `Add card` and `Rewards import` are present. Trailing ellipsis is `More`.
- **Import.** Choose `Rewards import`, or Settings → `Rewards import & export`. Choose `fixtures/rewards-tracker-export.json`. Choose `Import export`. Stored cards lists `Travel Card`.
- **Open filled.** Return to `Rewards` if needed. Pull to refresh. A Miles tile named `Travel Card` is visible. Qualifying spend is greater than `$0.00`. Group chip includes `Flag`, `Payee`, `Category`, `Memo`.
- **Group by payee.** Choose `Payee`. The groups table heading is `By Payee` and includes `Candlenut`.
- **HTTP match.** `control-howmuch http GET "/api/reports/rewards?plan_id=local-plan&group=payee"` returns `data.cards` with `card-travel` and `data.groups` containing Candlenut. Do not POST the import from `control-howmuch http` and call the tab verified.
- **Proof.** Screenshot the empty tab (`artifacts/ios-rewards/empty.png`), the Travel Card tile after import (`artifacts/ios-rewards/travel-card.png`), the payee groups table (`artifacts/ios-rewards/group-payee.png`), and save the GET JSON (`artifacts/ios-rewards/report.json`).

## Account-register details stay in context

- From **Accounts → Travel Card**, tap the rewards bar. The card-detail sheet opens over the register, with **Edit** and without **View Transactions**. The app must not select the Rewards tab.
- Dismiss with **Done**, then repeat and swipe down to dismiss. Both paths return to the same account register with its search/filter state intact.
- Open the bar again and choose **Edit**. The editor replaces the details sheet. Cancel returns directly to the account, not to another sheet or the Rewards tab.
- Edit again, change the card name to `Travel Card Edited`, and save. The account's rewards bar updates. Reopen it and check the detail title. Confirm the stored name through `GET /api/import/rewards-tracker?plan_id=local-plan`.
- Explicitly select **Rewards** and tap the same card. It opens in place (see below) and its **View Transactions** link still works. Long-press it and choose **Show Details** for the full sheet, which keeps **Edit Rewards**.
- Save the revision, patch hash, fixture setup, executed steps, expected/observed outcomes, accessibility output showing the selected tab and register, screenshots, and persisted API result under `.amp/in/artifacts/ios-register-rewards/`.

## Board rows open in place (Skyline)

Rows on the Rewards board stand as tall as their urgency: a card still short of its minimum is a tall row (about 152pt at the default text size) with the figure set large and a pace line such as `about $5.94 a day to make it` (left to the minimum over the days left, rounded up to the cent so it never reads `$0.00`; none on the last day); a card climbing to a tier or cap is the standard strip (about 100pt); met, capped, no-cap and failed cards are slim rows (about 66pt) with one line, `<status> · <earned> earned` and the reset. Rows grow with the text size; at accessibility sizes every row falls back to the scene band above the words.

- **Open.** Tap a row. The detail unfolds under it inside one lifted card (light `#EBEBE6`, dark `#32312A`): **Period** with the dates, `day N of M` and a day rail (a marker labelled `min met · <date>` when the minimum was met this period), **View Transactions**, **Targets** (Minimum when the card has one, This month, Next tier and Cap, each with its met or remaining state; a reached cap reads `reached, <amount> beyond` when spend passed it, a card with only category caps reads `none on the card, categories cap`, and `Consider another card` shows when the server says to stop using it) and **Categories** (spend, a bar and the rate; a category over its cap is amber with `<cap> cap · <amount> beyond`). The rows below slide down. VoiceOver reads the row with `Expanded` and the hint `Collapses the details.`; closed it reads `Collapsed` and `Expands to show the period, targets and categories.` A capped row's value includes `<amount> beyond cap`. Hiding the open card, filtering it out, collapsing its group or switching plan, date or accounts closes it.
- **One at a time.** Tap another row: the first closes as the second opens. Tap the open row to close it.
- **View Transactions.** Choose it in the open card. The Accounts tab opens on that account's register.
- **Show Details.** Long-press a row and choose **Show Details**. The full detail sheet opens with **Edit Rewards**; the VoiceOver actions on the row include **Show Details**, **Edit Rewards** and **Hide**.
- **Reduce Motion.** With Reduce Motion on, the detail cross-fades instead of springing open.
- **iPad.** At regular width with the board at least 760pt wide, each row is a sunrise window on the left (248pt at an 820pt board, up to 336pt at 1024; the name stays on one line, shrinking a little and then truncating) with the statement on the right: headline with days left (and the pace line on a tall row), **Earned**, and **Period** as `N of M days` with a short rail. The open card lays Period, Targets and Categories side by side (Categories drops under the other two below about 950pt). Slide Over, a narrow split and accessibility text sizes use the phone rows.
- **Sky.** A quiet sky sits behind the large title and the summary line and fades into the page within about 190pt; it scrolls away with the list.
- **Proof.** Screenshot the board in light and dark with one card open, on iPhone and on iPad landscape and portrait (`artifacts/ios-rewards/skyline-{iphone,ipad-1024,ipad-820}-{light,dark}.png`).

## Gotchas

- Demo rows are dated 2026-03-01 through 2026-05-24. `This Month` is empty unless today falls in that span. Stay on `All Time`.
- The tab reads the HowMuch ledger, not a second YNAB sync. Import the settings export first.
- Linux CI cannot run Simulator. Native `RewardsReportTests` plus `control-howmuch http` are the proof this VM can produce.
- Do not look for Rewards on Insights. Insights still has four report cards only.
