// Creates accounts with the documented create body (name, type, balance; no
// on_budget) on the local Worker and reads back on_budget.
// Usage: bun account-kind-e2e.ts <tag>
const base = process.env.E2E_BASE ?? "http://127.0.0.1:8799";
const plan = "80bc6db0-d926-4635-a37a-1ba0787c4c4e";
const headers = { authorization: "Bearer local-e2e-token", "content-type": "application/json" };
const tag = process.argv[2] ?? "run";

for (const [type, extra] of [["mortgage", {}], ["otherAsset", {}], ["savings", {}], ["checking", { on_budget: false }]] as const) {
  const response = await fetch(`${base}/v1/plans/${plan}/accounts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ account: { name: `Kind ${tag} ${type}`, type, balance: 0, ...extra } }),
  });
  const created = (await response.json() as any).data.account;
  const read = await fetch(`${base}/v1/plans/${plan}/accounts/${created.id}`, { headers });
  const persisted = (await read.json() as any).data.account;
  console.log("POST", type, JSON.stringify(extra), response.status, "-> GET on_budget", persisted.on_budget);
}
