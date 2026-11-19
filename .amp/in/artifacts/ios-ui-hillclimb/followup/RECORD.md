# iOS UI hillclimb follow-up: low notes, coverage gaps and VoiceOver

Thread: https://ampcode.com/threads/T-01a1f3cf-8128-710e-a8ba-2186e0e57d4f. It reviews what the hillclimb (`../lead/RECORD.md`) left open. The findings, scores and the decision list for YJ are in the hillclimb artifact, section "Follow-up review, 19 Nov".

## Revision and setup

- Base: `origin/main` `3d9eb8e2` ("before"). One commit per fix on top, each with a `Finding:` trailer where it closes a numbered finding.
- Amp Mac satellite `macos-27`, `mac.large`, Xcode 27.3. Simulators on iOS 27.3: iPhone 18 Pro, iPhone SE (3rd generation), iPhone Duo, iPad Pro 13-inch (M5). Both accessibility settings written on each simulator first.
- Disposable verify stack on the orb (`control-howmuch launch`), seeded with `../kit/seed-audit.ts`, API port forwarded to the Mac. Payment terms (statement day 1, due gap 25) put on Travel Card and Platinum Cashback Card through the API so Payments due shows. Synthetic data only.
- "Before" is a build of `3d9eb8e2` and "after" a build of the branch, both with `scripts/ios-xcodebuild.sh build`, installed with `xcrun simctl install`. Driven with `axe` (tap, touch, swipe, rotate, hinge, describe-ui). iPhone SE landscape comes from Device Hub's Device > Orientation menu, scripted with `osascript`.
- Frames are `[x, y, width, height]` in points. "Largest size" is `accessibility-extra-extra-extra-large`. Screenshots are not in git.

## Fixes

| Finding | Device and state | Before | After |
| --- | --- | --- | --- |
| 2PD-23 | iPad Pro, portrait, More > Settings > Skill & Memory | iPhone symbol beside "Stored on this iPad" | iPad symbol; iPhones keep the iPhone symbol |
| 2PD-21 | iPad Pro, largest size, same page | chevron alone on a fourth line at x 270, row `[242,634,548,336]` | chevron `[745,662,22,39]` at the trailing edge on the symbol's line, row `[242,634,548,284]`. iPhone SE at the largest size: chevron `[314,388,22,39]`, "documents" whole |
| 2PD-20 | iPad Pro, `large`, Rewards > Summary | caption and Flag menu at x 20 (the 4pt padding put the caption's text at about x 24), "Qualifying spend" at x 40 | caption, Flag menu and "Totals" all start at x 40 in the screenshot; Range Report's filter bar keeps its zero insets |
| 2IP-33 | Accounts > Scheduled, "Transfer to Rainy Day Saver" | 18 Pro `extra-extra-large` `[32,318,108,77]` (3 lines), SE `large` `[32,246,140,20]` (cut) | 18 Pro `extra-extra-large` `[32,318,166,51]` (2 lines), `extra-large` `[32,304,166,23]`; SE `large` `[32,246,166,20]`. SE from `extra-extra-large` up unchanged ("Repeats monthly" sets the amount column there). Amount on one line at every size |
| 2IP-29 | iPhone 18 Pro, largest size, Rewards > Travel Card open | Period "1 Nov to 30 N…" `[32,458,319,50]`; button "View / Transaction / s" `[32,661,338,187]` | Period whole on three lines `[32,370,297,148]`; button "View / Transactions" `[32,672,338,124]`. iPhone SE the same. `large`: Period beside its title `[154,285,216,16]`, button 44pt high, as before |
| 2IP-32 | iPhone SE, `large`, long press Wallet | lifted preview about 183pt wide, a pill | preview the row's width (343pt). A pressed middle row's wash is still square across the card (2IP-27 holds) |
| 2DU-12, 2IP-30 (chart label) | iPhone SE, largest size, Insights | Income vs Spending "Jan 26" `[8,…,118,48]`, "Nov" `[300,…,69,48]`, both cut at the card's edges; Net Worth "Jan 26" at x −4 | "Jan 26" at x 24 and "Nov" ends at x 351, inside the card on both charts. Duo closed display, dark, largest size: "Jan 26" x 24, "Nov" ends at x 358, inside its 350pt card |
| VoiceOver | iPhone 18 Pro, Spending Breakdown | month arrows read "Back" and "Forward" | "Previous month" and "Next month" |
| VoiceOver | iPhone 18 Pro, Add Transaction | memo field `TextField ''` (prompt only) | `TextField 'Memo'`, value "Enter a memo…" while empty. `testAddTransactionMemoFocusHidesCalculatorKeypad` finds the field by the new label |

## Coverage checks, no code change

- Duo Conversation dock (after 2IP-31's fix `5a34c539`), dark, keyboard up, draft "Lunch at Toast Box 7.60": closed portrait `large` Send `[312,312,44,44]` above the keyboard's top at about y 373; closed portrait and closed landscape at the largest size and at `large`, and open flat at `large` and the largest size: Send and + whole above the keyboard in each screenshot.
- iPhone SE, portrait, largest size: tours of groups A (Settings, AI provider, Connection, Import & Export), C (Platinum Cashback Card, Travel Card, New, All), D (Add Transaction), F (board, open card, Summary), G (Insights, Spending Breakdown, Net Worth) and I (Payments due, Schedule payment). Only known items seen: "Re- / wards import & export" (2IP-23), "Ever…ount" (2IP-12), "Not reconciled yet" / the sun (IP-17, LEAD-02).
- iPhone 18 Pro, portrait, `large`: the same groups. Nothing new.
- iPhone SE, landscape, `large` and largest size: Accounts, Scheduled, Schedule payment, New, Add Transaction, Rewards and an open card, Insights, Spending Breakdown, Settings, Assistant. Nothing cut or covered beyond the portrait items. The register tour missed Platinum Cashback Card (the scroll did not reach it), so a register in SE landscape is not checked.
- VoiceOver, iPhone 18 Pro, `large`, by the accessibility tree (no VoiceOver run): Accounts, Scheduled, a register, New, Add Transaction, Rewards, Insights, Spending Breakdown, Settings, Assistant, Conversation. Unlabelled controls found: the month arrows and the memo field (fixed). The other unlabelled nodes are system children of labelled menus and switches ("Organise accounts", "Options for …", "Cards, Featured", the switches in Settings and the form), which VoiceOver reads by their parent.
