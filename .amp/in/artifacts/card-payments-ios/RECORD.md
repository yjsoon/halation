# iOS card payment reminders: validation record

- Revision under test: `c42fc3ad33ab93edacd265b8c6aaa65ae4bfa5ed` (branch `claude/project-thread-gnrkc7`), checked out detached and clean on a Devin macOS runner.
- Runner session: https://app.devin.ai/sessions/d290cc4d0ff24e3085d67baa9fc30169 (read-only: no commits, pushes or Speedflight).
- Command: `scripts/ios-xcodebuild.sh test` from the repository root, simulator accessibility enabled per `apps/ios/AGENTS.md`, iPhone 17 simulator, iOS 26.5.
- Fixture: a fresh local-mode install ("Start on this iPhone") with synthetic data only: Account B (Checking, 5,000.00), Card A ending 0000 (Credit Card, 1,234.56 owed), Card C ending 1111 (Credit Card, 412.00 owed). Simulator date 18 Oct 2026.
- Screenshots: `/mnt/project-files/payment-reminders/screens/ios/01` to `15` (not committed; the repository is public and these are review artefacts outside it).

## Expected

- Build succeeds; existing suite passes.
- Terms sheet with DBS / POSB and statement day 3 shows "Next: statement 3 Oct, due Wed 28 Oct" (3 Oct + 25 days = Wed 28 Oct). OCBC preset switches to 23 days, previous working day: due Mon 26 Oct.
- Band lists the card, due Wed 28 Oct, 10 days, minimum 50.00 (higher of 50 and 3%).
- With Pay from saved, Schedule completes in one tap with "Scheduled: ... from Account B on Mon 26 Oct. Set it up in your bank app." (2 working days before Wed 28 Oct). Without Pay from, Schedule opens the sheet; Remember writes Pay from back to the terms.
- Pending requests after scheduling the current cycle: only `funds` (25 Oct 18:00, evening before pay day) for the 3 Oct cycle; the 3 Nov cycle has statement (3 Nov), lead (due 30 Nov minus 7 = 23 Nov), lastSafe (26 Nov), due (Mon 30 Nov, because 28 Nov is a Saturday and DBS moves to the next working day) and three overdue (1 to 3 Dec), all at 08:00.

## Observed (runner reports, verbatim)

### Round 1

iOS validation complete for yjsoon/howmuch @ c42fc3ad33ab93edacd265b8c6aaa65ae4bfa5ed (`git rev-parse HEAD` confirmed, detached HEAD, working tree clean). Read-only — no commits, pushes, or project changes.

**Build: PASSED.** `scripts/ios-xcodebuild.sh test` → build-for-testing exit=0 (no `error:` lines in the log, no warnings in `apps/ios/HowMuch/Payments/` — 18 warnings total elsewhere). Test run on iPhone 17 simulator (iOS 26.5, accessibility enabled per AGENTS.md).

**Test summary: 779 tests executed, 1 skipped, 0 failures** in 223.5s — "TEST EXECUTE SUCCEEDED". Plus a Swift Testing suite: `RewardDraftPeriodTests`, 3 tests / 1 suite, all passed.
- Skipped: `CaptureInterpreterTests.testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery` — opt-in ("Set HOWMUCH_LIVE_MODEL_VERIFY=1 to run the on-device Foundation Models regression").
- Failing tests: none.
- Note: post-test `simctl diagnose` timed out after 600s ("Failure collecting diagnostics from simulator"), known noise; test results unaffected.

**Simulator check: done** — drove the app UI on the sim.
- Installed + launched; `simctl privacy grant notifications` is not permitted on this sim, so I tapped Allow on the in-app prompt (it appeared when saving Payment reminders).
- Started local mode ("Start on this iPhone"), created Account B (Checking, $5,000.00) and Card A ending 0000 (Credit Card, listed as -$1,234.56).
- Payment reminders: bank already DBS / POSB; set statement day to 3rd of the month, Pay from = Account B. Pre-save screenshot attached (01).
- "Payments due" band showed Card A: "Due Wed 28 Oct · 10 days, Statement 3 Oct · min $50.00". Screenshot attached (02).
- Deviation: tapping "Schedule" did NOT open a "Schedule payment" sheet — it directly scheduled the payment and showed a toast: "Scheduled: $1,234.56 from Account B on Mon 26 Oct. Set it up in your bank app." Band afterwards shows "Scheduled" (screenshot 03). No "Mark as scheduled" step occurred.
- Settings → Reminders → "Reminders on this iPhone: 8", expanded "Pending reminders" (screenshots 04-05). All 8 verbatim:

