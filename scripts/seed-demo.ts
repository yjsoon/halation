import { seedDemoLedgerOverHttp } from "./lib/demo-seed";

const planId = Bun.env.HOWMUCH_DEFAULT_PLAN_ID;
const apiUrl = Bun.env.HOWMUCH_API_URL;
const token = Bun.env.HOWMUCH_API_TOKEN;

// Seeds a running Worker (`bun run dev:stack`, control-howmuch) through its API.
if (!apiUrl || !token) {
  throw new Error("Set HOWMUCH_API_URL and HOWMUCH_API_TOKEN to the running Worker (bun run dev:stack)");
}
const result = await seedDemoLedgerOverHttp({ apiUrl, token, planId });
console.log(`Seeded demo ledger through ${result.apiUrl}`);
console.log(`Fixture: ${result.fixturePath}`);
console.log(`Plan id: ${result.planId}`);
