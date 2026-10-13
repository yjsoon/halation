// Sends every request body shape the iOS app builds (APIClient.swift and its
// Encodable models, JSONEncoder with .convertToSnakeCase, nil optionals as
// explicit null where the model encodes them so) through the shipped engine
// bundle, and reports any status a working flow should not get.
//
// Run from the repo root with Bun 1.4.0:
//   bun .amp/in/artifacts/ios-bug-hunt-r7/ios-bodies-e2e.ts [engineDir]
import { startEngine } from "./engine-harness";

const engineDir = process.argv[2] ?? "apps/ios/HowMuch/Engine";
const engine = startEngine(engineDir);
const plan = "local-plan";
await engine.configure({
  defaultPlanId: plan,
  timeZone: "Asia/Singapore",
  newPlanSettings: {
    currency_format: { iso_code: "SGD", example_format: "123,456.78", decimal_digits: 2, decimal_separator: ".", symbol_first: true, group_separator: ",", currency_symbol: "$", display_symbol: true },
    date_format: { format: "DD/MM/YYYY" },
  },
});

let failures = 0;
const rows: string[] = [];
async function step(label: string, method: string, path: string, body: unknown, expect: number, headers: Record<string, string> = {}) {
  const result = await engine.handle(method, path, body, headers);
  const ok = result.status === expect;
  if (!ok) failures++;
  rows.push(`| ${label} | ${method} ${path.replace(`/v1/plans/${plan}`, "…")} | ${expect} | ${result.status}${ok ? "" : " " + JSON.stringify(result.body).slice(0, 160)} | ${ok ? "PASS" : "FAIL"} |`);
  return result.body;
}
const uuid = () => crypto.randomUUID().toLowerCase();
const base = `/v1/plans/${plan}`;
const idem = () => ({ "Idempotency-Key": uuid() });

// AccountCreateRequest: icon omitted when nil, on_budget always sent.
const cash = (await step("create account (no icon)", "POST", `${base}/accounts`, { account: { name: "Cash", type: "cash", balance: 0, on_budget: true } }, 201)).data.account;
const card = (await step("create account (icon)", "POST", `${base}/accounts`, { account: { name: "Card", type: "creditCard", balance: -12340, icon: "💳", on_budget: true } }, 201)).data.account;
const house = (await step("create tracking account", "POST", `${base}/accounts`, { account: { name: "House", type: "otherAsset", balance: 500000000, on_budget: false } }, 201)).data.account;
// AccountUpdateRequest: nil fields omitted.
await step("rename account", "PATCH", `${base}/accounts/${cash.id}`, { account: { name: "Wallet" } }, 200);
await step("change icon only", "PATCH", `${base}/accounts/${cash.id}`, { account: { icon: "💵" } }, 200);

const groupId = uuid();
await step("create category group", "POST", `${base}/category_groups`, { category_group: { id: groupId, name: "Everyday" } }, 201, idem());
const food = uuid();
const fun = uuid();
await step("create category", "POST", `${base}/categories`, { category: { id: food, category_group_id: groupId, name: "Food" } }, 201, idem());
await step("create category 2", "POST", `${base}/categories`, { category: { id: fun, category_group_id: groupId, name: "Fun" } }, 201, idem());

// TransactionWriteRequest: payee_id/payee_name/category_id/memo/flag_color as
// explicit null, cleared on create, import_id and id stamped by the outbox.
const create = (fields: Record<string, unknown>) => ({
  transaction: {
    account_id: cash.id, date: "2026-10-10", amount: -4500, payee_id: null, payee_name: "Kopi", category_id: food,
    memo: null, cleared: "uncleared", approved: true, flag_color: null, subtransactions: [], import_id: uuid(), id: `txn_${uuid()}`,
    ...fields,
  },
});
const plain = (await step("create (new payee, nulls)", "POST", `${base}/transactions`, create({}), 201)).data.transaction;
await step("create (no payee, no category)", "POST", `${base}/transactions`, create({ payee_name: null, category_id: null, amount: -100 }), 201);
await step("create (flag, memo, cleared)", "POST", `${base}/transactions`, create({ flag_color: "red", memo: "lunch", cleared: "cleared" }), 201);
await step("create unapproved (share intake)", "POST", `${base}/transactions`, create({ approved: false }), 201);
await step("create inflow (zero category)", "POST", `${base}/transactions`, create({ amount: 100000, payee_name: "Salary", category_id: null }), 201);
// Legacy queued create: no id key at all.
const legacy = create({});
delete (legacy.transaction as any).id;
await step("legacy queued create (no id)", "POST", `${base}/transactions`, legacy, 201);
// Replayed create (lost response).
const replay = create({});
await step("create", "POST", `${base}/transactions`, replay, 201);
await step("replay same create", "POST", `${base}/transactions`, replay, 200);

