// Non-ASCII text through the engine's polyfilled URL, URLSearchParams and
// TextEncoder: payee and memo round trip, and register search by the
// percent-encoded query iOS builds (URLComponents, "+" as %2B).
//   bun .amp/in/artifacts/ios-bug-hunt-r7/unicode-search-e2e.ts
import { startEngine } from "./engine-harness";

const engine = startEngine(process.argv[2] ?? "apps/ios/HowMuch/Engine");
const plan = "local-plan";
const base = `/v1/plans/${plan}`;
await engine.configure({ defaultPlanId: plan, timeZone: "Asia/Singapore" });
const cash = (await engine.handle("POST", `${base}/accounts`, { account: { name: "Café ☕", type: "cash", balance: 0, on_budget: true } })).body.data.account;
const names = ["鼎泰豐", "Café ☕ & Co", "A+B Mart", "50% Off", "Ōtsuka"];
let failures = 0;
for (const name of names) {
  const created = await engine.handle("POST", `${base}/transactions`, { transaction: {
    account_id: cash.id, date: "2026-10-01", amount: -1000, payee_id: null, payee_name: name, category_id: null, memo: `memo ${name}`,
    cleared: "uncleared", approved: true, flag_color: null, subtransactions: [], import_id: crypto.randomUUID(), id: `txn_${crypto.randomUUID()}`,
  } });
  const ok = created.status === 201 && created.body.data.transaction.payee_name === name && created.body.data.transaction.memo === `memo ${name}`;
  // URLComponents percent-encodes the query item, then APIClient turns "+" into %2B.
  const q = new URLSearchParams({ q: name }).toString().replace(/^q=/, "").replace(/\+/g, "%20").replace(/%2B/gi, "%2B");
  const found = await engine.handle("GET", `${base}/accounts/${encodeURIComponent(cash.id)}/transactions?limit=100&offset=0&q=${q}`);
  const hits = found.status === 200 ? found.body.data.transactions.filter((t: any) => t.payee_name === name).length : -1;
  const pass = ok && hits === 1;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} ${JSON.stringify(name)} create=${created.status} search=${found.status} hits=${hits}${found.status !== 200 ? " " + JSON.stringify(found.body) : ""}`);
}
// Other spellings of the same search. SQLite's lower() folds ASCII only, so
// a lower-case "ōtsuka" cannot find "Ōtsuka"; these are the ones that must.
for (const [typed, stored] of [["ŌTSUKA", "Ōtsuka"], ["ōtsuka", "ōtsuka memo"], ["CAFÉ", "Café ☕ & Co"], ["鼎泰", "鼎泰豐"]] as const) {
  if (stored === "ōtsuka memo") {
    await engine.handle("POST", `${base}/transactions`, { transaction: {
      account_id: cash.id, date: "2026-10-02", amount: -1000, payee_id: null, payee_name: "Lower", category_id: null, memo: "ōtsuka memo",
      cleared: "uncleared", approved: true, flag_color: null, subtransactions: [], import_id: crypto.randomUUID(), id: `txn_${crypto.randomUUID()}`,
    } });
  }
  const found = await engine.handle("GET", `${base}/transactions?limit=100&offset=0&q=${encodeURIComponent(typed)}`);
  const hits = found.body.data.transactions.filter((t: any) => t.payee_name === stored || t.memo === stored).length;
  const pass = found.status === 200 && hits === 1;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} typed ${JSON.stringify(typed)} finds ${JSON.stringify(stored)}: hits=${hits}`);
}
console.log(`${failures} failure(s)`);
process.exit(failures ? 1 : 0);
