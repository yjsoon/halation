import { Database } from "bun:sqlite";
const db = new Database(process.argv[2]);
const seed: [string, string][] = [
  ["txn-2026-04-utilities", "TODO: Fake taxi"],
  ["txn-2026-04-market", "CLAIMED - 2026-01-02: Fake lunch"],
  ["txn-2026-03-hawker", "TOCHECK Fake hotel"],
  ["txn-2026-03-fairprice", "TOCHECK TODO: Fake flight"],
  ["txn-2026-03-grab", "todo dinner"],
  ["txn-2026-05-bus", "CLAIMED: Fake bus"],
];
for (const [id, memo] of seed) db.run("update transactions set memo = ?, claim_status = null, claimed_on = null, needs_confirmation = 0 where id = ?", [memo, id]);
db.run("update transactions set memo = 'TODO: Notebooks' where id = 'txn-2026-05-shop'");
console.log(db.query("select id, memo, claim_status from transactions where id in ('txn-2026-04-utilities','txn-2026-05-shop','txn-2026-05-bus')").all());
