# cssHeadlineRow run record

- Base revision: origin/main 2047fff (before); working tree of this commit (after).
- Fixture: disposable stack from `control-howmuch launch` (HOWMUCH_VERIFY_STATE_ROOT=/tmp/hm-verify-a8f8), seeded demo ledger, owner `verifier`. Synthetic data only.
- Steps: Playwright/Chromium, one login with storage state reused. Ledger, Spending, Income, Net worth, Age of money, Scheduled, Rewards, Settings at 1280x900 and 390x844, light and dark (plus touch variants). For every `.headline-row` the run records display, grid-template-columns, gap and width, and whether it sits inside `.report-header`.
- Expected: at 390 the report headline rows (Spending, Income, Net worth, Age of money, Scheduled) are still a two-column grid with `14px 16px` gap (Scheduled keeps beating `.schedule-figures`); the register balances row and the register toolbar's pill row are not paired.
- Observed: computed-style report identical before and after for all 84 non-census captures (class names excluded from the comparison, since the paired rows gain `headline-row-paired`). Pixel compare: all screenshots equal except Rewards and one Ledger focus capture, which also differ between unchanged baseline runs (animation timing). The pairing selector keeps two-class specificity so `.schedule-figures` at the same breakpoint still loses.
- `bun run --cwd apps/web typecheck`: passes.
