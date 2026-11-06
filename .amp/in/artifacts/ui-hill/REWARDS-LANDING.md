# Rewards hill climb verification

6 November 2026. Synthetic local ledger only. This round follows register landing `53fc515f631944c1b4c3cc6f00728aa4a240cef9`. Rewards is not deployed by this work. Final delivery and rebased checks are recorded below before landing.

## Decisions and visual evidence

A compact working header retains urgent minimum/failed/capped counts and puts valuation and lengthy explanations in a labelled disclosure. Narrow miles/cashback form a secondary row. Grid faces are shallow, equal-width banners; stacked comparisons and detailed timelines remain. Empty setup has a primary action and import route. Menus identify their card. Rounded controls follow the landed Add/register vocabulary.

Expanded selection and historical-range evidence exposed defects absent from the first ordinary-state pack. Batch editing now occupies space above the cards, then sticks below the masthead. Its narrow rows group count/Done, selection controls, property, and value/Apply without clipping. All seven historical presets wrap visibly at 320px. The panel still consumes space; it does not float across the bottom cards.

E clips the decorative marker 6px above the measured grid footer. Gate Eighty, Monthly Gate, Gate Thirty and Long Figures each measured footer top 111px and marker bottom 105px at 1440. No earnings or geometry rules changed. Removing an SVG-wide saturation filter restores the scene's blend with the sky, fixing the pale failed-card background in dark mode. The sky remains desaturated and the existing saturation veil handles the ridges.

F collapses narrow historical filters behind the existing Filters disclosure, retaining the applied summary and Clear filters. Cards are visible in the initial viewport instead of appearing below a permanent configuration panel. The final narrow toolbar aligns wrapped Arrange/Select with the row start.

Final evidence uses `rewards-final-stacked-*.png`, E desktop/grid/detail/menu captures, unchanged C empty setup, and F range/scrolled captures. The retained D scrolled image was stale after E and is withdrawn. Desktop is 1440×1000; narrow is 390/320×844, DPR 2. Chromium width emulation is not physical-phone, Safari or touch validation. Final originals and contact sheets were inspected. Real-pointer recordings `rewards-interaction.mp4`, `rewards-selection.mp4` and `rewards-filters.mp4` were inspected at 5fps. The first two precede only the later decorative fixes and filter disclosure.

## Panel history

Scores are subjective and scoped to supplied evidence. Sol: baseline 6; A/B 7; C ordinary 22-state 8. Supplemental C selection/history evidence changed the expanded score to 6, explicitly preserving the earlier core score. D fixes those defects and receives expanded 8. Opus: baseline 6.5, expanded C 7, D/E 8. E's spot-check confirms the card defects fixed without regressions. Astra and Sonnet score E 7.5, then F's targeted states 8; Fable scores E/F 7, also its score for the supplied brand references. Sol and Opus retain 8 after F. No judge recommends another broad round. F is a narrow-state supplement, not a fresh full-matrix score.

Agreement: the compact header, shallow art, legible card statuses, contextual menus, selection layout and historical disclosure improve the baseline. Disagreements: Sonnet prefers all summary labels above values; Sol accepts the compact secondary row. Sonnet calls dark empty text weak, while Fable measures the heading at 6:1 and body text above 4.5:1. Fable dislikes a final orphan preset and native dark checkbox fill; other judges accept both. Keep visible wrapped presets and native controls rather than replace working semantics or shrink labels. Fable inspected all four final toolbar captures: 320px alignment is corrected without regression, 390px captures are byte-identical to E, narrow spacing rises from 7 to 8 and overall stays 7. It also withdrew the empty-title colour defect, accepting thin-serif antialiasing as the explanation. No further Rewards round is recommended. Full history is preserved in the thread's panel scorecard.

## Repeatable setup

Use the demo seed with disposable SQLite `/tmp/howmuch-hill/ledger.sqlite`, plan `local-plan`, synthetic owner `verifier`, API port 4174 and web port 4173. Start supervised orb services, with `HOWMUCH_DB_PATH` pointing to that disposable database, `HOWMUCH_TRANSITION_READ_ONLY=false`, and web `HOWMUCH_API_URL=http://127.0.0.1:4174`. Bootstrap with a disposable credential; do not use production credentials or data.

Import through `/import/rewards`: upload `.amp/in/artifacts/rewards-skyline/fixture-skyline.json` into `input[aria-label="Rewards Tracker export"]`, choose **Import export**, and wait for **Capped Card 2468**. Clear `localStorage["howmuch:rewards:local-plan"]` between runs. Open `/rewards?to=2026-05-24`. This fixture has nine cards, spend 3241.8, miles 473.25, cashback 11.2325 and reward value 18.33125 at valuation 0.015.

