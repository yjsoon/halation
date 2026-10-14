# ExposureFace: drop the exhaustive-deps suppressions

Revision: base `2047fff` (origin/main) plus this commit. Fixture: `control-howmuch launch` stack, synthetic
`fixtures/demo-ledger.json`, owner `verifier`, `fixtures/rewards-tracker-export.json` imported.

Steps (`exposure-face.mjs <web_url> <repo> <out> <label>`, run as `before` on origin/main's file, then `after`):
1. Sign in, import the Rewards export, open `/rewards?to=2026-05-24` at 1440x1000 and 390x844.
2. Record the settled `svg.rw-scene` markup (ids normalised) after: first showing, Previous day, Next day,
   viewport resize (ResizeObserver redraw), `html[data-mode=dark]` and back.

Expected: scene markup identical before and after in every state. Observed: `before.json` and `after.json`
are byte-identical (`cmp`), card stage `rest`, no page errors beyond two pre-login 401s. Screenshots:
`before-*.png`, `after-*.png`. Limit: the demo card's scene does not move between 23 and 24 May, so the
glide path is exercised but not visibly distinguished.
Also: `bun run --cwd apps/web typecheck` clean, `bun test apps/web` 413 pass.
