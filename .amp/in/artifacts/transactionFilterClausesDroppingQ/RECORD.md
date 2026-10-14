# transactionFilterClauses dropping q: run record

- Revision: origin/main 35e3632 plus the three earlier commits plus this commit.
- Change: `transactionFilterClauses` never read `q`, yet the unapproved count passed `q: null`
  and carried a comment explaining why `q` had to be dropped. The parameter type is now
  `Omit<TransactionFilters, "q">`, so the function states what it handles, the dead `q: null`
  is gone, and the caller comment shrinks to the one override that still matters
  (`lastKnowledgeOfServer`).
- Fixture and driver: `../createAccountReseed/e2e-clusters.{sh,mjs}`, local SQLite stack only.
  Step group c4 lists with `q=coffee`, with `q` plus `type=unapproved` / `type=approved`, and
  reads `unapproved_count` plain, with `q=coffee` and with `last_knowledge_of_server=0`.
- Expected: transcript identical to `../createAccountReseed/before.txt`; the count ignores `q`
  and `last_knowledge_of_server` (c4.e and c4.f equal c4.d), while the list honours `q` (c4.a,
  c4.b, c4.h).
- Observed: diff against before.txt is empty (`after.txt` here). `bun test` in apps/api: 443 pass.
  Worker typecheck clean. Bun 1.4.0 engine rebuilt, `check` prints "The iOS engine is up to date."