// Transfer: payee is the destination's transfer payee, category null.
const payees = (await step("list payees", "GET", `${base}/payees`, undefined, 200)).data.payees;
const toCard = payees.find((p: any) => p.transfer_account_id === card.id);
const toHouse = payees.find((p: any) => p.transfer_account_id === house.id);
const transfer = (await step("create transfer", "POST", `${base}/transactions`, create({ payee_id: toCard.id, payee_name: toCard.name, category_id: null, amount: -20000 }), 201)).data.transaction;
await step("create transfer to tracking (category)", "POST", `${base}/transactions`, create({ payee_id: toHouse.id, payee_name: toHouse.name, category_id: food, amount: -1000 }), 201);

// Split: synthesised Encodable omits nil fields on each line.
const split = (await step("create split", "POST", `${base}/transactions`, create({
  amount: -5000, category_id: null, payee_name: "Market",
  subtransactions: [
    { amount: -3000, category_id: food, memo: "veg" },
    { amount: -1000, payee_name: "Stall", category_id: fun },
    { amount: -1000, transfer_account_id: card.id },
  ],
}), 201)).data.transaction;

// Edits: cleared omitted, import_id omitted, ids kept.
const editBody = (t: any, fields: Record<string, unknown> = {}) => ({
  transaction: {
    account_id: t.account_id, date: t.date, amount: t.amount, payee_id: t.payee_id ?? null, payee_name: t.payee_name ?? null,
    category_id: t.subtransactions?.length ? null : t.category_id ?? null, memo: t.memo ?? null, approved: true,
    flag_color: t.flag_color ?? null,
    subtransactions: (t.subtransactions ?? []).map((s: any) => {
      const line: Record<string, unknown> = { id: s.id, amount: s.amount };
      if (!s.transfer_account_id) {
        if (s.payee_id) line.payee_id = s.payee_id;
        if (s.payee_name) line.payee_name = s.payee_name;
        if (s.category_id) line.category_id = s.category_id;
      }
      if (s.memo) line.memo = s.memo;
      if (s.transfer_account_id) line.transfer_account_id = s.transfer_account_id;
      if (s.transfer_transaction_id) line.transfer_transaction_id = s.transfer_transaction_id;
      return line;
    }),
    ...fields,
  },
});
await step("edit plain (memo, flag)", "PUT", `${base}/transactions/${plain.id}`, editBody(plain, { memo: "teh", flag_color: "blue" }), 200);
await step("edit plain clears memo, flag, category", "PUT", `${base}/transactions/${plain.id}`, editBody(plain, { memo: null, flag_color: null, category_id: null }), 200);
await step("edit transfer amount", "PUT", `${base}/transactions/${transfer.id}`, editBody(transfer, { amount: -25000 }), 200);
await step("edit split", "PUT", `${base}/transactions/${split.id}`, editBody(split), 200);
const fetched = (await step("fetch split", "GET", `${base}/transactions/${split.id}`, undefined, 200)).data.transaction;
await step("edit split again (lines from server)", "PUT", `${base}/transactions/${split.id}`, editBody(fetched, { memo: "market run" }), 200);
await step("unsplit (empty subtransactions)", "PUT", `${base}/transactions/${split.id}`, editBody(fetched, { subtransactions: [], category_id: food }), 200);

// Approval, cleared toggle, bulk approve, delete.
const pending = (await step("create pending", "POST", `${base}/transactions`, create({ approved: false }), 201)).data.transaction;
await step("approve one", "PATCH", `${base}/transactions/${pending.id}`, { transaction: { approved: true } }, 200);
const pending2 = (await step("create pending 2", "POST", `${base}/transactions`, create({ approved: false }), 201)).data.transaction;
await step("bulk approve", "PATCH", `${base}/transactions`, { transactions: [{ id: pending2.id, approved: true }] }, 200);
await step("toggle cleared", "PATCH", `${base}/transactions/${plain.id}/cleared`, { expected_cleared: "uncleared", cleared: "cleared" }, 200);
await step("delete", "DELETE", `${base}/transactions/${pending2.id}?expected_approved=true`, undefined, 200);

