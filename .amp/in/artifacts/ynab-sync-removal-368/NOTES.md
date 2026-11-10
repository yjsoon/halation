# #368: quick entry after removing the YNAB transition lock and sync

- Revision: origin/main 0a989b2f plus the #368 working-tree change (lock, cron branch, both sync runners and their tests removed).
- Recipe: `.cursor/skills/verify-howmuch/features/quick-entry.md`, `quick-spend`, `quick-recent` and `quick-register`.
- Stack: `control-howmuch launch` (local Bun/SQLite, seeded `fixtures/demo-ledger.json`). The launch command no longer sets `HOWMUCH_TRANSITION_READ_ONLY`. `doctor` reported `ok health={"ok":true}` and `ok web_title=Halation`, so the server starts without the interval-sync start-up code.
- Setup: owner `verifier` created through `POST /api/auth/setup` with the disposable bootstrap token, then signed in through the web sign-in form.

## Steps and results

1. Opened `/add`. Title `Quick entry · Halation`, `Save spend` disabled while empty.
2. Amount `6.80`, Payee `Toast Box Verify`, Account `Everyday Account`, Date `Today`, Memo `verify quick entry`. Chose `Save spend`.
   - Observed: `Saved.` / `Toast Box Verify saved.`, and `Saved this session` lists `Toast Box Verify`, 10 Nov 2026, −$6.80 ([quick-entry-saved.png](quick-entry-saved.png)).
3. Opened `/transactions?range=all&accounts=acct-everyday`.
   - Observed: first row 10 Nov 2026, `Toast Box Verify`, $6.80 outflow ([register.png](register.png)).
4. `control-howmuch http GET "/v1/plans/local-plan/transactions?since_date=2026-11-10&until_date=2026-11-10"`.
   - Observed: `payee_name` `Toast Box Verify`, `amount` `-6800`, `account_id` `acct-everyday` ([transaction.json](transaction.json)).

Outcome: pass. A financial write that the transition lock used to cover is stored and served normally.
