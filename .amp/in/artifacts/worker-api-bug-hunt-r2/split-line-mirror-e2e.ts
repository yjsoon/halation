// Creates a split with a transfer line, then sends the web register's edit
// that turns that line into a regular payee (same line ids, transfer fields
// null), and reads back the live transactions and the savings balance.
// Usage: E2E_BASE=http://127.0.0.1:8798 E2E_PLAN=local-plan bun split-line-mirror-e2e.ts <tag>
const base = process.env.E2E_BASE ?? "http://127.0.0.1:8798";
const plan = process.env.E2E_PLAN ?? "local-plan";
const headers = { authorization: "Bearer local-e2e-token", "content-type": "application/json" };
const tag = process.argv[2] ?? "run";
const call = async (path: string, method = "GET", body?: unknown) => {
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as any };
};

const checking = (await call(`/v1/plans/${plan}/accounts`, "POST", { account: { id: `spl-${tag}-checking`, name: `Spl ${tag} Checking`, type: "checking" } })).json.data.account;
const savings = (await call(`/v1/plans/${plan}/accounts`, "POST", { account: { id: `spl-${tag}-savings`, name: `Spl ${tag} Savings`, type: "savings" } })).json.data.account;
const created = await call(`/v1/plans/${plan}/transactions`, "POST", {
  transaction: { account_id: checking.id, date: "2026-06-13", amount: -3000, memo: `spl-${tag}`, subtransactions: [{ amount: -1000, payee_name: "Bakery" }, { amount: -2000, payee_id: savings.transfer_payee_id }] },
});
const split = created.json.data.transaction;
console.log("POST split with transfer line", created.status, "linked lines", split.subtransactions.filter((line: any) => line.transfer_transaction_id).length);

const edit = await call(`/v1/plans/${plan}/transactions/${split.id}`, "PATCH", {
  transaction: {
    subtransactions: split.subtransactions.map((line: any) => line.transfer_transaction_id
      ? { id: line.id, amount: line.amount, payee_id: null, payee_name: "Grocer", category_id: null, memo: null, transfer_account_id: null, transfer_transaction_id: null }
      : { id: line.id, amount: line.amount, payee_id: line.payee_id, payee_name: line.payee_name, category_id: line.category_id, memo: line.memo, transfer_account_id: null, transfer_transaction_id: null }),
  },
});
console.log("PATCH transfer line to payee Grocer", edit.status, "linked lines", edit.json.data.transaction.subtransactions.filter((line: any) => line.transfer_transaction_id).length);

const live = (await call(`/v1/plans/${plan}/accounts/${savings.id}/transactions?limit=250`)).json.data.transactions;
console.log("live savings transactions", live.length);
const account = (await call(`/v1/plans/${plan}/accounts/${savings.id}`)).json.data.account;
console.log("savings balance", account.balance);
