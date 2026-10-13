// Round 7 E2E: SQLite (on-device engine) plan scoping and transfer moves.
// Seeds plan q straight into a fresh SQLite file, starts the Bun API server on
// it, then drives plan p (the API token's default plan) over HTTP.
// Run from the repo root: bun .amp/in/artifacts/worker-api-bug-hunt-r7/plan-scope-e2e.ts
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations } from "../../../../apps/api/src/db";
import { LedgerRepository } from "../../../../apps/api/src/repository";

const dir = mkdtempSync(join(tmpdir(), "hm-r7-"));
const dbPath = join(dir, "howmuch.sqlite");
const PORT = Number(process.env.PORT ?? 8871);
const TOKEN = "local-e2e-token";
{
  const db = new Database(dbPath, { create: true });
  applyMigrations(db);
  const repo = new LedgerRepository(db, "p");
  await repo.ensurePlan("p");
  await repo.createAccount("q", { id: "acc-q", name: "Q", type: "checking", balance: 0 });
  await repo.createTransaction("q", { id: "tx-q", account_id: "acc-q", date: "2026-09-01", amount: -1000, memo: "q's" } as any);
  await repo.createPayee("q", "Payee of q", "payee-q");
  db.close();
}
const server = Bun.spawn(["bun", "apps/api/src/server.ts"], {
  env: { ...process.env, HOWMUCH_DB_PATH: dbPath, PORT: String(PORT), HOWMUCH_API_TOKEN: TOKEN, HOWMUCH_DEFAULT_PLAN_ID: "p" },
  stdout: "ignore", stderr: "ignore",
});
const BASE = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {} await Bun.sleep(100); }
const call = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await r.json() as any;
  return { status: r.status, detail: json.error?.detail ?? "" };
};
const P = "/v1/plans/p";
const rows: string[][] = [];
const row = (label: string, expected: string, r: { status: number; detail: string }) => rows.push([label, expected, `${r.status} ${r.detail}`]);
await call("POST", `${P}/accounts`, { account: { id: "acc-chk", name: "Chk", type: "checking", balance: 0 } });
await call("POST", `${P}/accounts`, { account: { id: "acc-sav", name: "Sav", type: "savings", balance: 0 } });
await call("POST", `${P}/transactions`, { transaction: { id: "tx-1", account_id: "acc-chk", date: "2026-09-01", amount: -1000, transfer_account_id: "acc-sav" } });
row("PATCH transfer tx-1 account_id to its target acc-sav", "400", await call("PATCH", `${P}/transactions/tx-1`, { transaction: { account_id: "acc-sav" } }));
row("POST transaction id tx-q (plan q's)", "404", await call("POST", `${P}/transactions`, { transaction: { id: "tx-q", account_id: "acc-chk", date: "2026-09-02", amount: -5, memo: "from p" } }));
row("POST bulk transaction id tx-q", "404", await call("POST", `${P}/transactions`, { transactions: [{ id: "tx-q", account_id: "acc-chk", date: "2026-09-02", amount: -5, memo: "from p bulk" }] }));
row("POST import transaction id tx-q", "404", await call("POST", `${P}/transactions/import`, { transactions: [{ id: "tx-q", account_id: "acc-chk", date: "2026-09-02", amount: -7, memo: "from p import" }] }));
row("POST account id acc-q (plan q's)", "400", await call("POST", `${P}/accounts`, { account: { id: "acc-q", name: "hijack", type: "checking" } }));
row("POST transaction on account acc-q", "400", await call("POST", `${P}/transactions`, { transaction: { id: "tx-a", account_id: "acc-q", date: "2026-09-02", amount: -5 } }));
row("POST transaction with payee payee-q", "400", await call("POST", `${P}/transactions`, { transaction: { id: "tx-b", account_id: "acc-chk", date: "2026-09-02", amount: -5, payee_id: "payee-q" } }));
server.kill();
await server.exited;
const db = new Database(dbPath, { readonly: true });
console.log("| Request | Expected | Observed |\n| --- | --- | --- |");
for (const r of rows) console.log(`| ${r.join(" | ")} |`);
console.log("\nDatabase after the run:");
console.log("transactions", JSON.stringify(db.query("SELECT id, plan_id, account_id, amount_milli, memo, transfer_account_id, deleted FROM transactions ORDER BY id").all()));
console.log("accounts", JSON.stringify(db.query("SELECT id, plan_id, name, balance_milli FROM accounts ORDER BY id").all()));
db.close();
