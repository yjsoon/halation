import { seedDemoLedger, seedDemoLedgerOverHttp } from "./lib/demo-seed";

const planId = Bun.env.HOWMUCH_DEFAULT_PLAN_ID;
const apiUrl = Bun.env.HOWMUCH_API_URL;

// With HOWMUCH_API_URL, seed a running Worker (`bun run dev:stack`,
// control-howmuch) through its API, authenticated with HOWMUCH_API_TOKEN.
if (apiUrl) {
  const token = Bun.env.HOWMUCH_API_TOKEN;
  if (!token) throw new Error("HOWMUCH_API_TOKEN is required with HOWMUCH_API_URL");
  const result = await seedDemoLedgerOverHttp({ apiUrl, token, planId });
  console.log(`Seeded demo ledger through ${result.apiUrl}`);
  console.log(`Fixture: ${result.fixturePath}`);
  console.log(`Plan id: ${result.planId}`);
} else {
  const dbPath = Bun.env.HOWMUCH_DB_PATH ?? process.argv[2] ?? "data/howmuch.sqlite";
  const result = await seedDemoLedger({ dbPath, planId });
  console.log(`Seeded demo ledger into ${result.dbPath}`);
  console.log(`Fixture: ${result.fixturePath}`);
  console.log(`Plan id: ${result.planId}`);
}
