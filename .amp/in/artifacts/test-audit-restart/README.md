# Account emoji across a SQLite server restart

Revision: branch `claude/test-audit-legacy-4sbyfh` at b569efb, compared with `apps/api/src/db.ts` from main (73e6731).

Fixture: a fresh disposable SQLite file seeded from `fixtures/demo-ledger.json` (`scripts/seed-demo.ts`, plan `local-plan`). Synthetic data only.

Steps (`run.sh <tmp-dir> <port>`): start `apps/api/src/server.ts`; create a checking account "Everyday"; PATCH its name to "💳 Daily"; read the API and the stored row; stop and restart the server; read again.

Expected: a restart changes nothing.

Observed:

| | stored row after restart | transfer payee after restart | payee server_knowledge |
| --- | --- | --- | --- |
| main (`main.txt`) | `Daily` / 💳 (was `💳 Daily` / 🏦) | `Transfer : Daily` (was `Transfer : 💳 Daily`) | 40 / 40, not bumped |
| branch (`branch.txt`) | unchanged | unchanged | 40 / 40 |

The API shows the account as `Daily` with 💳 in both cases, so the visible change on main is the transfer payee's rename, made without a server_knowledge bump, so synced clients keep the old name.
