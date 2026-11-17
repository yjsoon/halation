# P-01 on a phone: Duplicate for today through Quick entry

- Base: hillclimb 0e1f6bad plus the P-02 fixup, disposable local stack (control-howmuch), synthetic data only.
- Fixture: Everyday Account with "Activity Test Grocer" (spend 40.00, Groceries) and an "internal move" transfer of 50.00 from Everyday to Rainy Day Saver.

## Steps and results at 390 x 844

1. Everyday register, focus the Activity Test Grocer row, press Enter. The editor shows Duplicate for today on its own line, then Delete, Cancel, Save on one line (before: no Duplicate for today at 390).
2. Choose Duplicate for today. URL is `/add` (no query); router state is cleared after it is read (`history.state.usr` null).
   Quick entry shows Spend, amount 40, payee Activity Test Grocer, account acct-everyday, category cat-groceries, date 2026-11-17, empty memo.
3. Save spend. "Activity Test Grocer saved." API: `2026-11-17 -40000 Activity Test Grocer cat-groceries acct-everyday uncleared`.
4. Rainy Day Saver register, the 9 Oct "internal move" row (the receiving side, +50.00), Enter, Duplicate for today.
   Quick entry shows Transfer, 50, from acct-everyday to acct-saver, memo "internal move".
5. Save transfer. "Transfer to Rainy Day Saver saved." API: `-50000 acct-everyday -> acct-saver` and the mirror `+50000 acct-saver -> acct-everyday`, both 2026-11-17.
6. 1440: Duplicate for today still opens the add row on the register (URL unchanged, compose row open).
7. A split parent offers no Duplicate for today at 390 or 1440.

Not carried on a phone: Flag and To claim, which Quick entry has no fields for.
