# Rewards web: Skyline stacked board

- Revision: `a87a307` (branch `claude/project-thread-ubyyr9`). The run used the working tree that became this commit; the web files are identical.
- Working tree (web, review round 3): `apps/web/src/pages/Rewards.tsx`, `apps/web/src/pages/rewards-board.css`, `apps/web/src/api/types.ts` (the card's `subcategories`), `apps/web/src/lib/reward-row-projection.ts`, `apps/web/src/lib/rewards-tile.test.ts` (one test added), `docs/frontend/rewards-exposure-card.md`, `.cursor/skills/verify-howmuch/features/rewards.md`, and this folder (fixture cases, `sweep.mjs`, screenshots).
- Stack: `control-howmuch cleanup`, `launch` and `doctor` (all ok), one fresh disposable stack, demo ledger seeded.
- Fixtures (synthetic): `fixtures/rewards-tracker-export.json` (the recipe's Travel Card, imported through Settings > Rewards import), `fixture-skyline.json` here (the mockups' six cards plus Monthly Gate 5555, a $400.00 monthly minimum over May to July; Long Figures 1111, a $12,345.67 minimum and $23,456.78 cap at 40 mi/$; Missed Month 2222, a $9,000.00 minimum and a $1,000.00 monthly minimum from 1 April whose April was missed; all on the demo Travel Card account; Minimum Met 1357 has ONLINEX, capped at $50.00, and Dining, excluded from rewards), and `../rewards-stacked/fixture-longflag.json` (long card and category names). Those two are imported with `POST /api/import/rewards-tracker` and `authorization: Bearer howmuch-verify-bootstrap`.

## Commands run, in order, and results

| Command | Result |
| --- | --- |
| `bun run typecheck` in `apps/web` | pass |
| `bun test apps/web` | 309 pass, 0 fail |
| `.cursor/skills/verify-howmuch/bin/control-howmuch cleanup`, then `launch`, then `doctor` | ready; health, auth status and web title ok |
| `node .amp/in/artifacts/rewards-skyline/recipe.mjs > .amp/in/artifacts/rewards-skyline/recipe/run.txt` (from the repo root) | 60/60 checks pass: `recipe/checks.json`, `recipe/run.txt` |
| `node sweep.mjs` (in this folder) | every 2px from 1000 to 1300px, name and Manual order: 0 overprinted or overflowing figures; Period dropped 1000 to 1132px (name order), 1000 to 1200px and 1280px (Manual); dark open card faint ink `rgb(170, 164, 155)` on `rgb(50, 49, 42)`: `sweep.json` |
| `PREFIX=widths WIDTHS=1000,1016,1100,1122 MODES=light node shoot.mjs . fixture-skyline.json 'Missed Month 2222'` | 4 screenshots: `widths-layout.json` |
| `PREFIX=widths-manual WIDTHS=1000,1050 MODES=light PREFS='{"order":"manual"}' node shoot.mjs . fixture-skyline.json 'Long Figures 1111'` | 2 screenshots: `widths-manual-layout.json` |
| `node shoot.mjs` | 8 screenshots, no page errors, no horizontal scroll: `layout.json` |
| `PREFIX=manual WIDTHS=1100,1440 PREFS='{"order":"manual"}' node shoot.mjs . fixture-skyline.json 'Monthly Gate 5555'` | 4 screenshots: `manual-layout.json` |
| `PREFIX=hidden-until WIDTHS=390,1100,1440 PREFS='{"showHidden":true,"hiddenUntil":{"c-cap":"2026-12-01","c-gate87":"2026-12-01"}}' node shoot.mjs . fixture-skyline.json 'Headroom Cashback 1234'` | 6 screenshots: `hidden-until-layout.json` |
| `PREFIX=hidden-until-manual WIDTHS=390 MODES=light PREFS='{"order":"manual","showHidden":true,"hiddenUntil":{"c-cap":"2026-12-01","c-gate87":"2026-12-01"}}' node shoot.mjs . fixture-skyline.json 'Headroom Cashback 1234'` | 1 screenshot: `hidden-until-manual-layout.json` |
| `PREFIX=selected-open WIDTHS=390,1100 MODES=light SELECT=1 node shoot.mjs . fixture-skyline.json 'Minimum Met 1357'` | 2 screenshots: `selected-open-layout.json` |
| `WIDTHS=390,1000,1280 MODES=light node shoot.mjs longname ../rewards-stacked/fixture-longflag.json "Longname Mine 0000 ♻️ U"` | 3 screenshots in `longname/` |
| `bun run build` in `apps/web` | pass |

There is no lint script in the repo.

`recipe.mjs` runs `.cursor/skills/verify-howmuch/features/rewards.md` end to end at 1440 × 900 and 390 × 844 with reduced motion: empty page, UI import, the Travel Card as of 24 May 2026 (stage rest, size noon, 360px window, columns Spent $315.50, Minimum $200.00, Bonus cap none, Earned 1,033 mi, Period 24 of 31 days), the toggle opened with Enter and closed with Space (folded slip `visibility: hidden` and `inert`, open card `rgb(235, 235, 230)`), the slip's period (`as of · 24`, never `today` on a past day), rail, targets and categories, **Totals, qualifications and tiers** holding `Full-period minimum met`, **View transactions** to `/transactions?accounts=acct-credit&range=all` and the register opening there; **Historical range** 10 to 24 May (columns Spent in range, Earned in range and Period `range`; no rail; Targets and Categories from the May period: `$315.50 spent` against the row's `$86.60`, `recipe/range-open-1440.png`); Tab from the open toggle to **Actions for Travel Card**; the rail's start and end dates hidden under the bead label on 1 and 31 May at 820 and 1440; the phone strip opening in place, Grid and back, **Manual** order with the actions' box clear of the headline's box at 1100 and 1440, Payee grouping (Candlenut), the card menu, batch edit (HTTP read shows `earningRate` 1.5, `recipe/report.json`), Hide until next period with the `Back` badge's box clear of the name's box and the window and ledger both dimmed at 1100 and 1440, and Unhide.

