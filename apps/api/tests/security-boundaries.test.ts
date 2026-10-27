import { afterEach, expect, test } from "bun:test";
import { createHandler } from "../src/http";
import { nativeHarness, sessionFor, type NativeHarness } from "./helpers/native-harness";

const harnesses: NativeHarness[] = [];
afterEach(() => { for (const h of harnesses.splice(0)) h.close(); });
async function open() {
  const h = await nativeHarness("SQLite");
  harnesses.push(h);
  return h;
}

// These hostile cross-plan references and replay histories are not exercised
// by the ordinary single-plan UI recipes. Assert persisted state, not calls.
test("an existing transfer cannot be moved into a foreign account", async () => {
  const h = await open();
  await h.repo.upsertAccount("p", { id: "a", name: "A" });
  await h.repo.upsertAccount("p", { id: "b", name: "B" });
  await h.repo.upsertAccount("q", { id: "foreign", name: "Private" });
  await h.repo.createTransaction("p", { id: "linked", account_id: "b", date: "2026-01-01", amount: 1000 });
  const response = await h.request("/v1/plans/p/transactions", {
    method: "POST", token: sessionFor(h.db, "editor"),
    body: { transaction: { id: "attack", account_id: "a", date: "2026-01-01", amount: -1000,
      transfer_transaction_id: "linked", transfer_account_id: "foreign" } },
  });
  expect(response.status).toBe(400);
  expect(h.db.query("SELECT account_id, amount_milli FROM transactions WHERE id = 'linked'").get())
    .toEqual({ account_id: "b", amount_milli: 1000 });
  expect(h.db.query("SELECT id FROM transactions WHERE id = 'attack'").get()).toBeNull();
});

test("account creation rejects foreign transfer payees without leaving an account", async () => {
  const h = await open();
  await h.repo.upsertPayee("q", { id: "private-payee", name: "Transfer : Private" });
  const response = await h.request("/v1/plans/p/accounts", { method: "POST", token: sessionFor(h.db, "editor"),
    body: { account: { id: "attack", name: "Attack", transfer_payee_id: "private-payee" } } });
  expect(response.status).toBe(400);
  expect(h.db.query("SELECT name, transfer_account_id FROM payees WHERE id = 'private-payee'").get())
    .toEqual({ name: "Transfer : Private", transfer_account_id: null });
  expect(h.db.query("SELECT id FROM accounts WHERE id = 'attack'").get()).toBeNull();
});

test("import upserts cannot overwrite another plan's payee or group", async () => {
  const h = await open();
  await h.repo.upsertPayee("q", { id: "payee", name: "Private" });
  await h.repo.upsertCategoryGroup("q", { id: "group", name: "Private" });
  await expect(h.repo.upsertPayee("p", { id: "payee", name: "Changed", deleted: true })).rejects.toThrow();
  await expect(h.repo.upsertCategoryGroup("p", { id: "group", name: "Changed", deleted: true })).rejects.toThrow();
  expect(h.db.query("SELECT name, deleted FROM payees WHERE id = 'payee'").get()).toEqual({ name: "Private", deleted: 0 });
  expect(h.db.query("SELECT name, deleted FROM category_groups WHERE id = 'group'").get()).toEqual({ name: "Private", deleted: 0 });
});

test("replayed scheduled occurrences consume the cron work budget", async () => {
  const h = await open();
  await h.repo.upsertAccount("p", { id: "a", name: "A" });
  await h.repo.createScheduledTransaction("p", { id: "daily", account_id: "a", date_first: "2026-01-01", frequency: "daily", amount: -1000 });
  await h.repo.materializeScheduledTransactionsForCron("p", "2026-01-10", 10);
  await h.repo.updateScheduledTransaction("p", "daily", { date_next: "2026-01-01" });
  const result = await h.repo.materializeScheduledTransactionsForCron("p", "2026-01-10", 2);
  expect((await h.repo.getScheduledTransaction("p", "daily")).date_next).toBe("2026-01-03");
  expect(result.has_more).toBe(true);
  expect(h.db.query("SELECT COUNT(*) AS n FROM transactions").get()).toEqual({ n: 10 });
});

test("native write routes reject extra segments under the transition lock", async () => {
  const h = await open();
  await h.repo.upsertAccount("p", { id: "a", name: "A" });
  const handler = createHandler({ db: h.db, repo: h.repo,
    config: { dbPath: ":memory:", port: 0, apiToken: "test-token", defaultPlanId: "p", transitionReadOnly: true } });
  for (const path of ["mobile/quick-entry", "import/csv", "import/ynab", "import/rewards-tracker"]) {
    const response = await handler(new Request(`https://howmuch.test/api/${path}/extra`, {
      method: "POST", headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ account_id: "a", date: "2026-01-01", amount: -1000, payload: { cards: [] } }),
    }));
    expect(response.status).toBe(404);
  }
  expect(h.db.query("SELECT COUNT(*) AS n FROM transactions").get()).toEqual({ n: 0 });
});

test("rewards imports preserve owner-controlled plan currency", async () => {
  const h = await open();
  const before = (await h.repo.getSettings("p")).currency_format;
  const response = await h.request("/api/import/rewards-tracker", { method: "POST", token: sessionFor(h.db, "editor"),
    body: { plan_id: "p", payload: { cards: [], settings: { currency: "EUR" } } } });
  expect(response.status).toBe(201);
  expect((await h.repo.getSettings("p")).currency_format).toEqual(before);
});

test("reports reject excessive periods and malformed dates before expanding them", async () => {
  const h = await open();
  for (const query of ["from=2000-01-01&to=2026-12-31&interval=day", "from=2026-02-30&to=2026-03-02", "interval=seconds"]) {
    const response = await h.request(`/api/reports/net-worth?plan_id=p&${query}`);
    expect(response.status).toBe(400);
  }
  const response = await h.request("/api/reports/net-worth?plan_id=p&from=2026-01-01&to=2026-01-03&interval=day");
  expect(response.status).toBe(200);
});
