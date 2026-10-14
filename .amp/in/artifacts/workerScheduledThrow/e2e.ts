// E2E driver for the Worker's scheduled() handler. Runs the real Worker entry point against a SQLite-backed
// fake D1 binding carrying the repo's D1 migrations, one fresh database per scenario, synthetic data only.
// Prints a transcript of what each cron did (branch taken, log events, rows written). No network, no Cloudflare.
// Run from the repo root: bun .amp/in/artifacts/workerScheduledThrow/e2e.ts
import { Database } from "bun:sqlite";
import { D1Database } from "../../../../apps/api/src/d1";
import { D1LedgerRepository } from "../../../../apps/api/src/d1-ledger-repository";
import { fakeD1Binding } from "../../../../apps/api/tests/helpers/counting-d1";
import worker from "../../../../apps/worker/src/index";

const dir = new URL("../../../../apps/api/d1-migrations/", import.meta.url).pathname;
const migrations = await Promise.all([...new Bun.Glob("*.sql").scanSync({ cwd: dir, absolute: true })].sort().map((f) => Bun.file(f).text()));

async function freshLedger(withBadSchedule: boolean) {
  const sql = new Database(":memory:", { strict: true });
  for (const m of migrations) sql.exec(m);
  sql.run("INSERT INTO plans (id, name) VALUES ('p','Plan')");
  sql.run("INSERT INTO accounts (id, plan_id, name, opening_balance_milli) VALUES ('a','p','Cash',100000)");
  const repo = new D1LedgerRepository(new D1Database(fakeD1Binding(sql)), "p");
  if (withBadSchedule) {
    await repo.upsertPayee("p", { id: "gone", name: "Temporary" });
    await repo.createScheduledTransaction("p", { id: "bad", account_id: "a", payee_id: "gone", date_first: "2026-08-21", frequency: "never", amount: -100 });
  }
  await repo.createScheduledTransaction("p", { id: "good", account_id: "a", date_first: "2026-08-21", frequency: "never", amount: -200 });
  if (withBadSchedule) sql.run("UPDATE payees SET deleted=1 WHERE plan_id='p' AND id='gone'");
  return sql;
}

const baseEnv = (sql: Database) => ({
  ASSETS: { fetch: async () => new Response("asset") }, DB: fakeD1Binding(sql), HOWMUCH_API_TOKEN: "e2e-token",
  HOWMUCH_DEFAULT_PLAN_ID: "p", HOWMUCH_TIME_ZONE: "Asia/Singapore", HOWMUCH_TRANSITION_READ_ONLY: "false",
});

const scenarios: Array<{ name: string; cron?: string; env?: Record<string, string>; bad?: boolean }> = [
  { name: "default YNAB-time cron, no YNAB config (self-hoster materialisation)", cron: "10 16 * * *" },
  { name: "production cron 5 16", cron: "5 16 * * *" },
  { name: "custom cron, no YNAB config", cron: "0 15 * * *" },
  { name: "default cron with only a YNAB token set (YNAB in play)", cron: "10 16 * * *", env: { HOWMUCH_YNAB_TOKEN: "t" } },
  { name: "default cron with only a YNAB plan set (YNAB in play)", cron: "10 16 * * *", env: { HOWMUCH_YNAB_PLAN_ID: "y" } },
  { name: "explicit YNAB cron matches (YNAB in play)", cron: "30 3 * * *", env: { HOWMUCH_YNAB_SYNC_CRON: "30 3 * * *" } },
  { name: "explicit YNAB cron set, default cron arrives (materialisation)", cron: "10 16 * * *", env: { HOWMUCH_YNAB_SYNC_CRON: "30 3 * * *" } },
  { name: "transition read-only, default cron (YNAB in play)", cron: "10 16 * * *", env: { HOWMUCH_TRANSITION_READ_ONLY: "true" } },
  { name: "transition read-only, other cron (refused)", cron: "5 16 * * *", env: { HOWMUCH_TRANSITION_READ_ONLY: "true" } },
  { name: "missing cron (refused)" },
  { name: "one failing schedule beside a good one", cron: "5 16 * * *", bad: true },
];

const out: string[] = [];
for (const s of scenarios) {
  const sql = await freshLedger(s.bad === true);
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (value: string) => { logs.push(value); };
  let outcome = "resolved";
  try {
    await worker.scheduled({ cron: s.cron, scheduledTime: Date.UTC(2026, 7, 21, 16, 5) } as any, { ...baseEnv(sql), ...s.env } as any);
  } catch (error) {
    outcome = `rejected: ${(error as Error).message}`;
  } finally {
    console.log = originalLog;
  }
  const written = (sql.query("SELECT COUNT(*) c FROM transactions WHERE source_kind='scheduled-transaction'").get() as any).c;
  out.push(`## ${s.name}`, `outcome: ${outcome}`, `logs: ${JSON.stringify(logs.map((l) => JSON.parse(l)))}`, `scheduled rows written: ${written}`, "");
}
console.log(out.join("\n"));
