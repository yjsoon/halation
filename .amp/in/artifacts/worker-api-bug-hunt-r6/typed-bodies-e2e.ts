// Wrongly typed write bodies must answer 400 and leave the ledger untouched,
// not fail as a 500 or store the value's string form.
import { BASE, TOKEN, call, plan, run } from "../worker-api-bug-hunt-r3/common";

const raw = async (method: string, path: string, body: string) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body });
  return { status: response.status, text: (await response.text()).slice(0, 120) };
};

const account = (await call("POST", plan("/accounts"), { account: { name: `Typed ${run}`, type: "checking" } })).json.data.account;
const created = await call("POST", plan("/transactions"), { transaction: { account_id: account.id, date: "2026-09-20", amount: -1200, payee_name: `Typed payee ${run}`, memo: `typed ${run}` } });
const transaction = created.json.data.transaction;
console.log("fixture:", created.status, transaction.id);

const results: Array<[string, number, number[]]> = [];
const expect = (label: string, status: number, allowed: number[]) => { results.push([label, status, allowed]); console.log(`${label}: ${status}`); };

expect("POST payees with a JSON null body", (await raw("POST", plan("/payees"), "null")).status, [400]);
expect("PATCH transaction with a JSON null body", (await raw("PATCH", plan(`/transactions/${transaction.id}`), "null")).status, [400]);
expect("POST rewards settings with a JSON array body", (await raw("PATCH", "/api/rewards/settings", "[]")).status, [400]);
expect("PATCH transaction memo {}", (await call("PATCH", plan(`/transactions/${transaction.id}`), { transaction: { memo: {} } })).status, [400]);
expect("PATCH transaction memo true", (await call("PATCH", plan(`/transactions/${transaction.id}`), { transaction: { memo: true } })).status, [400]);
expect("PATCH transaction approved \"yes\"", (await call("PATCH", plan(`/transactions/${transaction.id}`), { transaction: { approved: "yes" } })).status, [400]);
expect("PATCH transaction category_id \"\"", (await call("PATCH", plan(`/transactions/${transaction.id}`), { transaction: { category_id: "" } })).status, [400]);
expect("PATCH transaction flag_color 5", (await call("PATCH", plan(`/transactions/${transaction.id}`), { transaction: { flag_color: 5 } })).status, [400]);
expect("POST transaction import_id {}", (await call("POST", plan("/transactions"), { transaction: { account_id: account.id, date: "2026-09-20", amount: -1, import_id: {} } })).status, [400]);
expect("POST transaction category_id \"\"", (await call("POST", plan("/transactions"), { transaction: { account_id: account.id, date: "2026-09-20", amount: -1, category_id: "" } })).status, [400]);
expect("POST transactions/import account_id {}", (await call("POST", plan("/transactions/import"), { transactions: [{ account_id: {}, date: "2026-09-20", amount: -1, import_id: `x-${run}` }] })).status, [400]);
expect("POST quick entry with a null split line", (await call("POST", "/api/mobile/quick-entry", { account_id: account.id, amount: "2.00", payee_name: "Q", subtransactions: [null, { amount: "2.00" }] })).status, [400]);
expect("POST account name {}", (await call("POST", plan("/accounts"), { account: { name: {}, type: "checking" } })).status, [400]);
expect("POST account type {}", (await call("POST", plan("/accounts"), { account: { name: `Bad type ${run}`, type: {} } })).status, [400]);

const after = (await call("GET", plan(`/transactions/${transaction.id}`))).json.data.transaction;
console.log("transaction after the bad edits:", JSON.stringify({ memo: after.memo, approved: after.approved, flag_color: after.flag_color, category_id: after.category_id }));
const accounts = (await call("GET", plan("/accounts"))).json.data.accounts as Array<{ name: string }>;
console.log("accounts named \"[object Object]\":", accounts.filter((entry) => entry.name === "[object Object]").length);
const good = await call("PATCH", plan(`/transactions/${transaction.id}`), { transaction: { memo: "", approved: true, flag_color: null } });
console.log("valid edit (empty memo, approved true, flag null):", good.status, JSON.stringify({ memo: good.json.data?.transaction?.memo, approved: good.json.data?.transaction?.approved }));

const pass = results.every(([, status, allowed]) => allowed.includes(status))
  && after.memo === `typed ${run}` && after.approved === false && after.flag_color === null
  && accounts.every((entry) => entry.name !== "[object Object]") && good.status === 200;
console.log(pass ? "PASS" : "FAIL");
