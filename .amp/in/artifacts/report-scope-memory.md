# Report account scope: default all, remember last (web)

- Base revision: f4cd9971 plus uncommitted changes to `apps/web/src/components/Shell.tsx` and `apps/web/src/state/filters.ts`
- Stack: `control-howmuch launch` (disposable SQLite, `fixtures/demo-ledger.json`), first-owner setup as `verifier`
- Browser: agent-browser Chromium, 1440x900 at 2x
- Recipe: `.cursor/skills/verify-howmuch/features/spending-breakdown.md`, sub-feature `report-scope-memory`

## Steps and results

1. Fresh owner, stored view prefs have no `accountIds`. Sidebar Reports hrefs on the Ledger: `/spending`, `/income`, `/net-worth`, `/age-of-money` (no query). Pass.
2. Open the Travel Card register (`/transactions?range=all&accounts=acct-credit`), then Reports > Spending. URL `/spending`; Scope `All accounts`. After choosing All: summary `All time · All accounts · All categories`, total `$3,292.30`. Pass (before the change this link carried `accounts=acct-credit&range=all`).
3. In Spending Scope, tick `Everyday Account`. URL `/spending?range=all&accounts=acct-everyday`; prefs `accountIds: ["acct-everyday"]`.
4. Reload `/spending` with no query. Scope `Everyday Account ▾`; summary `1 Nov 2026 to 30 Nov 2026 · 1 account · All categories`. Pass.
5. Open the Travel Card register, then Reports > Net worth. URL `/net-worth`; Scope `Everyday Account`; summary `17 Nov 2025 to 17 Nov 2026 · 1 account · month intervals`. Pass (shared across reports).
6. Close Everyday Account (`PATCH /v1/plans/local-plan/accounts/acct-everyday {closed:true}` → 200). Reload `/spending`: Scope `All accounts ▾`, summary `... · All accounts · ...`. Load `/age-of-money`: Scope `All accounts ▾`, summary `All time · All accounts · month intervals`. Pass.

## Checks

- `bun run check`: `check: pass` (bun test, web and worker typechecks, iOS web source lints, focus zoom).
