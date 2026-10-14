// Names the unflagged flag on a rewards card whose account holds the linked
// side of a split transfer line, then reads back the card and flag names.
const base = "http://127.0.0.1:8799";
const plan = "80bc6db0-d926-4635-a37a-1ba0787c4c4e";
const B = `${base}/v1/plans/${plan}`;
const headers = { authorization: "Bearer local-e2e-token", "content-type": "application/json" };
const tag = process.argv[2] ?? "run";
const card = `retitle-${tag}`;

async function call(method: string, url: string, body?: unknown) {
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// A fresh account for the card so earlier runs do not interfere.
const account = `retitle-acct-${tag}`;
console.log("create account", (await call("POST", `${B}/accounts`, { account: { id: account, name: `Retitle ${tag}`, type: "creditCard" } })).status);
const plain = await call("POST", `${B}/transactions`, { transaction: { account_id: account, date: "2026-10-03", amount: -4000, payee_name: "Plain shop", memo: `retitle-${tag}-plain` } });
console.log("plain unflagged txn", plain.status);
const split = await call("POST", `${B}/transactions`, {
  transaction: {
    account_id: "e2e-save", date: "2026-10-04", amount: -3000, memo: `retitle-${tag}-split`,
    subtransactions: [
      { amount: -1000, memo: "kept" },
      { amount: -2000, transfer_account_id: account, memo: "to card" },
    ],
  },
});
console.log("split with transfer line", split.status, split.status >= 400 ? JSON.stringify(split.body) : "");

const created = await call("POST", `${base}/api/rewards/cards?plan_id=${plan}`, {
  card: { id: card, name: `Card ${tag}`, ynabAccountId: account, type: "cashback", flagNames: { unflagged: "Base rate" } },
});
console.log("POST /api/rewards/cards", created.status, JSON.stringify(created.body));

const snapshot = await call("GET", `${base}/api/import/rewards-tracker?plan_id=${plan}`);
const stored = (snapshot.body?.data?.cards ?? []).find((entry: any) => entry?.id === card);
console.log("card stored after the request:", stored ? JSON.stringify(stored.flagNames) : "no");

const rows = await call("GET", `${B}/accounts/${account}/transactions`);
for (const t of rows.body.data.transactions) {
  console.log("row", t.memo ?? t.payee_name, "amount", t.amount, "flag_color", t.flag_color, "flag_name", t.flag_name);
}
