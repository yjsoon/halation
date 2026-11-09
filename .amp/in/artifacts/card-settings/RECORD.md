# Card settings and dated reward rules run record

- Change: a card's reward rules (earning rate, block size, minimum and maximum spend, flags, spending tiers, colour names) now keep their history in `ruleHistory` on the card. Each entry holds the rules for reward periods starting before its `until` date, so a later edit never changes rewards already earned and a cap never changes partway through a reward period. `PATCH /api/rewards/cards/:id` takes `applies_from` (a period start date, `current_period`, `next_period` or `everywhere`); without it, as older apps send, only the latest rules change. No transaction rows are written and there is no SQL migration.
- Web: the register's Payment reminders and Reward categories buttons are replaced by one **Card settings** disclosure with Account, Payment reminders and Rewards bands. Rewards edits colour names, reward values and maximum spend, asks **Applies from** (This period / Next period / Correct everywhere) and lists **Earlier rules**. The full editor asks the same on Save.
- iPhone: Edit Account shows **Payment reminders** and **Rewards** (or **Set Up Rewards**) rows. Edit Rewards asks "When do the rule changes apply?" when rules change.
- Base: origin/main `81163cc2`.
- Fixture: `control-howmuch launch` (synthetic `HowMuch Demo` seed), owner `verifier`, `fixtures/rewards-tracker-export.json` imported (Travel Card, `card-travel`, earning rate 1.2, Red `Dining` 4, Blue `Online` 3). The import was rerun before the web steps below so they start from the fixture.
- Web steps (agent-browser, `/transactions?range=all&accounts=acct-credit`):
  1. **Card settings**, rename Red to `Food`, set its reward value 4 to 3, keep **This period, from 1 Nov**, **Save rewards**. Snapshot: latest Red `Food` 3; `ruleHistory` = one entry `until 2026-11-01` with `Dining` 4.
  2. Rename Blue to `Online shops`, choose **Correct everywhere**, **Save rewards**. Snapshot: the history entry now names Blue `Online shops` and still has `Dining` 4.
  3. Report for May 2026: Red flag `Dining`, `rewardRate` 4, `rewardEarned` 346.4. Report for November 2026 uses `Food` 3.
  4. **Earlier rules (1)** reads `Before 1 Nov 2026: Earning rate 1.2 miles/$ · Dining 4 · Online shops 3` (`web-earlier-rules.png`).
- iPhone steps (iPhone SE (3rd generation) simulator on an Amp Mac, signed in to the same stack, driven with `axe`):
  1. Accounts, long-press Travel Card, **Edit Account**: rows `Payment reminders` and `Rewards`, footnote `Rules change by reward period. Earlier periods keep their rules.` (`edit-account.png`).
  2. **Rewards** opens **Edit Rewards**. Earning rate 1.2 to 1.4, **Save**: dialog `When do the rule changes apply?` with `This period, from 1 Nov`, `Next period, from 1 Dec`, `Correct everywhere` (`apply-dialog.png`).
  3. **This period**: snapshot shows earning rate 1.4 and the history entry `until 2026-11-01` keeps 1.2.
- Other screenshots from the first web run: `web-card-settings-open.png`, `web-correct-everywhere.png`, `web-card-settings-narrow.png` (390 px, no overflow), `web-edit-card-scope.png`.
- Also run: `bun test apps/api/src/rewards` 58 pass; `scripts/ios-xcodebuild.sh test` 825 tests, 0 failures, 1 skipped; iOS engine rebuilt with Bun 1.4.0 and `check:ios-engine` up to date.
- Not covered: a physical device, the production stack, multi-month reward periods in the browser (covered by `build.test.ts`).
