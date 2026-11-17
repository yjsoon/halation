# VR-02: Income v spending drill-down keeps uncategorised inflows

- Base: this round's branch after VR-01; disposable local stack, synthetic data only.
- Fixture: 2026-11-11 Everyday +17.00 "Review Uncat Income" and 2026-11-12 Everyday -5.00 "Review Uncat Spend", both uncategorised (plus earlier uncategorised spending in the stack).
- Report: `GET /api/reports/income-vs-spending?from=2026-11-01&to=2026-11-17&category_ids=uncategorised` -> income 17000, spending 23760, net -6760.
- Register: `/transactions?from=2026-11-01&to=2026-11-17&accounts=all&categories=uncategorised&flow=activity`
  - Before (and after VR-01 alone): "4 transactions · $0.00 in · $23.76 out · −$23.76 net".
  - After, 1440 and 390: "5 transactions · $17.00 in · $23.76 out · −$6.76 net". Scope note "Uncategorised transfers not shown".
- Unchanged: the Uncategorised list without a flow stays "Outflows only" ("$0.00 in · $23.76 out"); October `flow=activity` stays "$1,015.00 in · $60.00 out · +$955.00 net".
