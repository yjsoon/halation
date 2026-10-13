// Age of Money by week must list its periods in date order. Synthetic data on
// a local Bun API only; see NOTES.md.
const BASE = process.env.BASE ?? "http://127.0.0.1:8851";
const TOKEN = process.env.TOKEN ?? "local-e2e-token";

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  return { status: response.status, json };
}

const PLAN: string = process.env.PLAN ?? (await call("GET", "/v1/plans")).json.data.plans[0].id;
console.log("plan", PLAN);
const account = await call("POST", `/v1/plans/${PLAN}/accounts`, { account: { name: "Aom week", type: "checking", balance: 0 } });
console.log("create account", account.status);
const accountId = account.json.data.account.id;
// A Thursday start, so no weekly cursor lands on Wednesday 31 December 2025.
const rows = [
  { date: "2025-01-02", amount: 1_000_000, payee_name: "Salary" },
  { date: "2025-12-31", amount: -10_000, payee_name: "New Year's Eve" },
  { date: "2026-01-08", amount: -10_000, payee_name: "Groceries" },
];
for (const row of rows) {
  const created = await call("POST", `/v1/plans/${PLAN}/transactions`, { transaction: { account_id: accountId, approved: true, ...row } });
  console.log("create", row.date, created.status);
}
const report = await call("GET", `/api/reports/age-of-money?plan_id=${PLAN}&from=2025-01-02&to=2026-01-14&interval=week`);
const labels: string[] = report.json.data.periods.map((period: any) => period.period);
console.log("age-of-money", report.status, "periods", labels.length);
console.log("last five:", labels.slice(-5).join(", "));
const sorted = [...labels].sort();
console.log("in date order:", JSON.stringify(labels) === JSON.stringify(sorted));
const spent = report.json.data.periods.filter((period: any) => period.spent > 0).map((period: any) => `${period.period}=${period.spent}`);
console.log("periods with spending:", spent.join(", "));
