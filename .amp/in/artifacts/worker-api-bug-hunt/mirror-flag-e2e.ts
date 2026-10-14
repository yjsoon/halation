// Flags one side of a transfer, edits the memo of the other side, and reads
// the flagged side back.
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

const save = (await call("GET", `${B}/accounts/e2e-save`)).body.data.account;
const created = await call("POST", `${B}/transactions`, {
  transaction: { account_id: "e2e-acct", date: "2026-10-05", amount: -7000, payee_id: save.transfer_payee_id, memo: `mirror-flag-${tag}` },
});
const source = created.body.data.transaction;
console.log("transfer created", created.status, source.id, "mirror", source.transfer_transaction_id);
const mirrorId = source.transfer_transaction_id;
const flagged = await call("PATCH", `${B}/transactions/${mirrorId}`, { transaction: { flag_color: "green", flag_name: "Groceries" } });
console.log("flag mirror", flagged.status, flagged.body?.data?.transaction?.flag_color, flagged.body?.data?.transaction?.flag_name);
const memo = await call("PATCH", `${B}/transactions/${source.id}`, { transaction: { memo: `mirror-flag-${tag}-edited` } });
console.log("edit source memo", memo.status);
const mirror = (await call("GET", `${B}/transactions/${mirrorId}`)).body.data.transaction;
console.log("mirror after source edit: memo", mirror.memo, "flag_color", mirror.flag_color, "flag_name", mirror.flag_name);
