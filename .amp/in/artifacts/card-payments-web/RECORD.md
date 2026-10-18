# Card payments web: E2E record

Feature: web Payments due panel on `/scheduled`, Schedule… through the existing schedule editor, and the Card payment terms dialog (from the panel, the set-up entry and the card register toolbar).

## Revision

- First run: base `86b96de` plus the web commit `8d67d66`.
- Review fix round (this record): backend `cbb2829` (previous_unpaid, created_at, partial, settled, windows) plus the web fixes W1 to W5 committed alongside this record (`apps/web`). Every check below was re-run on that tree.
- Run date 2026-10-18 (browser and API clock; `as_of` 2026-10-18).

## Setup

- Isolated stack from the verify-howmuch skill, in its own state root so it cannot meet another agent's stack:
  `HOWMUCH_VERIFY_STATE_ROOT=/tmp/howmuch-verify-web HOWMUCH_VERIFY_RUN_ID=cardpay-web control-howmuch launch` then `control-howmuch doctor` (all `ok`; SQLite under `/tmp/howmuch-verify-web/cardpay-web/`). Script: `relaunch.sh`.
- Fixture `fixtures/demo-ledger.json` (synthetic): Everyday Account, Rainy Day Saver, Travel Card (`creditCard`, balance owed 64,830.80). No card terms, no schedules.
- Driver: Playwright 1.56 with the preinstalled Chromium (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node e2e-run.cjs`). Desktop 1440x1000; phone 390x844 at 2x, touch.
- Commands outside the run: `bun run verify:worker` (typecheck + build + Worker dry run) exit 0; `bun test` 751 pass, 0 fail.

## Steps, expected and observed

| # | Step | Expected | Observed |
|---|---|---|---|
| 0 | First-owner setup as `verifier` | Ledger shell | Ledger shown |
| 1 | Open Scheduled | No Payments due panel (no terms); "Set up payment reminders" entry because a credit card exists | As expected (`01-desktop-setup-entry.png`) |
| 2 | Set up payment reminders | Dialog "Set up payment reminders", Card = Travel Card, preset DBS / POSB | As expected |
| 2a | Preset OCBC, then DBS | OCBC fills 23 / previous working day; DBS fills 25 / next | 23 / previous, then 25 / next |
| 2b | Statement day 3, Pay from Everyday Account | Live line from the server's own cycle maths: due Wed 28 Oct for the 3 Oct statement, pay by Mon 26 Oct | "Next due Wed 28 Oct, for the 3 Oct statement. Pay by Mon 26 Oct." (`02-desktop-terms-dialog.png`) |
| 2c | Save terms | Dialog closes; status names the card and next due date; panel appears | "Payment terms saved for Travel Card. Next due Wed 28 Oct, for the 3 Oct statement." |
| 3 | Panel row | Travel Card, 3 Oct, Wed 28 Oct, "$64,830.80 recorded", "min $1,944.93", Unscheduled, Schedule… and Terms; caveat "Check your statement for the actual amount." | As expected (`03-desktop-panel-unscheduled.png`) |
| 3a | API `GET card_payment_terms` | One row: acct-credit, day 3, gap 25, next, funding acct-everyday | As expected (`api-01-card-payment-terms.json`) |
| 3b | API `GET card_payments` | current cycle 2026-10-03 / 2026-10-28, coverage unscheduled | As expected (`api-02-card-payments-unscheduled.json`) |
| 4 | Schedule… | Existing schedule editor, heading "Schedule Travel Card payment", Account Everyday Account, Transfer to Travel Card, Amount -64830.8, First/Next 2026-10-26, Repeat Once, Memo "Travel Card statement 3 Oct", note says the amount is recorded so far and to check the statement | As expected (`04-desktop-schedule-prefilled.png`) |
| 4a | Schedule payment | POST carries `Idempotency-Key: card-pay:acct-credit:2026-10-03`; status tells the user to set it up in the bank app; row flips to "Scheduled 26 Oct from Everyday Account" with Edit, no Schedule… | Key as expected (`requests.json`); status "Scheduled $64,830.80 to Travel Card on 26 Oct 2026. Set up the same payment in your bank app."; row as expected (`05-desktop-panel-scheduled.png`) |
| 4b | API `GET scheduled_transactions` and `card_payments` | One live `never` transfer acct-everyday to acct-credit on 2026-10-26, amount -64830800, memo set; coverage `scheduled` pointing at that id | As expected (`api-03-scheduled-transactions.json`, `api-04-card-payments-scheduled.json`) |
| 5 | Delete that schedule, Schedule… again, save | Row back to Unscheduled after delete; the base key replays the deleted schedule, so the page checks the statement is still uncovered and saves with a suffixed key; one new live schedule | Keys sent: base, base, `card-pay:acct-credit:2026-10-03:10bceab2`; one live schedule with a new id (`api-03b-scheduled-after-reschedule.json`, `05b-desktop-panel-rescheduled.png`) |
| 6 | Travel Card register, Payment reminders | Toolbar button on a card register opens "Payment reminders for Travel Card" with the saved terms (statement day 3) | As expected (`06-desktop-register-terms.png`) |
| 7 | Phone width `/scheduled` | Panel stacks into rows, no horizontal page scroll | Overflow 0px (`07-phone-panel-scheduled.png`) |
| 7a | Phone, Terms | Dialog full screen, single-column fields, footer reachable | As expected (`08-phone-terms-dialog.png`) |
| 8 | Enter the schedule now | Row reads "Posted 18 Oct, awaiting approval"; API coverage `posted`, `approved: false` | As expected (`09-desktop-panel-posted.png`, `api-05-card-payments-posted.json`) |

### Review fix round (W1 to W5)

Extra setup, all synthetic: `seed-states.py` (run by the script through the API) adds Card B, Card C and Card D with fake charges and terms, all paying from Everyday Account. `backdate.py` moves Card C's terms `created_at` to 2026-08-01 so its 12 Oct due date falls after setup. `close-account.py` closes Account Z in SQLite, because the API has no close route.

| # | Step | Expected | Observed |
|---|---|---|---|
| 9 | Card C before backdating | Not overdue for a due date before setup (B2) | `unscheduled`, `previous_unpaid` null (`api-06-...json`) |
| 10 | Panel with the new states (W1) | Card B "$20.00 of $500.00 paid" with Schedule…; Card C "Overdue since 12 Oct" with Schedule…; Card D "Nothing owed now", no Schedule…, next statement line | As expected (`10-desktop-panel-states.png`, `api-07-...json`) |
| 11 | Card B Schedule… (W2, W3) | Amount -480 (the remainder); date 26 Oct; date picker min 18 Oct (today) and max 3 Nov (`window_end`); memo exactly "Card B statement 3 Oct" | As expected |
| 11a | Set the date to 10 Nov and save | Refused; editor stays open; nothing sent | Native range check refuses ("Value must be 11/03/2026 or earlier."); no POST sent (`11-desktop-window-validation.png`). If the native check is bypassed, the editor's own check refuses the date too |
| 12 | Another device schedules Card B first with the shared key and a different amount, then this page saves (W3, W4) | The page's save gets a 409, re-reads the cycle, finds it covered, creates nothing, closes the editor, refreshes the panel and explains | Alert "This statement already has a payment scheduled or recorded, so nothing was scheduled. Payments due has been refreshed."; editor closed; row reads Scheduled; only the two other-device schedules exist (`12-desktop-409-covered.png`, `api-08-...json`) |
| 13 | Card C Schedule…, carried overdue | Amount -300, date today (18 Oct); note names the unpaid 15 Sep statement; after saving, the row reads Scheduled and still warns "Previous statement 15 Sep unpaid, due 12 Oct" | As expected; API coverage `scheduled` with `previous_unpaid` kept (`13-desktop-overdue-scheduled.png`, `api-09-...json`) |
| 14 | Card D terms paying from Account Z, Account Z closed, open Terms (W5) | Pay from shows "Choose an account" with a note that the account is closed | As expected (`14-desktop-terms-closed-account.png`) |
| 15 | Phone width with every state | No horizontal page scroll | Overflow 0px (`15-phone-panel-states.png`) |

A "refuse if the cycle is missing after a 409" case is in the code: it shows "This statement is no longer in Payments due, so nothing was scheduled." It was not driven, because the stack cannot drop a cycle in the middle of a save.

### Round 3 (R-W1 to R-W4)

The run used base `4bf9205`. The backend agent's uncommitted R-B1/R-B2 edits to `apps/api` were in the working tree at the time and were served by the local API. `mark-deleted.py` marks Account Y deleted in SQLite (setup only).

| # | Step | Expected | Observed |
|---|---|---|---|
| 16 | Approve the posted Travel Card payment (API), reload (R-W2) | Row reads "Paid $64,830.80 on 18 Oct" | As expected (`09b-desktop-panel-paid.png`) |
| 17 | Panel footnote (R-W3) | "Record payments as a transfer from your bank account so Halation can tell the statement is paid." | Shown |
| 18 | Another device schedules Card C while the tab still shows it overdue, then Schedule… (R-W1) | Schedule… re-reads card payments first, opens no editor, says it is already scheduled, and the panel refreshes to "Scheduled 20 Oct" | As expected (`12b-desktop-stale-open.png`). The prefilled earliest date is also clamped so it never passes `window_end` |
| 19 | Card B terms paying from Account Y, Account Y deleted, open Terms (R-W4) | "The account these terms paid from is deleted." (Card D's closed account still says "closed") | As expected (`14b-desktop-terms-deleted-account.png`, `14-desktop-terms-closed-account.png`) |

### PR #351 review: suggested amount for a carried statement

Card E, synthetic: 500.00 charged before the 3 Sep statement, then 20.00 paid on 10 Sep, below the 50.00 minimum. Its terms are backdated so the due date falls after setup. The API shows Oct `statement_balance` 480000, coverage `overdue` (since 28 Sep, `paid_amount` 0) and `previous_unpaid.statement_balance` 500000 (`api-10-card-e-carried.json`).

| # | Step | Expected | Observed |
|---|---|---|---|
| 20 | Card E Schedule… | Amount -480 (the current statement balance less payments in this window), not -500 | -480 (`13b-desktop-carried-partial-prefill.png`) |

Every check in `browser-log.txt` reads PASS (50 checks); there were no page errors. `bun run verify:worker` exit 0; `bun test` 751 pass, 0 fail.

## Notes

- The amounts show the plan's currency symbol (`$` in the demo plan); a Singapore-dollar plan shows `S$`.
- Not driven here: the "Reminders off" row for disabled terms, the fixed-amount and minimum rules feeding Schedule…, Remove reminders, and a `paid` row. They use the same routes the run exercised.
- No web notifications and no Paid button, by design (decision 7).
