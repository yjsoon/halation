# Insights hill climb verification

6 November 2026. Synthetic local ledger only, following Rewards `8a65fa1ae9ea9d4d6a9de46d4042e50ba75062d9`. No deployment or financial calculation changes.

## Retained design and panel

The four reports keep complete comparison tables. Narrow views prioritise Category/Amount, Income/Spending, Net worth/Delta and Age/Spending matched. Other columns remain keyboard-scrollable with a fixed first column/header, a continuation hint and a trailing fade that disappears at the endpoint. Tables that fit have neither hint nor fade. Desktop Net worth retains account-first ordering.

Charts measure their rendered width, so axes and marks remain readable at 320px rather than shrinking a desktop SVG. Net worth uses an unfilled stepped line and a padded value range with an explicit zero-exclusion or zero-inclusion note. Single points do not invent a trend; zero-only ticks remain distinct. Null and zero changes use neutral ink. Presets wrap; controls follow Add/register styling.

Sol preferred A's Income/Spending order and B's narrow Net worth-first order. Opus exposed two substantive C defects: the Money age column sliver and flat zero-based Net worth area. The final assembled design resolves both. Sol, Opus, Sonnet and Astra score the expanded final scope 8 overall; Fable scores 7, also its score for the supplied brand references. All recommend no further material round. Baselines score 5 to 6.5 depending on judge. Scores are subjective weakest-state judgements, not accessibility measurements.

Remaining minor disagreements: sparse single-point chart, green series colour during a decline, missing outer reference tick, small-category bar slivers, orphan All preset at390, and collapsed-table rule fragments under the sticky column. Sonnet withdrew its initial claim that columns were missing after recognising the scrolled state. Fable's weekly-label question was checked: SQLite `%Y-W%W` labels 1 March 2026 W08; the API contains ten non-empty weekly buckets ending W20. The chart thins that same sequence; the table reverses it. The two empty presentations distinguish absent periods from a retained null measurement.

## Repeatable setup and executed flows

Use the demo seed in disposable SQLite `/tmp/howmuch-hill/ledger.sqlite`, synthetic owner `verifier`, plan `local-plan`. Supervised API4174 and web4173 use `HOWMUCH_DB_PATH` for that disposable database, `HOWMUCH_TRANSITION_READ_ONLY=false`, and `HOWMUCH_API_URL=http://127.0.0.1:4174`. Use a disposable local credential, never production data. Earlier E2E transactions exist outside the historical period: use `from=2026-03-01&to=2026-05-31&accounts=all&interval=month` for comparison.

Follow the spending-breakdown, income-v-spending, net-worth and age-of-money recipes under `.cursor/skills/verify-howmuch/features/`. Browser commands use the restored `hill` agent-browser session, scale2, and wait for `.ledger-table` or the specific empty message. Wait for chart arrival and two animation frames after resizing. Screenshots are Chromium width emulation, not physical phones or Safari.

The scratch browser harness `node .amp/in/verify-insights.mjs` passed58 checks. It is an iteration tool; repeatable interactions and independent expected values are recorded here and in the recipes. Results/API payloads are in `insights-checks.json`.

1. Open each historical report at320. Confirm document width fits, table has its named region and tabindex0, newest period is May2026, and initially visible primary figures fit. Spending3292.30 includes Groceries357.10; Income16970 and Net13677.70; Net worth554677.70; Money age67days and matched3292.30. Independently fetched `/api/reports/{spending-breakdown,income-vs-spending,net-worth,age-of-money}?plan_id=local-plan&from=2026-03-01&to=2026-05-31` matches.
2. Focus each table and press ArrowRight repeatedly. Scroll position increases, first-column left edge stays pinned within3px, and hit-testing the first header still returns that header. Reach the right endpoint: fade disappears and final value is visible. Return left.
3. Open Filters. All seven presets fit320. Close, focus trigger and press Enter: the exact dates survive. Choose Last month and All. Income/Spending empty correctly; Money age retains a null row with dash and no chart; Net worth carries balances through the inactive month. Reintroduced charts measure current CSS width rather than stale desktop dimensions.
4. Switch Month→Week→Month. Visible labels do not overlap. Resize320→1440: SVG coordinate width matches rendered width and chart height remains240px. Desktop Net worth account columns still precede totals.
5. Spending→Groceries opens the register retaining category and historical dates; FairPrice Finest is visible. No report calculation or persisted financial write was changed by this round.
6. Negative Net worth: Travel Card scope shows signed red balances and negative axis ticks. Single-snapshot savings scope shows one finite point and distinct nearby ticks. Weekly Income shows ten non-empty periods; null Money age October has no invented zero-day line. Final pack contains both themes.
7. Zero-only setup: insert disposable account `hill-zero-only`, plan `local-plan`, name `Demo Zero Account`, all balance defaults0. Open March–May Net worth scoped to it. Ticks are −1.0/−0.5/0.0/0.5/1.0, all three points lie on0, note says Value axis includes zero, all zero values are neutral. `data-scrollable` is absent and hint display is none. Remove the disposable account after capture. Final zero/null captures replace earlier green-edge states.

Native date input automation did not drive the browser segments reliably. This run uses real preset controls and explicit historical URLs; manual native date typing is not claimed as passing evidence.

## Visual and interaction evidence

Final ordinary captures cover all four reports at1440/390/320 in light/dark, open filters and empty Spending. Additional captures cover weekly Income, negative/single-snapshot Net worth, null Money age and scrolled tables. Panel inspected42 states plus baseline and brand references. Final zero-only pair is supplemental. Latest zero/null refinements were inspected separately in both themes.

`insights-final-interaction.mp4` shows real pointer movement across neighbouring range controls and filter open/close. `insights-table-scroll.mp4` shows keyboard right/left scrolling while Period and its header remain fixed. Both were inspected at5fps; the earlier C interaction clip is superseded and is not delivery evidence. Stills and recordings do not independently prove calculations, persistence, accessibility compliance or touch behaviour.

## Checks and delivery

- Browser/API harness:58 checks passed after final semantic refinements.
- Production web build and typecheck pass.
- `git diff --check`: clean.
- Rebased on current `origin/main` at `8a65fa1ae9ea9d4d6a9de46d4042e50ba75062d9`. Application commit `b470dffe` passed `bun run check`:815 pass,0 fail,76083 assertions, web/worker typechecks, `check: pass`. Browser/API rerun:58 checks passed. Production build passed. This evidence-only amendment does not alter the verified application tree.
- Delivery SHA is reported in the thread after remote confirmation. This record is committed with the implementation and selected synthetic screenshots, API results and recordings.
