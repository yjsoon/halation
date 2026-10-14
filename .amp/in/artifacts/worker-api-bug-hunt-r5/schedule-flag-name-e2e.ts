// A flagged schedule on a rewards card's account must post its occurrence with
// the card's name for that flag, as a typed transaction gets it.
import { call, plan, run } from "../worker-api-bug-hunt-r3/common";

const card = (await call("POST", plan("/accounts"), { account: { name: `Flag card ${run}`, type: "creditCard" } })).json.data.account;
const rewards = await call("POST", `/api/rewards/cards`, { card: { id: `card-${run}`, name: `Card ${run}`, ynabAccountId: card.id, flagNames: { red: "Dining" } } });
const payee = (await call("POST", plan("/payees"), { payee: { name: `Cafe ${run}` } })).json.data.payee;
const typed = await call("POST", plan("/transactions"), { transaction: { account_id: card.id, date: "2026-09-01", amount: -4000, payee_id: payee.id, flag_color: "red", memo: `typed ${run}` } });
const schedule = await call("POST", plan("/scheduled_transactions"), { scheduled_transaction: { account_id: card.id, date_first: "2026-09-02", frequency: "never", amount: -5000, payee_id: payee.id, flag_color: "red", memo: `scheduled ${run}` } });
console.log("rewards card / typed / schedule status:", rewards.status, typed.status, schedule.status);
const posted = await call("POST", plan("/scheduled_transactions/materialize"), { through_date: "2026-09-30" }, { "idempotency-key": `materialise-${run}` });
console.log("materialise status:", posted.status, "occurrences", posted.json.data?.occurrences?.length);
const rows = (await call("GET", plan(`/accounts/${card.id}/transactions?limit=50`))).json.data.transactions;
const typedRow = rows.find((t: any) => t.memo === `typed ${run}`);
const postedRow = rows.find((t: any) => t.memo === `scheduled ${run}`);
console.log("typed row:", JSON.stringify({ flag_color: typedRow?.flag_color, flag_name: typedRow?.flag_name }));
console.log("posted occurrence:", JSON.stringify({ flag_color: postedRow?.flag_color, flag_name: postedRow?.flag_name }));
console.log(typedRow?.flag_name === "Dining" && postedRow?.flag_name === "Dining" ? "PASS" : "FAIL");
