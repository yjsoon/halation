# N-16 (register items): "Selected accounts", Clear filters without interval, toast clear of the balance

- Revision: branch `p-round4` on `hillclimb3` `9afef689`, after N-15.
- Changes:
  - `apps/web/src/components/Shell.tsx:123` and `apps/web/src/pages/Transactions.tsx:210`: "Selected Accounts" becomes "Selected accounts".
  - `apps/web/src/components/FilterRail.tsx` `clearFilters`: sets `interval` only when the page passes `intervals` (one self-contained conditional; the L-09 `accountScopeFixed` condition and `throughToday` are untouched).
  - `apps/web/src/styles/app/tables-charts.css` `.register-toast`: bottom right above 720 pixels instead of top right; the phone rule keeps it under the masthead.
- Not in this commit: the Rewards import note (N-16's fourth item, `RewardsImport.tsx`), which belongs to another worker.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only.
- Script: `.amp/in/orb-backup/n16.sh <width> <tag>` checks Clear filters on an account register and on Net worth, then saves a memo on N07 Bakery to raise the toast and measures it against `.register-balance-hero`, reading the memo back and clearing it. The multi-account heading was read from `/transactions?range=all&accounts=acct-everyday,acct-credit`.

| Check | Before (fix stashed), 1440 | After, 1440 | After, 390 |
|---|---|---|---|
| Multi-account tab title and heading | Selected Accounts · Halation / Selected Accounts | Selected accounts · Halation / Selected accounts | the same as 1440 |
| Clear filters on `?range=all&accounts=acct-everyday&categories=cat-groceries` | `?range=all&accounts=acct-everyday&interval=month` | `?range=all&accounts=acct-everyday` | the same as 1440 |
| Clear filters on Net worth from `?interval=quarter&from=2026-01-01` | `?interval=month&range=all&accounts=all` | `?interval=month&range=all&accounts=all` | the same |
| Toast "N07 Bakery saved." against the header balance | toast 1246,16 to 1420,59 over balance 1150,30 to 1408,146: overlaps | toast 1246,837 to 1420,880: clear of the balance | toast 72 to 115 above balance from 115 (unchanged phone placement, touching but not covering) |

Read back after each save: memo "N16 toast" (then cleared by `PATCH`).

At 1440 the toast now sits over the lowest visible row until it is dismissed or the page scrolls; any fixed toast covers something, and this keeps the header figures readable.
