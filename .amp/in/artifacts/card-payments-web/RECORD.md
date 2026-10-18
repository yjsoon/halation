# Card payments web: E2E record

Feature: web Payments due panel on `/scheduled`, Schedule… through the existing schedule editor, and the Card payment terms dialog (from the panel, the set-up entry and the card register toolbar).

## Revision

- Base commit `86b96de` (backend: card payment terms and the payments-due view) on branch `claude/project-thread-gnrkc7`, plus the web changes committed alongside this record (`apps/web`).
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

Every check in `browser-log.txt` reads PASS; there were no page errors.

## Notes

- The amounts show the plan's currency symbol (`$` in the demo plan); a Singapore-dollar plan shows `S$`.
- Not driven here: the "Reminders off" row for disabled terms, the fixed-amount and minimum rules feeding Schedule…, and Remove reminders. They use the same routes the run exercised.
- No web notifications and no Paid button, by design (decision 7).
