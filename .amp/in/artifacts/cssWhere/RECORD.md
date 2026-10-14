# cssWhere run record

- Base revision: origin/main 2047fff (before); working tree of this commit (after).
- Fixture: disposable stack from `control-howmuch launch` (HOWMUCH_VERIFY_STATE_ROOT=/tmp/hm-verify-a8f8), seeded demo ledger, owner `verifier`. Synthetic data only.
- Steps: Playwright/Chromium, one login with storage state reused. Viewports 1280x900 and 390x844, light and dark, reduced motion. Coarse runs use touch contexts and serve app.css with `(pointer: coarse)` rewritten to `all` through `page.route`, because Chromium did not honour pointer emulation in this harness. Pages: Ledger, Spending, Income, Net worth, Age of money, Scheduled, Rewards, Settings.
- Expected: computed style of every `.segment, .filter-trigger, .filter-toggle, .text-button, .mobile-actions > *` and of the compose-row controls is identical before and after; coarse still yields min-height 44px where it did before; the compose row stays excluded.
- Observed: report.json (computed display, min-height, align, justify, grid, gap, width, colours, 88 captures) is byte-identical before and after. 214 elements at `min-height: 44px` both before and after. Pixel compare: all screenshots equal except a few Rewards/Ledger captures that also differ between two runs of the unchanged baseline (animation timing), so those are noise.
- `bun run --cwd apps/web typecheck`: passes.
