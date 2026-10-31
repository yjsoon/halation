# Rewards web: Skyline stacked board

- Revision: `6a1b47c` (branch `claude/project-thread-ubyyr9`). The run used the working tree that became this commit; the web files are identical.
- Working tree (web, review round 1): `apps/web/src/pages/Rewards.tsx`, `apps/web/src/pages/rewards-board.css`, `apps/web/src/lib/reward-skyline.ts`, `apps/web/src/lib/reward-row-projection.ts` and its test (one pace assertion added), `docs/frontend/rewards-exposure-card.md`, `.cursor/skills/verify-howmuch/features/rewards.md`, and this folder.
- Stack: `control-howmuch cleanup`, `launch` and `doctor` (all ok), one fresh disposable stack, demo ledger seeded.
- Fixtures (synthetic): `fixtures/rewards-tracker-export.json` (the recipe's Travel Card, imported through Settings > Rewards import), `fixture-skyline.json` here (the mockups' six cards plus Monthly Gate 5555, a $400.00 monthly minimum over May to July, all on the demo Travel Card account; Minimum Met 1357 has ONLINEX, capped at $50.00, and Dining), and `../rewards-stacked/fixture-longflag.json` (long card and category names). Those two are imported with `POST /api/import/rewards-tracker` and `authorization: Bearer howmuch-verify-bootstrap`.

## Commands run, in order, and results

| Command | Result |
| --- | --- |
| `bun run typecheck` in `apps/web` | pass |
| `bun test apps/web` | 307 pass, 0 fail |
| `.cursor/skills/verify-howmuch/bin/control-howmuch cleanup`, then `launch`, then `doctor` | ready; health, auth status and web title ok |
| `node .amp/in/artifacts/rewards-skyline/recipe.mjs > .amp/in/artifacts/rewards-skyline/recipe/run.txt` (from the repo root) | 48/48 checks pass: `recipe/checks.json`, `recipe/run.txt` |
| `node shoot.mjs` (in this folder) | 8 screenshots, no page errors, no horizontal scroll: `layout.json` |
| `PREFIX=manual WIDTHS=1100,1440 PREFS='{"order":"manual"}' node shoot.mjs . fixture-skyline.json 'Monthly Gate 5555'` | 4 screenshots: `manual-layout.json` |
| `PREFIX=hidden-until WIDTHS=1100,1440 PREFS='{"showHidden":true,"hiddenUntil":{"c-cap":"2026-12-01","c-gate87":"2026-12-01"}}' node shoot.mjs . fixture-skyline.json 'Headroom Cashback 1234'` | 4 screenshots: `hidden-until-layout.json` |
| `WIDTHS=390,1000,1280 MODES=light node shoot.mjs longname ../rewards-stacked/fixture-longflag.json "Longname Mine 0000 ♻️ U"` | 3 screenshots in `longname/` |
| `bun run build` in `apps/web` | pass |

There is no lint script in the repo.

`recipe.mjs` runs `.cursor/skills/verify-howmuch/features/rewards.md` end to end at 1440 × 900 and 390 × 844 with reduced motion: empty page, UI import, the Travel Card as of 24 May 2026 (stage rest, size noon, 360px window, columns Spent $315.50, Minimum $200.00, Bonus cap none, Earned 1,033 mi, Period 24 of 31 days), the toggle opened with Enter and closed with Space (folded slip `visibility: hidden` and `inert`, open card `rgb(235, 235, 230)`), the slip's period, rail, targets and categories, **Totals, qualifications and tiers** holding `Full-period minimum met`, **View transactions** to `/transactions?accounts=acct-credit&range=all` and the register opening there, the phone strip opening in place, Grid and back, **Manual** order with the actions' box clear of the headline's box at 1100 and 1440, Payee grouping (Candlenut), the card menu, batch edit (HTTP read shows `earningRate` 1.5, `recipe/report.json`), Hide until next period with the `Back` badge's box clear of the name's box and the window and ledger both dimmed at 1100 and 1440, and Unhide.

## Screenshots

- `skyline-{390,820,1100,1440}-{light,dark}.png`: Minimum Met 1357 open. Row heights (`layout.json`): at 1100 and 1440, gate 176, climb 116, noon 84; at 390, gate 154 (Monthly Gate 171, its longer action wraps), climb 116, noon 72 to 87.
- `manual-{1100,1440}-{light,dark}.png`: Manual order, Monthly Gate 5555 open (Minimum `$400.00/mo`, target `This month $400.00 · $84.50 to go`). The move buttons and menu sit clear of "Resets in 8 days" and "8 days left". At 1100 the reserved room takes the ledger under 400px, so Period drops there, as it does on any narrow ledger.
- `hidden-until-{1100,1440}-{light,dark}.png`: Gate Eighty 8787 and Headroom Cashback 1234 hidden until 1 Dec 2026 and shown; Headroom open. The badge sits 12px from the window's right edge and the name wraps short of it.
- `longname/`: a two-line name in the window and a long category name.
- `recipe/`: the recipe's proofs (`empty.png`, `travel-card-open-1440.png`, `travel-card-390.png`, `group-payee.png`, `card-menu.png`, `select.png`).

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
