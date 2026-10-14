// Local-to-local and local-to-server snapshot moves: export the plan from one
// engine, import it into a fresh engine, export again, and diff the two
// snapshots. Anything that differs was lost or changed by the move.
//   bun .amp/in/artifacts/ios-bug-hunt-r7/snapshot-roundtrip-e2e.ts
import { startEngine } from "./engine-harness";

const engineDir = process.argv[2] ?? "apps/ios/HowMuch/Engine";
const plan = "local-plan";
const base = `/v1/plans/${plan}`;
const uuid = () => crypto.randomUUID().toLowerCase();
const idem = () => ({ "Idempotency-Key": uuid() });

const a = startEngine(engineDir);
await a.configure({ defaultPlanId: plan, timeZone: "Asia/Singapore" });
const must = async (method: string, path: string, body?: unknown, headers?: Record<string, string>) => {
  const r = await a.handle(method, path, body, headers);
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data;
};
const cash = (await must("POST", `${base}/accounts`, { account: { name: "Cash", type: "cash", balance: 100000, on_budget: true, icon: "💵" } })).account;
const card = (await must("POST", `${base}/accounts`, { account: { name: "Card", type: "creditCard", balance: 0, on_budget: true } })).account;
const house = (await must("POST", `${base}/accounts`, { account: { name: "House", type: "otherAsset", balance: 0, on_budget: false } })).account;
const group = uuid();
await must("POST", `${base}/category_groups`, { category_group: { id: group, name: "Everyday" } }, idem());
const food = uuid();
await must("POST", `${base}/categories`, { category: { id: food, category_group_id: group, name: "Food" } }, idem());
const payees = (await must("GET", `${base}/payees`)).payees;
const toCard = payees.find((p: any) => p.transfer_account_id === card.id);
const tx = (fields: Record<string, unknown>) => must("POST", `${base}/transactions`, { transaction: {
  account_id: cash.id, date: "2026-10-01", amount: -1000, payee_id: null, payee_name: "Shop", category_id: food, memo: "m",
  cleared: "cleared", approved: true, flag_color: "red", subtransactions: [], import_id: uuid(), id: `txn_${uuid()}`, ...fields,
} });
await tx({});
await tx({ approved: false, flag_color: null, memo: null, cleared: "uncleared" });
await tx({ payee_id: toCard.id, payee_name: toCard.name, category_id: null, amount: -5000 });
await tx({ amount: -3000, category_id: null, subtransactions: [
  { amount: -1000, category_id: food, memo: "a" },
  { amount: -1000, payee_name: "Other", category_id: food },
  { amount: -1000, transfer_account_id: house.id },
] });
await must("POST", `${base}/scheduled_transactions`, { scheduled_transaction: {
  account_id: cash.id, date_first: "2026-11-01", date_next: "2026-11-01", frequency: "monthly", amount: -9900, category_id: food, memo: "phone", flag_color: "blue", subtransactions: [],
} }, idem());
await must("POST", `${base}/scheduled_transactions`, { scheduled_transaction: {
  account_id: cash.id, date_first: "2026-11-05", date_next: "2026-11-05", frequency: "everyOtherWeek", amount: -3000,
  subtransactions: [{ amount: -2000, category_id: food }, { amount: -1000, transfer_account_id: card.id }],
} }, idem());
const recon = (await must("GET", `${base}/accounts/${cash.id}/reconciliation?statement_date=2026-10-02`));
await must("POST", `${base}/accounts/${cash.id}/reconcile`, { statement_date: "2026-10-02", statement_balance: recon.projected_reconciled_balance }, idem());
await must("POST", "/api/rewards/cards", { plan_id: plan, card: {
  id: "card_miles", name: "Miles", issuer: "Bank", type: "miles", ynabAccountId: card.id, featured: true,
  billingCycle: { type: "billing", dayOfMonth: 15 }, earningRate: 1.4, earningBlockSize: 1, minimumSpend: 500, maximumSpend: null,
  subcategoriesEnabled: true, flagNames: { red: "Dining" },
  subcategories: [{ id: "sub_dining", name: "Dining", flagColor: "red", rewardValue: 4, priority: 1, active: true, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }],
} });
await must("PATCH", "/api/rewards/settings", { plan_id: plan, milesValuation: 0.02 });

const first = (await must("GET", `${base}/export_snapshot`));
const b = startEngine(engineDir);
await b.configure({ defaultPlanId: plan, timeZone: "Asia/Singapore" });
const imported = await b.handle("POST", `${base}/import_snapshot`, { snapshot: first.snapshot ?? first }, idem());
console.log("import status", imported.status, imported.status >= 300 ? JSON.stringify(imported.body) : "");
const second = (await b.handle("GET", `${base}/export_snapshot`)).body.data;

const volatile = new Set(["exported_at", "server_knowledge", "created_at", "updated_at", "imported_at"]);
const diffs: string[] = [];
function diff(x: any, y: any, path: string) {
  if (x === y) return;
  if (x && y && typeof x === "object" && typeof y === "object") {
    if (Array.isArray(x) !== Array.isArray(y)) { diffs.push(`${path}: array/object mismatch`); return; }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) if (!volatile.has(k)) diff(x[k], y[k], `${path}.${k}`);
    return;
  }
  diffs.push(`${path}: ${JSON.stringify(x)?.slice(0, 120)} -> ${JSON.stringify(y)?.slice(0, 120)}`);
}
diff(first, second, "snapshot");
console.log(diffs.length ? diffs.join("\n") : "no differences");
process.exit(diffs.length ? 1 : 0);
