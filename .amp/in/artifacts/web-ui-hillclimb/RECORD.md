# Web UI hillclimb: lead's integration checks

Text record of the checks the lead thread ran in a browser while integrating the workers' fixes. Each worker's own record sits beside its commits (`parity-fixes/`, `report-fixes/`, `register-*/`). Screenshots are not in git; they are in the thread and the audit artifact.

- Revision: the integrated branch on `origin/main` `b29e5d69`, at the head named beside each check. Final head for this record: the commit that adds it.
- Stack: `control-howmuch launch` (disposable local API and web, SQLite), first owner created in the browser, plan `local-plan`, synthetic accounts Everyday Account, Rainy Day Saver and Travel Card with the repository's synthetic March to May 2026 rows.
- Browser: Chromium through `agent-browser`, device pixel ratio 2, at 1440 x 900 and 390 x 844 unless a width is named.
- Read-back: `control-howmuch http GET /v1/plans/local-plan/transactions/<id>`; amounts are milliunits.

## Fixture added through the UI

1. Quick entry (`/add`), Transfer, 50, dated 10 Oct 2026, Everyday Account to Rainy Day Saver.
2. Quick entry, Spend, 40, dated 10 Oct 2026, Everyday Account, no payee, no category.
3. Quick entry, Spend 10 on 17 Nov 2026 split as 15 out and 5 in ("Lead split check").

## Report and register agree (P-07, VR-01, VR-02, LEAD-04)

- Steps: open `/income?range=all&accounts=all`; read the Oct 2026 row; follow its link; then open the same month without `flow`.
- Expected: the linked Ledger's footer equals the report row and leaves out the transfer between two accounts; the plain month includes both sides of it.
- Observed: report row `Oct 2026 $0.00 $40.00 −$40.00`. Link `/transactions?from=2026-10-01&to=2026-10-31&accounts=all&flow=activity`, footer `1 transaction · $0.00 in · $40.00 out · −$40.00 net`. Plain month: `3 transactions · $50.00 in · $90.00 out · −$40.00 net`. March, April, May and November footers equal their report rows (for example May `$5,700.00 in · $451.80 out · +$5,248.20 net`).
- Filter summary on the linked Ledger at 1440 and 390: `1 Oct 2026 to 31 Oct 2026 · All accounts · All categories · Uncategorised transfers not shown`; a Spending category link ends `Outflows only`; a plain register has neither. No horizontal overflow.
- Clear filters on the linked Ledger removes `flow`.

## Remembered report scope stays in reports (S-05, L-01)

- Steps: set `accountIds: ["acct-credit"]` in `howmuch.view-prefs.v1`; open each page with no query.
- Observed: Spending, Income v spending, Net worth and Money age read `1 account`; `/rewards`, `/transactions` and `/scheduled` open on all accounts. From the Travel Card register the sidebar's Rewards and Scheduled links are `/rewards` and `/scheduled`.

## Report ranges that end today (P-06, VP-05)

- Observed at `9afef689`, 1024 wide: All on Spending gives `/spending?accounts=all&range=all`, summary `To 17 Nov 2026 · All accounts · All categories`, no Clear filters; This month gives `from=2026-11-01` with no `to` and stays highlighted; Last month gives both dates and shows Clear filters.

## Charts (VP-02, VP-03)

- Observed at 1024: Net worth 5 axis labels, smallest gap 83.8 px; Money age and Income 8 labels, smallest gap 45.9 px; none clipped; one tab stop per chart.

## Account switching (L-03, L-04, L-09)

- Steps: Travel Card register, type `Grab` in Search, open Reconcile, choose Rainy Day Saver in the sidebar.
- Observed: heading `Rainy Day Saver`, Reconcile closed, Search empty. An account's own register shows no Clear filters for its account.

## Account settings focus (VR-03) and add row payee (VR-06)

- Steps at 1440 and 390: rename Rainy Day Saver, focus Save, press Enter; rename back and click Save; rename and press Enter in Name.
- Observed: focus on the Name input after all three, at both widths. The add row's Payee has `required=false`; Date keeps `required=true`.

## Editing a posted split (P-03)

