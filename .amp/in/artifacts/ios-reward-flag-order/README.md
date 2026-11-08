# iOS reward flag picker order

Base revision: `ccf3ba4a` plus the uncommitted change to `TransactionFormView.swift`, `ScheduledTransactionEditorView.swift` and `RewardCardEditorView.swift` (`RewardCardDraft.flagMenu`).

## Setup

- Disposable stack: `control-howmuch launch` (demo ledger, plan `local-plan`). Owner `verifier` created as setup only.
- Rewards fixture: `fixture-rewards-tracker.json` (synthetic) imported via `POST /api/import/rewards-tracker`. Travel Card (`acct-credit`), rules on: Tap (unflagged, 1.2), Not Counted (red, `excludeFromRewards`), FCY (orange, 3), Online (blue, 4). Yellow, Green, Purple unnamed.
- App: `scripts/ios-xcodebuild.sh test`, installed on iPhone SE (3rd generation), iOS 27.2 Simulator, signed in through native Connection at `http://127.0.0.1:42465`.

## Steps and results

| Step | Expected | Observed |
| --- | --- | --- |
| Travel Card → Candlenut (red) → Flag | Tap, FCY, Online, Not Counted, divider, Yellow, Green, Purple; check on Not Counted | As expected (`1-…png`) |
| Choose Green, Save | API `flag_color` green | `{"flag_color":"green","flag_name":null}` |
| Reopen → Flag | Single check on Green below divider | As expected (`2-…png`) |
| Choose FCY, Save | API orange with name | `{"flag_color":"orange","flag_name":"FCY"}` |
| Scheduled → Add → Flag (Travel Card) | Same order and divider; choosing Purple updates row | As expected (`3-…png`); row read `Flag, Purple`; cancelled |
| Everyday Account → SimplyGo → Flag | Unchanged None…Purple, no divider | As expected (`4-…png`) |

Before the change the same menu read Tap, Not Counted, FCY, Yellow, Green, Online, Purple (YJ's screenshot).

## Tests

- `RewardCardEditorTests` 11/11; new `testFlagMenuPutsEarningNamesFirstThenZeroRewardNamesThenColours` fails when zero-reward detection is removed (mutation run, 2 assertion failures).
- Full `HowMuchTests`: 825 tests, 0 failures, fresh build.
