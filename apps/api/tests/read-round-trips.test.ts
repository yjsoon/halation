import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { AsyncReportService } from "../src/async-reports";
import { D1AuthStore } from "../src/auth-store";
import { D1LedgerRepository } from "../src/d1-ledger-repository";
import { createHandler } from "../src/http";
import { newSession, passwordCredential } from "../src/password-auth";
import { CountingD1Database, fakeD1Binding } from "./helpers/counting-d1";

const PLAN_ID = "p";

/**
 * Round trips a GET route is allowed to make. These are ceilings, not exact
 * values. One of every count is the single-statement session lookup shared by
 * all authenticated requests; #170 batched each route's remaining statements
 * into one more.
 *
 * The report service, the one route still above two trips, is owned by
 * #180.
 */
const BUDGET: Record<string, number> = {
  "GET /v1/plans": 2,
  "GET /v1/plans/:id": 2,
  "GET /v1/plans/:id/settings": 2,
  "GET /v1/plans/:id/accounts": 2,
  "GET /v1/plans/:id/account_preferences": 2,
  "GET /v1/plans/:id/accounts/usage": 2,
  "GET /v1/plans/:id/categories": 2,
  "GET /v1/plans/:id/payees": 2,
  "GET /v1/plans/:id/transactions?limit=10": 2,
  "GET /v1/plans/:id/transactions?q=": 3,
  "GET /v1/plans/:id/transactions/unapproved_count": 2,
  "GET /v1/plans/:id/scheduled_transactions": 2,
  "GET /api/reports/spending-breakdown": 3,
};

const ROUTES: Array<{ name: string; path: string }> = [
  { name: "GET /v1/plans", path: "/v1/plans" },
  { name: "GET /v1/plans/:id", path: `/v1/plans/${PLAN_ID}` },
  { name: "GET /v1/plans/:id/settings", path: `/v1/plans/${PLAN_ID}/settings` },
  { name: "GET /v1/plans/:id/accounts", path: `/v1/plans/${PLAN_ID}/accounts` },
  { name: "GET /v1/plans/:id/account_preferences", path: `/v1/plans/${PLAN_ID}/account_preferences` },
  { name: "GET /v1/plans/:id/accounts/usage", path: `/v1/plans/${PLAN_ID}/accounts/usage?days=30&until=2026-01-31` },
  { name: "GET /v1/plans/:id/categories", path: `/v1/plans/${PLAN_ID}/categories` },
  { name: "GET /v1/plans/:id/payees", path: `/v1/plans/${PLAN_ID}/payees` },
  { name: "GET /v1/plans/:id/transactions?limit=10", path: `/v1/plans/${PLAN_ID}/transactions?limit=10` },
  { name: "GET /v1/plans/:id/transactions?q=", path: `/v1/plans/${PLAN_ID}/transactions?limit=10&q=Shop` },
  // A searched register reads the plan's currency format before it can build
  // the SQL, so it costs one trip more than the plain page.
  { name: "GET /v1/plans/:id/transactions/unapproved_count", path: `/v1/plans/${PLAN_ID}/transactions/unapproved_count` },
  { name: "GET /v1/plans/:id/scheduled_transactions", path: `/v1/plans/${PLAN_ID}/scheduled_transactions` },
  { name: "GET /api/reports/spending-breakdown", path: `/api/reports/spending-breakdown?plan_id=${PLAN_ID}` },
];

const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

async function ledgerSqlite(): Promise<Database> {
  const sqlite = new Database(":memory:", { strict: true });
  databases.push(sqlite);
  const migrations = new Bun.Glob("*.sql");
  const directory = new URL("../d1-migrations/", import.meta.url).pathname;
  for (const file of [...migrations.scanSync(directory)].sort()) {
    sqlite.exec(await Bun.file(`${directory}${file}`).text());
  }
  return sqlite;
}

async function harness() {
  const sqlite = await ledgerSqlite();

  const counting = new CountingD1Database(fakeD1Binding(sqlite));
  const session = newSession();
  const created = await new D1AuthStore(counting).setup({
    userId: "user-1",
    username: "reader",
    credential: await passwordCredential("correct-horse-battery-staple"),
    session,
    planId: PLAN_ID,
  });
  expect(created).toBeTrue();

  seedLedger(sqlite);

  const handler = createHandler({
    repo: new D1LedgerRepository(counting, PLAN_ID),
    reports: new AsyncReportService(counting),
    auth: new D1AuthStore(counting),
    config: { apiToken: "api-token", defaultPlanId: PLAN_ID },
  });

  return { counting, handler, token: session.token };
}