- Steps at 1440: Enter on the 40.00 row, `+ Split categories`, line 1 25, line 2 14 Groceries, Save; then 15, Save.
- Observed: with 14, Save is refused with `+$1.00 left to assign.` and the editor stays open; with 15 the status reads `✓ Lines match the total.` and the save reads back `amount -40000, category_id null`, lines `-15000 cat-groceries` and `-25000 null`. Focus returns to the row.
- Steps at 390: Enter on the row, `Use one category`, Groceries, Save.
- Observed: read-back `amount -40000, category_id cat-groceries`, no lines. No horizontal overflow; the Outflow and Inflow control is 120 px wide.

## Duplicate for today on a phone (P-01) and moving a row (P-02, N-06)

- At 390, Duplicate for today on the 40.00 Groceries row opens `/add` with amount `40`, date `2026-11-17`, Everyday Account, Groceries, `Save spend` enabled; after a reload the form is empty.
- At 1440 the Ledger row editor has one Account control. Choosing Travel Card and Save shows `Entry saved to Travel Card.` at the bottom right (toast 837 to 880 px, header balance 49 to 88 px) and reads back `account_id acct-credit`. Moved back afterwards.

## Scheduled (VP-01, N-01)

- A schedule from Everyday Account transferring to Rainy Day Saver reads `Transfer to Rainy Day Saver` and keeps Enter now while both accounts are open.
- With one schedule at 390, 721, 800, 890 and 1001 wide: Enter now, Edit and Delete are inside the viewport and the page does not scroll sideways; at 1001 to 1100 the table wrapper's `clientWidth` equals its `scrollWidth`.
- Deleting the last schedule by keyboard returns focus to Add schedule.

## Rewards (VS-03, VS-04, VS-05, N-11)

- Added a card on Travel Card (earning rate 1) through Add card.
- At 390: Select, then Escape with focus on Done, leaves Select mode with focus on Select.
- In the card editor, Enable flag subcategories and Add flag twice: each row has a `Colour name` field; Save shows `Name the red colour on this card.` in view with focus on `Flag 1 colour name`; no horizontal overflow.
- Changing Issuer and Save card lands on `/rewards` with focus on the `Rewards` heading.

## Reconciled rows (N-02, N-10, LEAD-05)

- Steps at 1440 on Rainy Day Saver: mark `Broker transfer on 15 Mar 2026` cleared; Reconcile; type the cleared balance (421500.00) and press Enter; tick the acknowledgement; Confirm reconciliation. Without reloading, read the row's controls, then Enter on the row, change Inflow to 701 and press Enter.
- Expected: Enter reviews the reconciliation; the row reads Reconciled at once; the change asks first.
- Before LEAD-05 (at the head with N-02): after the same steps on the 24 May row its control still read `Mark Broker transfer on 24 May 2026 uncleared`, and changing 850 to 851 saved with no question (read-back `amount 851000, cleared reconciled`). After a reload the same edit asked.
- After LEAD-05: message `Rainy Day Saver reconciled through 17 Nov 2026. 1 cleared transaction matched $421,500.00.`; the row's controls read `Reconciled` with no reload; the edit shows `Save transaction changes?` with focus on Cancel; Escape closes it, keeps the editor open and returns focus to the Inflow field.
- `bun test apps/web/src/lib/register-rows.test.ts`: the new case failed before the fix (`5 pass, 1 fail`) and passes after (`6 pass, 0 fail`).

## Other second-audit items seen on the way

- N-12: an October Ledger shows no Scheduled group.
- N-15: with one row selected and nothing else open, Escape clears the selection and focuses select-all.
- N-16: two chosen accounts give the title and heading `Selected accounts`.

## Checks

- `scripts/check.sh` at `f9ecdecf`: `check: exit=0: bun test` (`821 pass`, `0 fail`, `Ran 821 tests across 69 files.`), `bun run --cwd apps/web typecheck`, `bun run --cwd apps/worker typecheck` and `bun scripts/verify-ios-focus-zoom.ts` all `exit=0`; `check: pass`.

## Limits

- Chromium only: no Safari, no phone hardware, no software keyboard (see LEAD-03 in the audit).
- The lead re-ran a sample of each worker's flows, not every one; the workers' records hold the rest.