For screenshots, wait for `.rw-card`, set viewport with scale 2, resolve light/dark, and allow the card arrival to settle. Before acting after Arrange, hide or featured changes, wait until `document.documentElement.dataset.vt` is absent. Native select choices also require closing the popup and settling before Apply. Initial scratch failures from missing waits or incorrect accessible selectors were corrected and rerun; the application was not altered to satisfy those harness mistakes.

## Executed recipe and persisted results

Follow `.cursor/skills/verify-howmuch/features/rewards.md` through the real browser, not direct API writes. The 24-check run's results are `rewards-checks.json`.

1. Open valuation with keyboard Enter. Change 0.015→0.02 and press Enter. Independent authenticated GET `/api/reports/rewards?plan_id=local-plan&to=2026-05-24` confirms 0.02 and 20.6975 reward dollars, displayed $20.70. Reload preserves it. Restore 0.015 and $18.33.
2. Open Capped Card details. Timeline, targets and View transactions remain available. Open Capped Card and Gate Eighty menus: each names its card. Escape closes each menu and returns focus to its own trigger.
3. Arrange→Grid persists after reload; return to Stacked. Previous day selects 23 May; Next day restores 24 May. Today disables Next day.
4. Select Capped Card, set Featured, Apply. API confirms only `c-capped` is featured. Featured filter shows exactly that card. Reverse the write; API confirms no featured cards. This covers a persisted write and its filtered result, not only a screenshot.
5. In the inspected selection recording, select Capped Card and Gate Eighty, scroll, set Base earning rate 1.75 and Apply. Count becomes 0; Done removes the panel. Independent API confirms `c-capped` and `c-gate87` both 1.75 in `rewards-batch-persisted.json`. Reimport the original fixture afterwards to restore rates.
6. Hide Capped Card, reload: eight visible cards, totals still $18.33. Show hidden, Unhide, confirm local preference restored. Scope to Everyday Account: empty account explanation and Show all accounts recover all nine cards.
7. Historical range→All retains `mode=range` and All time. Document width does not exceed viewport at 320, 390, 820 or 1440. Both themes and selection/filter states are separately captured.
8. No imported cards: readable setup and Add card/import actions at 1440/390 light/dark. No eligible account: Add an account first at 320 in both themes; Create account navigates to `/accounts/new`. Disposable SQLite account flags were restored afterwards. Clear `howmuch.cache.v1.reference` after direct fixture changes so the browser does not retain the previous reference cache; stale diagnostic images were replaced.
9. Import the standard `fixtures/rewards-tracker-export.json` through the UI. Travel Card shows $315.50 spend and 1,033mi on 24 May. Focus Details and press Enter: expanded period 1 May–31 May and View transactions are present. Choose Payee: Candlenut appears, and independent report GET with `group=payee` matches Candlenut 86.6/346.4mi and MUJI 228.9/686.7mi. Historical All yields $830.80, beginning 11 March 2026. At Singapore today 7 November, Hide Travel Card until next period hides it; Show hidden reveals Back 1 December; Unhide clears the saved hidden-until map. Restore the nine-card fixture through UI import.
10. At 320px, pointer opens historical filters and selects Payee. Closing, keyboard reopening and closing retain `from=2026-05-10`, `to=2026-05-24`, `group=payee`. Final cards and applied summary are visible. The complete real-pointer/keyboard sequence is `rewards-filters.mp4`.

## Checks and delivery

- Pre-landing E `bun run check`: 815 pass, 0 fail, 76083 assertions; web/worker typechecks pass; `check: pass`.
- `bun run --cwd apps/web build`: bundle and typecheck pass.
- Real-browser/API run: 24 checks passed again on final F; standard Travel Card recipe and narrow filter keyboard/pointer checks passed after correcting automation selectors/waits.
- `git diff --check`: clean.
- Rebased on `origin/main` at `53fc515f631944c1b4c3cc6f00728aa4a240cef9`; application tree checked at `9a2281c9` before this evidence-only amendment. `bun run check`: 815 pass, 0 fail, 76083 assertions, both typechecks pass, `check: pass`. Production build passes.
- Rebased real-browser/API rerun: 24 checks passed. First attempts exposed stale Show hidden preferences and a click during the sheet's entrance animation that hit Edit rather than Unhide. Resetting the documented preferences and waiting for finite animations fixed the harness; no application change was made. The successful run confirms persisted hide/unhide, Featured and valuation writes and reversals.
- Evidence and application changes are one round, intended for direct-main delivery. The final amended SHA and remote confirmation are reported in the thread rather than embedded recursively in its own commit.

## Limits

No calculation rules changed. Screenshot scores do not prove accessibility compliance, touch or persistence; the explicit executed flows above establish only their stated behaviour. Native date locale stays browser-controlled. Narrow selection adds about 168px before the cards. Mixed summary typography, historical Period/range wording and two Done exits remain non-blocking trade-offs. No production writes, deployments, signing or build distribution.
