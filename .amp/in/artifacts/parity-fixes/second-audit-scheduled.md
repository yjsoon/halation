# Scheduled second-audit fixes

Base: `9afef689`, branch `scheduled-second-audit`. Local commits only.
Disposable `control-howmuch` run: `20261117T113404-3430`, web port 41155,
API port 55729. Chromium via agent-browser session `parity`, DPR 2.
No production data or services used. No post-implementation unit tests added.

## N-01: keep Scheduled actions visible

Reproduction: at 721 pixels the baseline wrappers were 657 pixels wide with
820 pixels of content. Terms and Delete ended at x=842, outside the viewport.
The same failure affected Enter now and Schedule…. The before capture restores
the original 720-pixel media condition through CSSOM; reloading restores the fix.

Fixtures: the previous round's plain transfer, two-line split schedule and open
transfer, plus a schedule created through the browser. Create its payee in Quick
entry, then choose it in Add schedule: “N01 Long monthly household services and
community activities”, monthly, 25.00, 17 November 2026. Submit with Enter.

Read-back:
`control-howmuch http GET /v1/plans/local-plan/scheduled_transactions`
returned four schedules, including `scheduled_b467cb490848dc950dfd953f` with
that long payee and amount `25000`; `scheduled_2bb4ded17ea004786d89692d` has
two split lines and amount `-20000`. Travel Card has payment terms and a
Payments due row, including Schedule… and Terms.

Fix: only Scheduled and Payments due use their existing card layout through
1000 pixels. The narrow action row can wrap. Other tables and the payment-terms
dialog keep their previous breakpoints.

For each width run `agent-browser --session parity --restore set viewport WIDTH
1000 2`, wait two animation frames, then measure all schedule/payment table
wrappers and every action button's bounding rectangle.

Widths: 320, 390, 721, 760, 800, 890, 900, 1000, 1001, 1024, 1440.
Every width: `hiddenActions: 0`, every wrapper `scrollWidth - clientWidth: 0`.
The long payee wraps and all split rows remain readable. Inspected full-page
captures at 390 and 721, and the desktop capture at 1440: no horizontal overlap.

Neighbour check: `/spending?from=2026-03-01&to=2026-05-31` at 800 pixels.
Switching only the new Scheduled media condition back to 720 through CSSOM
leaves `.ledger-table.breakdown-table` identical: display `table`, minimum
width `640px`, rendered width `736`. Generic table rules were not edited.

Untracked media: `n01-before-721.png`, `n01-after-721.png`,
`n01-after-390.png`, `n01-after-1440.png` in this directory.

## N-05: unavailable schedule count and retry wording

Before: abort only `**/scheduled_transactions*` using agent-browser network
interception. Remove `howmuch.cache.v1.scheduled` from localStorage and reload.
Observed: count `0`, no rows, alert “Could not load scheduled transactions.Failed
to fetch”. This is a transport failure, not a stubbed successful API response.

After, at both 390 and 1440: figures `["-", "-"]`, zero schedule rows, alert
“Could not load scheduled transactions.Failed to fetch Reload to try again.”
The retry sentence is copied from Rewards. Both error captures were inspected.
Remove interception and reload: count `4`, four rows, zero alerts, matching
`control-howmuch http GET /v1/plans/local-plan/scheduled_transactions`.

Saved-list distinction: navigating back with equal cached server knowledge
shows four rows and no error even with the endpoint blocked. The hook skips
the request, so there is no failed refresh to report. Forcing older cached
knowledge (`serverKnowledge: -1` in this disposable browser's scheduled cache)
causes a real request. Aborting it drops all four cached rows and shows the
error with both figures unavailable. This behaviour already exists on the base
in `use-cached-api.ts` and is not changed here.

The saved-list warning half remains open as instructed. No existing sentence
describes an unrefreshed saved list. Candidates checked: Rewards says “Could not
load rewards.” followed by its error and “Reload to try again.”; the register
says “Could not load older transactions.” followed by its error; Account
settings says “Could not load payment reminders.” None says that saved rows
may be out of date. Changing cache revalidation would also cross this page's
ownership boundary. No new warning sentence or shared-cache change was made.
