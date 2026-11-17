# VR-05: a moved row offers the new account's flag names

- Revision: branch `p-round3` on `hillclimb` `0e1f6bad`, change in `apps/web/src/pages/Transactions.tsx` (`flagAccountId`).
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only.
- Fixture (API):
  - `POST /api/rewards/cards` card `card-vr05-everyday` on `acct-everyday`, `flagNames {red: Fuel, blue: Bills}`.
  - `POST /api/rewards/cards` card `card-vr05-travel` on `acct-credit`, `flagNames {red: Dining, blue: Travel}`.
  - `POST /v1/plans/local-plan/transactions`: Everyday, 2026-11-14, -31.00, payee "VR05 Petrol Stop", Groceries, unflagged.
- Steps (script `.amp/in/orb-backup/vr05.sh <width> <accounts> <tag> <flag label>`): open `/transactions?range=all&accounts=<accounts>`, focus the row, press Enter, read the flag picker's radio labels, choose Travel Card in the Account select, read the labels again, choose a flag by its label, Save, then `GET /v1/plans/local-plan/transactions/<id>`. The row is reset to Everyday and unflagged after each run.

## Before (fix stashed), 1440, Ledger

```
before move: "None | Fuel | Orange | Yellow | Green | Bills | Purple"
after move:  "None | Fuel | Orange | Yellow | Green | Bills | Purple"
chose "Fuel" -> read back: acct-credit red Dining
```

## After

| Width, scope | Labels after choosing Travel Card | Chosen | Read back |
|---|---|---|---|
| 1440, Ledger (Account cell) | None, Dining, Orange, Yellow, Green, Travel, Purple | Dining | acct-credit red Dining |
| 390, Ledger (Account cell) | None, Dining, Orange, Yellow, Green, Travel, Purple | Travel | acct-credit blue Travel |
| 1440, Everyday register (Account field in the band) | None, Dining, Orange, Yellow, Green, Travel, Purple | Dining | acct-credit red Dining |

Before choosing another account the editor still offers Fuel and Bills, as it should.

## Not changed

A row that already carries a stored flag name keeps it when moved with the same colour (read back `acct-credit red Fuel`), because the web does not write `flag_name` and the server keeps the stored name. That is the known open item about flag names needing a server change.
