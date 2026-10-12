// Records a categorised transfer from an on-budget account to a tracking
// (off-budget) account on the local Worker, edits the tracking side, then
// reads back the persisted rows and the spending report.
// Usage: bun tracking-transfer-e2e.ts <tag>
const base = process.env.E2E_BASE ?? "http://127.0.0.1:8799";
const plan = "80bc6db0-d926-4635-a37a-1ba0787c4c4e";
const headers = { authorization: "Bearer local-e2e-token", "content-type": "application/json" };
const tag = process.argv[2] ?? "run";
const call = async (path: string, method = "GET", body?: unknown) => {
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as any };
};

const checking = await call(`/v1/plans/${plan}/accounts`, "POST", { account: { id: `trk-${tag}-checking`, name: `Trk ${tag} Checking`, type: "checking", on_budget: true } });
const mortgage = await call(`/v1/plans/${plan}/accounts`, "POST", { account: { id: `trk-${tag}-mortgage`, name: `Trk ${tag} Mortgage`, type: "mortgage", on_budget: false } });
console.log("POST accounts", checking.status, mortgage.status, "mortgage on_budget", mortgage.json.data.account.on_budget);
const group = await call(`/v1/plans/${plan}/category_groups`, "POST", { category_group: { name: `Trk ${tag} Home` } });
const category = await call(`/v1/plans/${plan}/categories`, "POST", { category: { name: `Trk ${tag} Mortgage payment`, category_group_id: group.json.data.category_group.id } });
const categoryId = category.json.data.category.id;
console.log("POST category", group.status, category.status);

const created = await call(`/v1/plans/${plan}/transactions`, "POST", {
  transaction: { account_id: `trk-${tag}-checking`, date: "2026-06-11", amount: -30000, payee_id: mortgage.json.data.account.transfer_payee_id, category_id: categoryId, memo: `trk-${tag}` },
});
const transaction = created.json.data.transaction;
const kept = (row: any) => (row.category_id === categoryId ? "kept" : String(row.category_id));
console.log("POST transfer", created.status, "category_id", kept(transaction), "transfer_account_id", transaction.transfer_account_id);

const read = await call(`/v1/plans/${plan}/transactions/${transaction.id}`);
console.log("GET persisted", read.status, "category_id", kept(read.json.data.transaction));

const report = await call(`/api/reports/spending-breakdown?plan_id=${plan}&from=2026-06-11&to=2026-06-11&account_ids=trk-${tag}-checking`);
console.log("spending-breakdown total", report.json.data.total, "groups", JSON.stringify(report.json.data.groups.map((g: any) => [g.category_name, g.amount])));

// Editing the tracking side rewrites the checking side; its category must stay.
const mirrorEdit = await call(`/v1/plans/${plan}/transactions/${transaction.transfer_transaction_id}`, "PATCH", { transaction: { memo: `trk-${tag}-mortgage-side` } });
const after = await call(`/v1/plans/${plan}/transactions/${transaction.id}`);
console.log("PATCH tracking side memo", mirrorEdit.status, "checking side category_id", kept(after.json.data.transaction), "memo", after.json.data.transaction.memo);