// Schedules: synthesised Encodable omits nil fields.
const schedule = (await step("create schedule", "POST", `${base}/scheduled_transactions`, {
  scheduled_transaction: { account_id: cash.id, date_first: "2026-10-01", date_next: "2026-10-01", frequency: "monthly", amount: -9900, category_id: fun, memo: "phone", subtransactions: [] },
}, 201, idem())).data.scheduled_transaction;
await step("edit schedule", "PATCH", `${base}/scheduled_transactions/${schedule.id}`, {
  scheduled_transaction: { account_id: cash.id, date_first: "2026-10-01", date_next: "2026-10-01", frequency: "monthly", amount: -9900, flag_color: "green", subtransactions: [] },
}, 200, idem());
await step("enter schedule occurrence", "POST", `${base}/scheduled_transactions/${schedule.id}/materialize`, { occurrence_date: "2026-10-01", date: "2026-10-02" }, 200, idem());
const splitSchedule = (await step("create split schedule", "POST", `${base}/scheduled_transactions`, {
  scheduled_transaction: { account_id: cash.id, date_first: "2026-10-05", date_next: "2026-10-05", frequency: "weekly", amount: -3000, subtransactions: [{ amount: -2000, category_id: food }, { amount: -1000, transfer_account_id: card.id }] },
}, 201, idem())).data.scheduled_transaction;
const summary = await engine.runScheduledMaterialization(Date.parse("2026-10-13T00:00:00Z"));
rows.push(`| schedule catch-up | runScheduledMaterialization | failure_count 0 | ${JSON.stringify(summary)} | ${summary.failure_count === 0 ? "PASS" : "FAIL"} |`);
if (summary.failure_count !== 0) failures++;
await step("delete schedule", "DELETE", `${base}/scheduled_transactions/${splitSchedule.id}`, undefined, 200, idem());

// Reconcile.
const recon = (await step("reconciliation preview", "GET", `${base}/accounts/${cash.id}/reconciliation?statement_date=2026-10-13`, undefined, 200)).data;
await step("reconcile", "POST", `${base}/accounts/${cash.id}/reconcile`, { statement_date: "2026-10-13", statement_balance: recon.projected_reconciled_balance }, 200, idem());

// Rewards: whole-card JSONSerialization body.
const cardBody = {
  plan_id: plan,
  card: {
    id: `card_${uuid()}`, name: "Miles card", issuer: "Bank", type: "miles", ynabAccountId: card.id, featured: true,
    billingCycle: { type: "calendar" }, earningRate: 1.2, earningBlockSize: 1, minimumSpend: null, maximumSpend: null,
    subcategoriesEnabled: false, subcategories: [],
  },
};
const rewardCardReply = await step("create reward card", "POST", "/api/rewards/cards", cardBody, 201);
const rewardCard = rewardCardReply?.data?.card ?? { id: "missing" };
await step("update reward card", "PATCH", `/api/rewards/cards/${rewardCard.id}`, { plan_id: plan, card: { ...cardBody.card, id: rewardCard.id, rewardPeriod: null, promotionalPeriod: null, flagNames: {} } }, 200);
await step("rewards settings", "PATCH", "/api/rewards/settings", { plan_id: plan, milesValuation: 0.015 }, 200);
await step("delete reward card", "DELETE", `/api/rewards/cards/${rewardCard.id}`, { plan_id: plan }, 200);

// Snapshot round trip (local to local import).
const snapshot = (await step("export snapshot", "GET", `${base}/export_snapshot`, undefined, 200)).data;
// Switching to local mode imports the server's snapshot into a fresh engine.
const fresh = startEngine(engineDir);
await fresh.configure({ defaultPlanId: plan, timeZone: "Asia/Singapore" });
const imported = await fresh.handle("POST", `${base}/import_snapshot`, { snapshot: snapshot.snapshot ?? snapshot }, idem());
rows.push(`| import snapshot into a fresh engine | POST …/import_snapshot | 201 | ${imported.status} | ${imported.status === 201 ? "PASS" : "FAIL"} |`);
if (imported.status !== 201) failures++;
const count = (db: any) => (db.query("SELECT COUNT(*) AS c FROM transactions WHERE deleted = 0").get() as any).c;
rows.push(`| imported transaction count | sqlite | ${count(engine.db)} | ${count(fresh.db)} | ${count(engine.db) === count(fresh.db) ? "PASS" : "FAIL"} |`);
if (count(engine.db) !== count(fresh.db)) failures++;

// Auth: logout with EmptyRequest.
console.log("| Flow | Request | Expected | Observed | Result |\n| --- | --- | --- | --- | --- |");
console.log(rows.join("\n"));
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
