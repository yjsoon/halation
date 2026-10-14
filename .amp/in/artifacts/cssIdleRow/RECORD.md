# cssIdleRow run record

- Base revision: origin/main 2047fff (before); working tree of this commit (after).
- Fixture: disposable stack from `control-howmuch launch` (HOWMUCH_VERIFY_STATE_ROOT=/tmp/hm-verify-a8f8), seeded demo ledger, owner `verifier`. Synthetic data only.
- Steps: Playwright/Chromium, one login with storage state reused. Ledger at `/transactions?range=all&accounts=all`, 1280x900 and 390x844, light and dark. Per run: hover idle row 2 (desktop only), keyboard focus (Shift pressed first so :focus-visible matches), tick the row's select checkbox. Also screenshots of Spending, Income, Net worth, Age of money, Scheduled, Rewards, Settings.
- Expected: row outline, td background and first-cell inset shadow identical in hover, focus and checked states; idle rows carry `register-row-idle` (18 of 18 rows on the fixture); selector specificity is unchanged (class replaces the attribute).
- Observed: report.json (computed outline and per-cell background and box-shadow for each state, plus all headline and touch captures) identical before and after. Ledger screenshots, including the three row states, are byte-identical. Only Rewards captures differ, and those also differ between two unchanged baseline runs (animation timing). The deep-link targeted row was not exercised; its rules are untouched and it keeps the `:not(.register-row-targeted)` exclusion.
- `bun run --cwd apps/web typecheck`: passes.
