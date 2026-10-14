// Records a cleared transfer from checking to savings on the local Worker,
// then reads the other side's cleared state and the savings balances.
// Usage: bun mirror-cleared-e2e.ts <tag>
const base = process.env.E2E_BASE ?? "http://127.0.0.1:8799";
const plan = "80bc6db0-d926-4635-a37a-1ba0787c4c4e";
const headers = { authorization: "Bearer local-e2e-token", "content-type": "application/json" };
const tag = process.argv[2] ?? "run";
const call = async (path: string, method = "GET", body?: unknown) => {
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as any };
};

const checking = await call(`/v1/plans/${plan}/accounts`, "POST", { account: { id: `clr-${tag}-checking`, name: `Clr ${tag} Checking`, type: "checking" } });
const savings = await call(`/v1/plans/${plan}/accounts`, "POST", { account: { id: `clr-${tag}-savings`, name: `Clr ${tag} Savings`, type: "savings" } });
console.log("POST accounts", checking.status, savings.status);

const created = await call(`/v1/plans/${plan}/transactions`, "POST", {
  transaction: { account_id: `clr-${tag}-checking`, date: "2026-06-12", amount: -40000, payee_id: savings.json.data.account.transfer_payee_id, cleared: "cleared", memo: `clr-${tag}` },
});
const transaction = created.json.data.transaction;
console.log("POST cleared transfer", created.status, "source cleared", transaction.cleared);
const mirror = await call(`/v1/plans/${plan}/transactions/${transaction.transfer_transaction_id}`);
console.log("GET other side", mirror.status, "cleared", mirror.json.data.transaction.cleared);
const account = (await call(`/v1/plans/${plan}/accounts/clr-${tag}-savings`)).json.data.account;
console.log("savings balance", account.balance, "cleared", account.cleared_balance, "uncleared", account.uncleared_balance);