## Screenshots

- `skyline-{390,820,1100,1440}-{light,dark}.png`: Minimum Met 1357 open. Row heights (`layout.json`): at 1100 and 1440, gate 176, climb 116, noon 84; at 390, gate 154 (Monthly Gate 171, its longer action wraps), climb 116, noon 72 to 87.
- `manual-{1100,1440}-{light,dark}.png`: Manual order, Monthly Gate 5555 open (Minimum `$400.00/mo`, target `This month $400.00 · $84.50 to go`). The move buttons and menu sit clear of "Resets in 8 days" and "8 days left". At 1100 the reserved room takes the ledger under 400px, so Period drops there, as it does on any narrow ledger.
- `hidden-until-{390,1100,1440}-{light,dark}.png`: Gate Eighty 8787 and Headroom Cashback 1234 hidden until 1 Dec 2026 and shown; Headroom open. The badge sits 12px from the window's right edge and the name wraps short of it.
- `widths-{1000,1016,1100,1122}-light.png`: the narrow wide band with Long Figures 1111 and Missed Month 2222 open (no amber after the missed month: "$8,195.60 short, a month was missed", This month "$684.50 to go"); no figure overprints.
- `widths-manual-{1000,1050}-light.png`: Manual order with Long Figures 1111 open; at 1000px the columns wrap to a second line rather than overprint.
- `hidden-until-manual-390-light.png`: Manual order on a phone; the `Back` badge sits left of the move buttons and menu, the name wraps short of it.
- `selected-open-{390,1100}-light.png`: select mode with Minimum Met 1357 open and selected: the ring wraps the strip (or window and ledger) and the slip.
- `longname/`: a two-line name in the window and a long category name.
- `recipe/`: the recipe's proofs (`empty.png`, `range-open-1440.png`, `travel-card-open-1440.png`, `travel-card-390.png`, `group-payee.png`, `card-menu.png`, `select.png`).

Every screenshot was looked at.

## Review round 1 fixes

1. Manual order: the ledger reserves 116px (not 48px) when the move buttons are present.
2. Monthly minimum: the Minimum column shows the month's minimum with `/mo`; Targets adds "This month" from the active `monthly_qualifications` entry.
3. The hidden-until badge sits `right: 12px` in the wide window and the name's width stops 108px short of the right edge when a badge is present.
4. Hidden wide rows dim the ledger too; the selection ring and the update pulse wrap the whole card.
5. Targets round amounts to go up to the cent; Next tier needs its threshold above the spend.
6. The pace rounds up to the cent (unit assertion: $0.03 over 8 days reads $0.01).
7. The window foot's account name is a span that ellipsises.
8. Period reads "range" only on range rows, otherwise "ended" or "none".
9. The rail's met day needs `minimum_spend_met`.
10. The spec's gate band is 12px deeper, not 46px.

## Review round 2 fixes

1. Historical range: `SkylineRow` takes `range`; a range row has no period (Period reads "range", no rail), and its slip's Targets and Categories read the cutoff period's own calculation, labelled "For the latest card period" and "in the latest card period". Unit test in `rewards-tile.test.ts` ($500 minimum, $350 in May, $100 in the range: "150.00 to go", not 400.00) and a recipe step.
2. Minimum reached but not met: a dashed mark in secondary ink with "reached, needs this month's minimum", "reached, a month was missed" or "reached" (iOS's strings). Cap "beyond" needs half a cent.
3. `beyondCap()` in `reward-row-projection.ts` (half-cent threshold) feeds the projection's capped `beyond`, the Cap target and the categories.
4. The rail measures its labels and hides the start or end date whenever the today label would touch it, at any width.
5. The selection ring and update pulse wrap the stacked card at every width, so an open card keeps its ring.
6. The card's actions render between the row and the slip, so Tab reaches them first.
7. The spoken value adds "$X beyond cap" after the basis on capped rows, as iOS.
8. The `pacePerDay` comment says it rounds up.
9. The spec notes iOS's 26pt phone climb sky against the web's 34px band.

## Review round 3 fixes

1. Failed qualification: This month reads "missed" with a struck mark when its month failed; once `qualification_status` is failed, Minimum reads "reached, a month was missed" or "$X short, a month was missed" (dashed mark) and a pending month keeps "$X to go", all without amber (iOS's strings).
2. The open-surface faint ink is set on the whole open card, so the wide columns' labels and "none" read `#AAA49B` on `#32312A`.
3. Range rows' columns are Spent in range, Earned in range and Period (`range`); the minimum and cap stay in the slip under the latest period. Recipe check added.
4. The update pulse is listed after the entry animation (both with their own delays), so the entry never replays.
5. Wide columns are a wrapping flex row with `min-width: max-content`: no overprinting at any width (sweep), Period from a 440px ledger. Long-figure fixture case and `widths-*` screenshots added.
6. The row's "over cap" chip uses `beyondCap`.
7. Below 1000px with Manual order the badge sits 116px in, left of the buttons; the name stops short of any badge.
8. Excluded categories (from `card.subcategories[].excludeFromRewards`) read "Excluded from rewards", an empty bar and rate "none", sorted after the earning ones.
9. The rail bead says "today" only on the live date, otherwise "as of".
