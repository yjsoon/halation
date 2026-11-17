# Web register bulk flag (maintain-bulk-flag)

Revision: verified on 42e55615 with this commit's changes applied (apps/web/src/api/client.ts, apps/web/src/pages/Transactions.tsx, apps/web/src/lib/register-bulk.ts).
Stack: `control-howmuch launch` run 20261117T051439-4556 (disposable SQLite seeded from fixtures/demo-ledger.json), owner `verifier`, currency SGD, agent-browser at 1280x800 and 390x844.

## Steps and results

1. Ledger (light), select SimplyGo (Everyday), Candlenut (Travel Card, red Dining), Cold Storage (Everyday). Bar shows `Flag…` beside `Categorise…`; options Red, Orange, Yellow, Green, Blue, Purple, Remove flag (mixed accounts, so plain colour names).
   Choose Green. Toast `Flagged 3 transactions.` HTTP: all three `flag_color` green. Candlenut kept `flag_name` Dining because Travel Card had no reward card yet (pre-existing server behaviour, single-row edits behave the same).
2. Create reward card `card-verify` on Travel Card (`acct-credit`) with flagNames red Dining, blue Online, green Groceries, purple Transport (POST /api/rewards/cards, 201).
3. Travel Card register (dark), select Candlenut, MUJI, Grab. Options read `Dining (Red)`, Orange, Yellow, `Groceries (Green)`, `Online (Blue)`, `Transport (Purple)`, Remove flag.
   Choose Transport (Purple). Toast `Flagged 3 transactions.` HTTP: Candlenut, MUJI, Grab `flag_color` purple, `flag_name` Transport; Scoot untouched (red, Dining).
4. Select Candlenut and MUJI, choose Remove flag. Toast `Removed the flag from 2 transactions.` Reload: Candlenut and MUJI show no chip, Scoot red Dining, Grab purple Transport. HTTP: Candlenut and MUJI `flag_color` null, `flag_name` null.
5. Split-linked side: POST a split on Everyday Account with a transfer line to Rainy Day Saver, then collection PATCH `{ id: <linked side>, flag_color: "orange" }` on the Rainy Day Saver row (`parent_transaction_id` set). 200, returned `flag_color` orange.
6. 390px light: bar grid shows `Categorise…` and `Flag…` side by side, no horizontal overflow.

Screenshots (not committed): light-bar.png, light-after-green.png, dark-bar-named.png, dark-after-purple.png, dark-after-remove-reload.png, phone-light-bar.png.
