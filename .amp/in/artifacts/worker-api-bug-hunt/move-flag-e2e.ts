// Moves a transaction to another card account and flags it in one PATCH;
// the flag name must come from the destination card.
const base = "http://127.0.0.1:8799";
const plan = "80bc6db0-d926-4635-a37a-1ba0787c4c4e";
const B = `${base}/v1/plans/${plan}`;
const headers = { authorization: "Bearer local-e2e-token", "content-type": "application/json" };
const tag = process.argv[2] ?? "run";

async function call(method: string, url: string, body?: unknown) {
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

for (const [suffix, name] of [["from", "Dining (from card)"], ["to", "Groceries (to card)"]]) {
  const account = `move-${suffix}-${tag}`;
  console.log("account", account, (await call("POST", `${B}/accounts`, { account: { id: account, name: account, type: "creditCard" } })).status);
  console.log("card", (await call("POST", `${base}/api/rewards/cards?plan_id=${plan}`, {
    card: { id: `card-${account}`, name: account, ynabAccountId: account, type: "cashback", flagNames: { red: name } },
  })).status);
}
const created = await call("POST", `${B}/transactions`, { transaction: { account_id: `move-from-${tag}`, date: "2026-10-06", amount: -1500, payee_name: "Move shop" } });
const id = created.body.data.transaction.id;
const moved = await call("PATCH", `${B}/transactions/${id}`, { transaction: { account_id: `move-to-${tag}`, flag_color: "red" } });
const txn = moved.body.data.transaction;
console.log("PATCH move+flag", moved.status, "account", txn.account_id, "flag", txn.flag_color, "flag_name", txn.flag_name);
