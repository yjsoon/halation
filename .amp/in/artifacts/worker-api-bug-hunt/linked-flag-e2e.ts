// Edits on the linked side of a split transfer line: flags are allowed,
// everything the split owns is still refused, and the split keeps its link.
const base = "http://127.0.0.1:8799";
const plan = "80bc6db0-d926-4635-a37a-1ba0787c4c4e";
const B = `${base}/v1/plans/${plan}`;
const headers = { authorization: "Bearer local-e2e-token", "content-type": "application/json" };
const account = process.argv[2] ?? "retitle-acct-after";

async function call(method: string, url: string, body?: unknown) {
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const rows = (await call("GET", `${B}/accounts/${account}/transactions`)).body.data.transactions;
const linked = rows.find((t: any) => t.memo === "to card");
console.log("linked row", linked.id, "transfer_transaction_id", linked.transfer_transaction_id);
const memo = await call("PATCH", `${B}/transactions/${linked.id}`, { transaction: { memo: "changed" } });
console.log("PATCH memo on linked side", memo.status, memo.body?.error?.detail ?? "");
const flag = await call("PATCH", `${B}/transactions/${linked.id}`, { transaction: { flag_color: "red", flag_name: "Dining" } });
console.log("PATCH flag on linked side", flag.status, flag.body?.data?.transaction?.flag_color, flag.body?.data?.transaction?.flag_name);
const parent = (await call("GET", `${B}/accounts/e2e-save/transactions`)).body.data.transactions
  .find((t: any) => t.subtransactions?.some((s: any) => s.transfer_transaction_id === linked.id));
console.log("split parent", parent?.id, "amount", parent?.amount);
const subs = parent.subtransactions.map((s: any) => s.transfer_transaction_id === linked.id
  ? { id: s.id, amount: -2500, transfer_account_id: account, memo: "to card" }
  : { id: s.id, amount: -500, memo: s.memo });
const edit = await call("PATCH", `${B}/transactions/${parent.id}`, { transaction: { amount: -3000, subtransactions: subs } });
console.log("PATCH split parent", edit.status, edit.body?.error?.detail ?? "");
const after = (await call("GET", `${B}/accounts/${account}/transactions`)).body.data.transactions.find((t: any) => t.id === linked.id);
console.log("linked row after parent edit: amount", after?.amount, "flag", after?.flag_color, after?.flag_name, "transfer_transaction_id", after?.transfer_transaction_id);
const balance = (await call("GET", `${B}/accounts/${account}`)).body.data.account.balance;
console.log("card account balance", balance);
