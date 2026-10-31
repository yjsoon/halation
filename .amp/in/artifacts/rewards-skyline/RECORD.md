# Rewards web: Skyline stacked board

- Revision: `da134d408c6dcdc8febe3d9806d3b6d15d728031` (`git rev-parse HEAD`, branch `claude/project-thread-ubyyr9`) plus the web working tree (uncommitted): `apps/web/src/pages/Rewards.tsx`, `apps/web/src/pages/rewards-board.css`, `apps/web/src/styles/tokens.css`, `apps/web/src/lib/reward-exposure-scene.ts`, `apps/web/src/lib/reward-row-projection.ts` (and its test's spoken-value expectation), new `apps/web/src/lib/reward-skyline.ts`, the spec and the rewards recipe.
- Stack: `control-howmuch launch` and `doctor` (7 ok lines), a fresh disposable stack per recipe run, demo ledger seeded.
- Fixtures (synthetic): `fixtures/rewards-tracker-export.json` (the recipe's Travel Card, imported through Settings > Rewards import), `fixture-skyline.json` here (the mockups' six cards on the demo Travel Card account; Minimum Met 1357 has ONLINEX, capped at $50.00, and Dining), and `../rewards-stacked/fixture-longflag.json` (long card and category names). Those two are imported with `POST /api/import/rewards-tracker` and `authorization: Bearer howmuch-verify-bootstrap`.

## Commands and results

| Command | Result |
| --- | --- |
| `bun run typecheck` and `bun run build` in `apps/web` | pass |
| `bun test apps/web` | 307 pass, 0 fail (one expectation updated: the spoken value now carries "About $25.00 a day to make it", as iOS speaks it) |
| `node .amp/in/artifacts/rewards-skyline/recipe.mjs` (fresh stack) | 42/42 checks pass: `recipe/checks.json`, `recipe/run.log` |
| `node .amp/in/artifacts/rewards-skyline/shoot.mjs` | 8 screenshots, no page errors, no horizontal scroll at any width: `layout.json` |
| `WIDTHS=390,1000,1280 MODES=light node shoot.mjs longname ../rewards-stacked/fixture-longflag.json "Longname Mine 0000 ♻️ U"` | 3 screenshots in `longname/` |

`recipe.mjs` runs `.cursor/skills/verify-howmuch/features/rewards.md` end to end at 1440 × 900 and 390 × 844 with reduced motion: empty page, UI import, the Travel Card as of 24 May 2026 (stage rest, size noon, 360px window, columns Spent $315.50, Minimum $200.00, Bonus cap none, Earned 1,033 mi, Period 24 of 31 days), the toggle opened with Enter and closed with Space (folded slip `visibility: hidden` and `inert`, open card `rgb(235, 235, 230)`), the slip's period, rail, targets and categories, **Totals, qualifications and tiers** holding `Full-period minimum met`, **View transactions** to `/transactions?accounts=acct-credit&range=all` and the register opening there, the phone strip opening in place, Grid and back, Payee grouping (Candlenut), the card menu, batch edit (HTTP read shows `earningRate` 1.5, `recipe/report.json`), Hide until next period and Unhide.

## Screenshots (Minimum Met 1357 open)

`skyline-{390,820,1100,1440}-{light,dark}.png`. Measured row heights (`layout.json`): at 1100 and 1440, gate 176, climb 116, noon 84; at 390, gate 154, climb 116, noon 72 to 87 (Capped Card's deadline wraps to a second line; Minimum Met carries its exception line). `longname/` checks a two-line name in the window and a long category name, which puts its figures on their own line. `recipe/` holds the recipe's proofs (`empty.png`, `travel-card-open-1440.png`, `travel-card-390.png`, `group-payee.png`, `card-menu.png`, `select.png`).

Every screenshot was looked at. Fixed on the way: the window not filling its row (the tile's inherited two-row grid), the headline amount touching its label, the masthead's figures squeezing the title beside the sidebar (721 to 1023px), the sky running over the toolbar (now positioned above it), a cut glow, "473 miles" overrunning the Period column (now "473 mi"), and long category names wrapping a word a line on the phone.