function seedLedger(db: Database): void {
  db.run("UPDATE plans SET name = 'Plan' WHERE id = ?", [PLAN_ID]);
  db.run("INSERT INTO accounts (id, plan_id, name) VALUES ('acct', ?, 'Cash')", [PLAN_ID]);
  db.run("INSERT INTO category_groups (id, plan_id, name) VALUES ('group', ?, 'Living')", [PLAN_ID]);
  db.run("INSERT INTO categories (id, plan_id, category_group_id, name) VALUES ('cat', ?, 'group', 'Food')", [PLAN_ID]);
  db.run("INSERT INTO payees (id, plan_id, name) VALUES ('payee', ?, 'Shop')", [PLAN_ID]);
  db.run(
    `INSERT INTO transactions (id, plan_id, account_id, payee_id, category_id, date, amount_milli, cleared, updated_at)
     VALUES ('txn', ?, 'acct', 'payee', 'cat', '2026-01-05', -1000, 'cleared', '2026-01-05T00:00:00Z')`,
    [PLAN_ID],
  );
  db.run(
    "INSERT INTO account_preferences (user_id, plan_id, preferences_json, revision) VALUES ('user-1', ?, '{}', 1)",
    [PLAN_ID],
  );
  for (const [type, id, payload] of [
    ["scheduled_transaction", "sched", { id: "sched", date_next: "2026-02-01" }],
    ["month", "2026-01-01", { month: "2026-01-01", categories: [] }],
    ["transaction", "txn", { id: "txn", date: "2026-01-05", amount: -1000, category_id: "cat", deleted: false }],
  ] as const) {
    db.run(
      "INSERT INTO ynab_raw_objects (plan_id, object_type, object_id, payload_json) VALUES (?, ?, ?, ?)",
      [PLAN_ID, type, id, JSON.stringify(payload)],
    );
  }
}

async function measure() {
  const { counting, handler, token } = await harness();
  const counts: Record<string, number> = {};
  for (const route of ROUTES) {
    counting.reset();
    const response = await handler(new Request(`https://howmuch.test${route.path}`, {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(`${route.name} -> ${response.status}`).toBe(`${route.name} -> 200`);
    expect(`${route.name} wrote ${counting.mutations().length} statements`)
      .toBe(`${route.name} wrote 0 statements`);
    counts[route.name] = counting.count;
  }
  return counts;
}

test("GET routes issue no writes and stay within their round-trip budget", async () => {
  const d1Counts = await measure();

  console.log(JSON.stringify({ event: "read_round_trips", d1: d1Counts }));

  for (const route of ROUTES) {
    expect(d1Counts[route.name]).toBeLessThanOrEqual(BUDGET[route.name]!);
  }

  expect(d1Counts["GET /v1/plans/:id/transactions?limit=10"]).toBeLessThanOrEqual(3);
  expect(d1Counts["GET /v1/plans/:id/accounts"]).toBeLessThanOrEqual(2);
  expect(d1Counts["GET /v1/plans/:id/accounts/usage"]).toBeLessThanOrEqual(2);
  expect(d1Counts["GET /v1/plans/:id/categories"]).toBeLessThanOrEqual(2);
});

test("the D1 register page reads knowledge, rows and split lines in one batch", async () => {
  const { counting, handler, token } = await harness();
  counting.reset();

  const response = await handler(new Request(`https://howmuch.test/v1/plans/${PLAN_ID}/transactions?limit=10`, {
    headers: { authorization: `Bearer ${token}` },
  }));
  expect(response.status).toBe(200);

  const batches = counting.roundTrips.filter((trip) => trip.kind === "batch");
  expect(batches).toHaveLength(1);
  expect(batches[0]!.sql).toContain("SELECT server_knowledge FROM plans");
  expect(batches[0]!.sql).toContain("FROM transactions t");
  expect(batches[0]!.sql).toContain("FROM subtransactions st");
  // One batch is one D1 transaction, so the knowledge value labelling the page
  // shares a snapshot with its rows.
  expect(counting.roundTrips.filter((trip) => trip.kind !== "batch" && /server_knowledge FROM plans/.test(trip.sql)))
    .toBeEmpty();
});
