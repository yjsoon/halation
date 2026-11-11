# Register selection total (web)

Base: `origin/main` at 6e3314fe plus this round. Stack: `control-howmuch launch` on the seeded demo ledger (`fixtures/demo-ledger.json`), owner `verifier` created through the setup form, Ledger at `/transactions?range=all&accounts=all`.

## Steps and results

1. Tick the first six rows: Broker transfer +$850.00, SimplyGo −$17.60, Candlenut −$86.60, Cold Storage −$118.70, MUJI −$228.90, Tinkermind Payroll +$4,850.00.
   Expected: in $5,700.00, out $451.80, net +$5,248.20 (worked by hand).
   Observed at 1440, 1280, 1024 and 390px in light, and 1440px in dark: `Total +$5,248.20 $5,700.00 in · $451.80 out` (`.register-bulk-total` text).
2. Reload and tick SimplyGo and Candlenut only. Expected `Total −$104.20` with no breakdown. Observed `Total −$104.20` (`after-light-1280-outflows-only.png`).
3. Accessibility tree: the total is a `status` inside the `Selected transaction actions` group, so it is announced as the selection changes.
4. At every width, no child of `.register-bulk-bar` ends past the viewport and `document.documentElement.scrollWidth` equals the viewport width, before and after the change. At 1024px the bar wraps to a second line; at 390px the total gets its own row in the phone grid.

`before-*` are the same selection without the change.
