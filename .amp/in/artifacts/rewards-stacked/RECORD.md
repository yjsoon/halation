# Rewards board: stacked full-width layout

- Revision: the commit this folder lands in (branch `claude/project-thread-ubyyr9`), against `main` at 73e6731.
- Stack: `control-howmuch launch` (disposable Bun/SQLite stack seeded with `fixtures/demo-ledger.json`), owner `verifier` created through `POST /api/auth/setup`.
- Fixture: `.amp/in/artifacts/rewards-urgency/fixture.json` (nine synthetic cards on `acct-credit`), imported through `POST /api/import/rewards-tracker`.
- Steps: Playwright (headless Chromium, 1280 × 900 at 2x, reduced motion) signs in, opens `/rewards?to=2026-05-24`, screenshots `.rw-board` in light and dark, opens the second card's disclosure, opens **Arrange**, picks **Grid**, reloads; then 390 × 844 for the phone board.
- Expected: on desktop each card is one full-width strip per row (name and "TRAVEL CARD · SAMPLE · CASHBACK" on the sky, headline, deadline and basis on the ground, the closed disclosure at the end of the basis line); opened, the disclosure drops below the band as the paper slip; Arrange shows Layout with Stacked selected; Grid brings back the 3:2 faces (9 `.rw-face[data-variant="face"]`) and survives a reload (`layout: "grid"` in `localStorage["howmuch:rewards:local-plan"]`); the phone board is unchanged.
- Observed: as expected (`stacked-light.png`, `stacked-dark.png`, `stacked-open.png`, `arrange-layout.png`, `phone-unchanged.png`; Grid: 9 faces before and after reload).
- `bun test apps/web` (308 pass) and `bun run build` in `apps/web` (typecheck included) pass. Web only; iOS is unchanged.
