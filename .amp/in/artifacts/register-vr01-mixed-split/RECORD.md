# VR-01: a Spending drill-down keeps a split whose total is positive

- Base: hillclimb 0e1f6bad plus this round's earlier commits; disposable local stack (control-howmuch), synthetic data only.
- Fixture (POST /v1/plans/local-plan/transactions): 2026-11-10, Everyday Account, +10.00 "Review Mixed Split", split into Groceries -30.00 and Salary +40.00.
- Report: `GET /api/reports/spending-breakdown?from=2026-11-01&to=2026-11-17&category_ids=cat-groceries` -> Groceries 104990 (4 transactions), total 104990.
- Register: `/transactions?from=2026-11-01&to=2026-11-17&accounts=all&categories=cat-groceries&flow=outflow`
  - Before: "3 transactions · $0.00 in · $74.99 out · −$74.99 net" (the mixed split missing; 30.00 short of the report).
  - After, 1440 and 390: "4 transactions · $0.00 in · $104.99 out · −$104.99 net", the Review Mixed Split row listed. Scope note "Outflows only".
- Re-checks that still agree after the change:
  - October Income v spending (`flow=activity`): footer "$1,015.00 in · $60.00 out · +$955.00 net"; API period income 1015000, spending 60000, net 955000.
  - Groceries and Dining Out without a flow, Nov: "$155.49 out", lines only, as before.
  - Uncategorised list (no flow), 1–17 Nov: "$0.00 in · $23.76 out", outflows only as before.