```
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-10-03.funds — 25 Oct 2026 at 6:00 PM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.statement — 3 Nov 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.lead — 23 Nov 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.lastSafe — 26 Nov 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.due — 30 Nov 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.overdue — 1 Dec 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.overdue2 — 2 Dec 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.overdue3 — 3 Dec 2026 at 8:00 AM
```

### Round 2

Round 2 done on the same sim/app state — all read-only, no code touched.

**1. Card C ending 1111 created** (Credit Card, listed as -$412.00). Payment reminders saved with statement day = 3rd of the month, Pay from left at "Ask each time". (Minor note: name autocapitalized to "Ending" on first entry; fixed to exact "Card C ending 1111".)

**2. Payments due band** listed Card C — "$412.00, Due Wed 28 Oct · 10 days, Statement 3 Oct · min $50.00 · recorded so far" (screenshot 06). Tapping Schedule **did** open the "Schedule payment" sheet this time (screenshots 07 top / 08 bottom): Amount defaulted to "Statement $412.00" (Minimum $50.00 and Other also offered), From defaulted to Account B (I opened the picker — Account B was already checked and confirmed it), Pay on 26 Oct 2026, "Remember for this card" toggle ON with text "Next time, Scheduled on the reminder finishes without opening Halation." Tapped "Mark as scheduled" → toast "Scheduled: $412.00 from Account B on Mon…" and band now shows Scheduled for both cards (screenshot 09).

Side effect observed: "Remember for this card" persisted Account B — Card C's Payment reminders sheet now shows Pay from = Account B (was "Ask each time").

**3. Settings → Reminders** captured (screenshots 10-11): Notifications On, App icon badge, Card A On, Card C On, "Reminders on this iPhone: 16". App icon badge → "Both" took effect, then back to "Inbox only" took effect — **worked both ways**.

**4. Pending reminders — all 16 verbatim** (screenshots 12-14):
```
halation.card.acct_92384209-2e36-45bd-bc6f-2158e08cfad1.2026-10-03.funds — 25 Oct 2026 at 6:00 PM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-10-03.funds — 25 Oct 2026 at 6:00 PM
halation.card.acct_92384209-2e36-45bd-bc6f-2158e08cfad1.2026-11-03.statement — 3 Nov 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.statement — 3 Nov 2026 at 8:00 AM
halation.card.acct_92384209-2e36-45bd-bc6f-2158e08cfad1.2026-11-03.lead — 23 Nov 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.lead — 23 Nov 2026 at 8:00 AM
halation.card.acct_92384209-2e36-45bd-bc6f-2158e08cfad1.2026-11-03.lastSafe — 26 Nov 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.lastSafe — 26 Nov 2026 at 8:00 AM
halation.card.acct_92384209-2e36-45bd-bc6f-2158e08cfad1.2026-11-03.due — 30 Nov 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.due — 30 Nov 2026 at 8:00 AM
halation.card.acct_92384209-2e36-45bd-bc6f-2158e08cfad1.2026-11-03.overdue — 1 Dec 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.overdue — 1 Dec 2026 at 8:00 AM
halation.card.acct_92384209-2e36-45bd-bc6f-2158e08cfad1.2026-11-03.overdue2 — 2 Dec 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.overdue2 — 2 Dec 2026 at 8:00 AM
halation.card.acct_92384209-2e36-45bd-bc6f-2158e08cfad1.2026-11-03.overdue3 — 3 Dec 2026 at 8:00 AM
halation.card.acct_b98c8b5f-b214-44e4-ad93-abb175b5b965.2026-11-03.overdue3 — 3 Dec 2026 at 8:00 AM
```

**5. Card C Bank → OCBC** (screenshot 15): Due changed "25 days after statement" → **"23 days after statement"**; "If due on a weekend" changed "Next working day" → **"Previous working day"**; Next line changed "statement 3 Oct, due Wed 28 Oct" → **"statement 3 Oct, due Mon 26 Oct"**. Tapped Cancel — Edit Account still shows "Next due Wed 28 Oct", so the OCBC change was discarded as intended.

## Result

All expectations met. Not exercised: notification action buttons on a delivered notification (Scheduled, Paid, Snooze from the lock screen), server-mode queueing while offline, the background refresh task, and denied-permission rows.
