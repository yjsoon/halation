// Imports YNAB-register-shaped CSV rows (both money columns filled, one "$0.00")
// into the local Worker and reads the persisted amounts back.
const base = "http://127.0.0.1:8799";
const plan = "80bc6db0-d926-4635-a37a-1ba0787c4c4e";
const headers = { authorization: "Bearer local-e2e-token", "content-type": "application/json" };
const tag = process.argv[2] ?? "run";
const body = {
  plan_id: plan,
  account_id: "e2e-acct",
  rows: [
    { date: "2026-10-01", payee: "CSV Salary", memo: `csv-e2e-${tag}-inflow`, outflow: "$0.00", inflow: "$50.00", import_id: `csv-e2e-${tag}-1` },
    { date: "2026-10-02", payee: "CSV Grocer", memo: `csv-e2e-${tag}-outflow`, outflow: "$12.34", inflow: "$0.00", import_id: `csv-e2e-${tag}-2` },
  ],
};
const post = await fetch(`${base}/api/import/csv`, { method: "POST", headers, body: JSON.stringify(body) });
console.log("POST /api/import/csv", post.status, await post.text());
const list = await fetch(`${base}/v1/plans/${plan}/accounts/e2e-acct/transactions?since_date=2026-10-01`, { headers });
const data = await list.json() as any;
for (const t of data.data.transactions) {
  if ((t.memo ?? "").startsWith(`csv-e2e-${tag}`)) console.log("persisted", t.memo, "amount", t.amount, "import_id", t.import_id);
}
