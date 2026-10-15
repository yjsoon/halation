# Rewards strip: urgency at a glance

- Revision: the commit this folder lands in (branch `claude/project-thread-pfhmxn`), against `main` at dac3e38.
- Stack: `control-howmuch launch` (disposable Bun/SQLite stack seeded with `fixtures/demo-ledger.json`), owner `verifier` created through `POST /api/auth/setup`.
- Fixture: `fixture.json` in this folder, nine synthetic cards on `acct-credit` imported through `POST /api/import/rewards-tracker` (names and figures are made up): gate cards at fills 0.30 (miles), 0.63, 0.87 and 0.98, a cap climb, a tier climb with a one-line-too-long name and a category over its cap, a capped card, a met card and a calm miles card. May 2026 spend on the account is $315.50 by the 24th.
- Steps: `render/shoot.mjs` (Playwright, headless Chromium, 390 × 844 at 3x, reduced motion) signs in, opens `/rewards?to=2026-05-24`, sets `html[data-mode]` to light and then dark, and screenshots `.rw-board`. Before on `main`, after on this branch.
- Expected: on the gate cards the half-sun stays on the horizon and the sky right of it stays the unlit blue (dark: the dusk veil) however close the fill is, so the 0.98 card reads like the 0.30 one, not like the cap climb; the figure before "to minimum" in the urgent amber; the long name on one line; the over-cap line on the green ground under the basis line with no paper slip; climb, capped, met and calm cards unchanged apart from the name width.
- Observed: as expected in both modes (`before-after-light.png`, `before-after-dark.png`).
- `bun test apps/web` (310 pass), `bun run build` in `apps/web` (typecheck included) pass on this revision. iOS compiled separately (see the PR).

## Follow-up: amount weight

- YJ found the figure too heavy. The amount is now Medium (iOS `.weight(.medium)`, web `font-weight: 500`); it had been SemiBold, which the web could only synthesise since Plex Mono is loaded in Regular and Medium only.
- Same stack and fixture; `weight-light.png` and `weight-dark.png` show the first three cards at SemiBold (left) and Medium (right).
