// A transfer schedule saved by the web editor (payee_id null, transfer_account_id
// set) must post rows that carry the transfer payee, as SQLite does.
import { call, plan, run } from "../worker-api-bug-hunt-r3/common";

const from = (await call("POST", plan("/accounts"), { account: { name: `Sched from ${run}`, type: "checking" } })).json.data.account;
const to = (await call("POST", plan("/accounts"), { account: { name: `Sched to ${run}`, type: "cash" } })).json.data.account;
const other = (await call("POST", plan("/accounts"), { account: { name: `Sched line ${run}`, type: "savings" } })).json.data.account;
const plain = await call("POST", plan("/scheduled_transactions"), { scheduled_transaction: { account_id: from.id, date_first: "2026-09-15", frequency: "never", amount: -4000, payee_id: null, category_id: null, transfer_account_id: to.id, memo: `plain ${run}` } });
const split = await call("POST", plan("/scheduled_transactions"), { scheduled_transaction: { account_id: from.id, date_first: "2026-09-16", frequency: "never", amount: -9000, memo: `split ${run}`, subtransactions: [
  { amount: -3000, payee_id: null, category_id: null, transfer_account_id: other.id, memo: null },
  { amount: -6000, payee_id: null, category_id: null, transfer_account_id: null, memo: null },
] } });
console.log("schedule create status:", plain.status, split.status);
const posted = await call("POST", plan("/scheduled_transactions/materialize"), { through_date: "2026-09-30" }, { "idempotency-key": `materialise-${run}` });
console.log("materialise status:", posted.status, "occurrences", posted.json.data?.occurrences?.length);
const rows = (await call("GET", plan(`/accounts/${from.id}/transactions?limit=50`))).json.data.transactions;
const plainRow = rows.find((t: any) => t.memo === `plain ${run}`);
const splitRow = rows.find((t: any) => t.memo === `split ${run}`);
const transferLine = splitRow?.subtransactions?.find((s: any) => s.transfer_account_id === other.id);
console.log("plain transfer row:", JSON.stringify({ payee_id: plainRow?.payee_id ?? null, payee_name: plainRow?.payee_name ?? null, transfer_account_id: plainRow?.transfer_account_id }));
console.log("split transfer line:", JSON.stringify({ payee_id: transferLine?.payee_id ?? null, payee_name: transferLine?.payee_name ?? null, transfer_account_id: transferLine?.transfer_account_id }));
const ok = plainRow?.payee_id === to.transfer_payee_id && plainRow?.payee_name === `Transfer : ${to.name}`
  && transferLine?.payee_id === other.transfer_payee_id && transferLine?.payee_name === `Transfer : ${other.name}`;
console.log(ok ? "PASS" : "FAIL");
