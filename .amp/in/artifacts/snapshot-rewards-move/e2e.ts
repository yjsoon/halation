// Drives the shipped iOS engine bundle (apps/ios/HowMuch/Engine/howmuch-engine.js)
// over bun:sqlite with the bundled migrations, as LocalEngine.swift does, then
// moves its ledger to a real API server the way the first-connect flow does.
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const [repo, serverUrl, serverToken] = process.argv.slice(2);
const engineDir = `${repo}/apps/ios/HowMuch/Engine`;
const db = new Database(":memory:");
db.exec("PRAGMA foreign_keys = ON");
for (const file of readdirSync(`${engineDir}/migrations`).filter((f) => f.endsWith(".sql")).sort()) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(readFileSync(`${engineDir}/migrations/${file}`, "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
}
const g = globalThis as any;
g.__sqlite = {
  exec(sql: string, params: string) {
    try {
      const statement = db.prepare(sql);
      const values = JSON.parse(params);
      const rows = statement.all(...values);
      const changes = statement.columnNames.length === 0 ? (db.query("SELECT changes() AS n").get() as any).n : 0;
      return JSON.stringify({ rows, changes });
    } catch (error) { return JSON.stringify({ error: String((error as Error).message) }); }
  },
};
g.__random = (n: number) => Array.from(randomBytes(n));
g.__log = () => {};
new Function(readFileSync(`${engineDir}/howmuch-engine.js`, "utf8"))();
const engine = g.__howmuch;
const plan = "plan_e2e-local";
await engine.configure(JSON.stringify({ apiToken: "engine-token", defaultPlanId: plan, timeZone: "Asia/Singapore" }));
const local = async (method: string, path: string, body?: unknown) => {
  const r = await engine.handle(method, `https://local.howmuch${path}`, JSON.stringify({ authorization: "Bearer engine-token", "content-type": "application/json" }), body === undefined ? null : JSON.stringify(body));
  if (r.status >= 300) throw new Error(`local ${method} ${path} ${r.status} ${r.body}`);
  return JSON.parse(r.body).data;
};
const remote = async (method: string, path: string, body?: unknown, key?: string) => {
  const r = await fetch(`${serverUrl}${path}`, { method, headers: { authorization: `Bearer ${serverToken}`, "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (r.status >= 300) throw new Error(`remote ${method} ${path} ${r.status} ${text}`);
  return JSON.parse(text).data;
};

// 1. A local-mode ledger with a card account, spending, a Rewards card and settings.
await local("POST", `/v1/plans/${plan}/accounts`, { account: { id: "acct-e2e-card", name: "Fake Miles Card", type: "creditCard" } });
await local("POST", `/v1/plans/${plan}/transactions`, { transaction: { account_id: "acct-e2e-card", date: "2026-11-02", amount: -45000, payee_name: "Test Cafe", flag_color: "red" } });
const { card } = await local("POST", `/api/rewards/cards?plan_id=${plan}`, { card: { name: "Fake Miles Card", issuer: "Test Bank", type: "miles", ynabAccountId: "acct-e2e-card", earningRate: 1.4, flagNames: { red: "Dining" } } });
await local("PATCH", `/api/rewards/settings?plan_id=${plan}`, { milesValuation: 0.02 });
const localReport = await local("GET", `/api/reports/rewards?plan_id=${plan}&from=2026-11-01&to=2026-11-30`);

// 2. The first-connect flow: export from the engine, import into the empty server plan.
const { snapshot } = await local("GET", `/v1/plans/${plan}/export_snapshot`);
console.log("snapshot.rewards.cards:", snapshot.rewards?.cards?.map((c: any) => c.name));
console.log("snapshot.rewards.settings:", JSON.stringify(snapshot.rewards?.settings));
const imported = await remote("POST", `/v1/plans/e2e-server/import_snapshot`, { snapshot }, "e2e-move-1");
console.log("server import counts:", JSON.stringify(imported.imported));

// 3. What the server now serves.
const stored = await remote("GET", `/api/import/rewards-tracker?plan_id=e2e-server`);
const serverReport = await remote("GET", `/api/reports/rewards?plan_id=e2e-server&from=2026-11-01&to=2026-11-30`);
console.log("server cards:", JSON.stringify(stored.cards.map((c: any) => ({ id: c.id, name: c.name, earningRate: c.earningRate, account: c.ynabAccountId }))));
console.log("server settings:", JSON.stringify(stored.snapshot?.settings));
const pick = (r: any) => r.cards.map((c: any) => ({ account: c.account_id, earned: c.calculation?.reward_earned, type: c.calculation?.reward_type }));
console.log("local report:", JSON.stringify(pick(localReport)));
console.log("server report:", JSON.stringify(pick(serverReport)));
const ok = stored.cards.length === 1 && stored.cards[0].id === card.id && stored.snapshot?.settings?.milesValuation === 0.02
  && JSON.stringify(pick(localReport)) === JSON.stringify(pick(serverReport)) && pick(serverReport)[0]?.earned > 0;
console.log(ok ? "RESULT: PASS" : "RESULT: FAIL");
process.exit(ok ? 0 : 1);
