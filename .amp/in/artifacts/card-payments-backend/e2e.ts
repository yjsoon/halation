// E2E driver for the card payment routes. Synthetic data only.
//
//   bun .amp/in/artifacts/card-payments-backend/e2e.ts --base http://127.0.0.1:PORT --token TOKEN --plan local-plan
//     drives a running Bun/SQLite API stack (control-howmuch launch) over HTTP.
//   bun .amp/in/artifacts/card-payments-backend/e2e.ts --d1
//     serves the Worker/local-mode request path (createHandler + D1LedgerRepository, D1 migrations on an
//     in-memory SQLite behind the repo's fake D1 binding, timeZone Asia/Singapore) over loopback HTTP,
//     runs the same steps, then round-trips the plan snapshot into a second empty D1 instance.
//
// Every request uses the default-plan API token, the principal local mode uses.
// Expected dates are hard-coded from an independent calendar (see RECORD.md), not from the module.
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { D1AuthStore } from "../../../../apps/api/src/auth-store";
import { D1Database } from "../../../../apps/api/src/d1";
import { D1LedgerRepository } from "../../../../apps/api/src/d1-ledger-repository";
import { D1ReportService } from "../../../../apps/api/src/d1-reports";
import { createHandler } from "../../../../apps/api/src/http";
import { fakeD1Binding } from "../../../../apps/api/tests/helpers/counting-d1";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const d1Mode = args.includes("--d1");

function d1Server(timeZone: string) {
  const sql = new Database(":memory:", { strict: true });
  const dir = new URL("../../../../apps/api/d1-migrations/", import.meta.url).pathname;
  for (const f of [...new Bun.Glob("*.sql").scanSync({ cwd: dir, absolute: true })].sort()) sql.exec(readFileSync(f, "utf8"));
  const binding = fakeD1Binding(sql);
  const database = new D1Database(binding);
  const repo = new D1LedgerRepository(database, "p");
  const config = { dbPath: "", port: 0, apiToken: "e2e-bootstrap-token", defaultPlanId: "p", transitionReadOnly: false, timeZone };
  const handler = createHandler({ repo, reports: new D1ReportService(binding), auth: new D1AuthStore(database), config });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  return { server, repo, sql, base: `http://127.0.0.1:${server.port}` };
}

let base: string, token: string, plan: string, expectedZone: string;
let primary: ReturnType<typeof d1Server> | null = null;
if (d1Mode) {
  primary = d1Server("Asia/Singapore");
  await primary.repo.ensurePlan("p");
  base = primary.base; token = "e2e-bootstrap-token"; plan = "p"; expectedZone = "Asia/Singapore";
} else {
  base = flag("--base")!; token = flag("--token")!; plan = flag("--plan") ?? "local-plan";
  expectedZone = flag("--zone") ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const results: string[] = [];
let failures = 0;
const check = (name: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: ${JSON.stringify(detail)}`}`);
};
const log: string[] = [];
async function call(method: string, path: string, body?: unknown, key?: string, against = base) {
  const response = await fetch(against + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(key ? { "idempotency-key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  log.push(`${method} ${path}${key ? ` [Idempotency-Key ${key}]` : ""}${body ? ` ${JSON.stringify(body)}` : ""}\n-> ${response.status} ${JSON.stringify(json)}`);
  return { status: response.status, json };
}
const P = `/v1/plans/${plan}`;
const run = Date.now().toString(36);
const deepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// 1. Accounts
const cardA = (await call("POST", `${P}/accounts`, { account: { name: `Card A ending 0000 ${run}`, type: "creditCard" } })).json.data.account;
const accountB = (await call("POST", `${P}/accounts`, { account: { name: `Account B ${run}`, type: "checking", opening_balance: 5_000_000 } })).json.data.account;
const cardC = (await call("POST", `${P}/accounts`, { account: { name: `Card C ending 1111 ${run}`, type: "lineOfCredit" } })).json.data.account;
check("accounts created", Boolean(cardA?.id && accountB?.id && cardC?.id));

// 2. PUT terms with defaults
const putA = await call("PUT", `${P}/accounts/${cardA.id}/card_payment_terms`, { card_payment_terms: { statement_day: 3, due_gap_days: 25, due_weekend_rule: "next", default_funding_account_id: accountB.id } }, `terms-a-${run}`);
check("PUT terms 200", putA.status === 200, putA);
check("PUT fills defaults", deepEqual(putA.json?.data?.card_payment_terms, {
  account_id: cardA.id, statement_day: 3, due_gap_days: 25, due_weekend_rule: "next", default_funding_account_id: accountB.id,
  default_amount_rule: "statement", default_amount_milli: null, minimum_floor_milli: 50000, minimum_rate_bp: 300,
  pay_days_before_due: 2, lead_days: 7, delivery_hour: 8, enabled: true,
}), putA.json);
const knowledgeAfterPut = putA.json.data.server_knowledge;
const replay = await call("PUT", `${P}/accounts/${cardA.id}/card_payment_terms`, { card_payment_terms: { statement_day: 3, due_gap_days: 25, due_weekend_rule: "next", default_funding_account_id: accountB.id } }, `terms-a-${run}`);
check("exact retry replays without moving knowledge", replay.status === 200 && replay.json.data.server_knowledge === knowledgeAfterPut, replay);
const reuse = await call("PUT", `${P}/accounts/${cardA.id}/card_payment_terms`, { card_payment_terms: { statement_day: 4 } }, `terms-a-${run}`);
check("key reuse with another body is 409", reuse.status === 409, reuse);

// 3. Validation
check("non-card account refused", (await call("PUT", `${P}/accounts/${accountB.id}/card_payment_terms`, { card_payment_terms: { statement_day: 3 } })).status === 400);
check("statement_day 32 refused", (await call("PUT", `${P}/accounts/${cardA.id}/card_payment_terms`, { card_payment_terms: { statement_day: 32 } })).status === 400);
check("unknown field refused", (await call("PUT", `${P}/accounts/${cardA.id}/card_payment_terms`, { card_payment_terms: { statement_day: 3, note: "x" } })).status === 400);
check("fixed without amount refused", (await call("PUT", `${P}/accounts/${cardA.id}/card_payment_terms`, { card_payment_terms: { statement_day: 3, default_amount_rule: "fixed" } })).status === 400);
check("card cannot fund itself", (await call("PUT", `${P}/accounts/${cardA.id}/card_payment_terms`, { card_payment_terms: { statement_day: 3, default_funding_account_id: cardA.id } })).status === 400);
check("missing funding account refused", (await call("PUT", `${P}/accounts/${cardA.id}/card_payment_terms`, { card_payment_terms: { statement_day: 3, default_funding_account_id: "acct_missing" } })).status === 400);
check("missing card is 404", (await call("PUT", `${P}/accounts/acct_missing/card_payment_terms`, { card_payment_terms: { statement_day: 3 } })).status === 404);
check("bad as_of refused", (await call("GET", `${P}/card_payments?as_of=2026-02-30`)).status === 400);
const unchanged = await call("GET", `${P}/accounts/${cardA.id}/card_payment_terms`);
check("refused writes left terms unchanged", unchanged.json?.data?.card_payment_terms?.statement_day === 3, unchanged);

// 4. Register rows on Card A (amounts in milliunits; S$1,234.56 owed at the 3 Oct statement)
for (const [date, amount] of [["2026-09-20", -200_000], ["2026-10-02", -934_560], ["2026-10-03", -100_000], ["2026-10-10", -165_440]] as const) {
  const created = await call("POST", `${P}/transactions`, { transaction: { account_id: cardA.id, date, amount, payee_name: "Shop A", approved: true, cleared: "cleared" } });
  check(`transaction ${date} created`, created.status === 201, created);
}

const cyclesFor = async (asOf: string) => {
  const view = await call("GET", `${P}/card_payments?as_of=${asOf}`);
  return { view, a: view.json.data.cycles.filter((c: any) => c.account_id === cardA.id), c: view.json.data.cycles.filter((c: any) => c.account_id === cardC.id) };
};

// 5. Current cycle unscheduled; next cycle due date on a Saturday moves to Monday
let { view, a } = await cyclesFor("2026-10-18");
check("view as_of echoed", view.json.data.as_of === "2026-10-18");
check("current cycle maths", deepEqual(a[0], {
  account_id: cardA.id, cycle: "current", statement_date: "2026-10-03", due_date: "2026-10-28", last_safe_pay_date: "2026-10-26",
  default_pay_date: "2026-10-26", statement_balance: 1_234_560, minimum_due: 50_000, current_balance: 1_400_000, coverage: { state: "unscheduled" },
}), a[0]);
check("next cycle: 28 Nov (Sat) moves to Mon 30 Nov", deepEqual(a[1], {
  account_id: cardA.id, cycle: "next", statement_date: "2026-11-03", due_date: "2026-11-30", last_safe_pay_date: "2026-11-26",
  default_pay_date: "2026-11-26", statement_balance: 1_400_000, minimum_due: 50_000, current_balance: 1_400_000, coverage: { state: "unscheduled" },
}), a[1]);

// 6. Year boundary: 28 Dec 2025 is a Sunday
({ a } = await cyclesFor("2026-01-02"));
check("year boundary: Dec statement, Sunday 28 Dec moves to Mon 29 Dec", a[0]?.statement_date === "2025-12-03" && a[0]?.due_date === "2025-12-29" && a[0]?.last_safe_pay_date === "2025-12-25" && a[1]?.statement_date === "2026-01-03" && a[1]?.due_date === "2026-01-28", a);

// 7. Past due with nothing: overdue; default pay day becomes as_of
({ a } = await cyclesFor("2026-10-29"));
check("overdue after due date", a[0]?.coverage?.state === "overdue" && a[0]?.default_pay_date === "2026-10-29", a[0]);

// 8. One-off scheduled transfer flips coverage to scheduled
const scheduleKey = `card-pay:${cardA.id}:2026-10-03`;
const schedule = await call("POST", `${P}/scheduled_transactions`, { scheduled_transaction: {
  account_id: accountB.id, transfer_account_id: cardA.id, date_first: "2026-10-26", frequency: "never", amount: -1_234_560, memo: "Card A ending 0000, statement 3 Oct",
} }, scheduleKey);
check("schedule created", schedule.status === 201, schedule);
const scheduleId = schedule.json.data.scheduled_transaction.id;
({ a } = await cyclesFor("2026-10-18"));
check("coverage scheduled", deepEqual(a[0]?.coverage, { state: "scheduled", scheduled_transaction_id: scheduleId, pay_date: "2026-10-26", amount: 1_234_560, funding_account_id: accountB.id }), a[0]);
check("next cycle still unscheduled", a[1]?.coverage?.state === "unscheduled", a[1]);
({ a } = await cyclesFor("2026-10-29"));
check("scheduled is not overdue", a[0]?.coverage?.state === "scheduled", a[0]);
const retried = await call("POST", `${P}/scheduled_transactions`, { scheduled_transaction: {
  account_id: accountB.id, transfer_account_id: cardA.id, date_first: "2026-10-26", frequency: "never", amount: -1_234_560, memo: "Card A ending 0000, statement 3 Oct",
} }, scheduleKey);
check("retried Schedule tap collapses onto the same schedule", retried.json?.data?.scheduled_transaction?.id === scheduleId, retried);

// 9. Materialise on the pay day: posted (unapproved), then approve: paid
const materialised = await call("POST", `${P}/scheduled_transactions/materialize`, { through_date: "2026-10-26" }, `materialise-${run}`);
check("materialised", materialised.status === 200, materialised);
({ a } = await cyclesFor("2026-10-27"));
check("coverage posted", a[0]?.coverage?.state === "posted" && a[0]?.coverage?.approved === false && a[0]?.coverage?.amount === 1_234_560 && a[0]?.coverage?.date === "2026-10-26", a[0]);
const postedId = a[0]?.coverage?.transaction_id;
const approve = await call("PATCH", `${P}/transactions`, { transactions: [{ id: postedId, approved: true }] });
check("approved card-side row", approve.status === 200, approve);
({ a } = await cyclesFor("2026-10-27"));
check("coverage paid", deepEqual(a[0]?.coverage, { state: "paid", transaction_id: postedId, amount: 1_234_560, date: "2026-10-26" }), a[0]);
check("current balance after payment", a[0]?.current_balance === 165_440, a[0]);

// 10. Month-end clamp and previous-working-day rule on Card C
const putC = await call("PUT", `${P}/accounts/${cardC.id}/card_payment_terms`, { card_payment_terms: { statement_day: 31, due_gap_days: 22, due_weekend_rule: "previous", default_amount_rule: "fixed", default_amount_milli: 300_000 } }, `terms-c-${run}`);
check("PUT Card C", putC.status === 200, putC);
let c;
({ c } = await cyclesFor("2026-03-10"));
check("statement 31 clamps to 28 Feb; Sunday 22 Mar moves back to Fri 20 Mar", c[0]?.statement_date === "2026-02-28" && c[0]?.due_date === "2026-03-20" && c[0]?.last_safe_pay_date === "2026-03-18" && c[1]?.statement_date === "2026-03-31" && c[1]?.due_date === "2026-04-22", c);
check("nothing owed: zero minimum, never overdue", c[0]?.statement_balance === 0 && c[0]?.minimum_due === 0, c[0]);
({ c } = await cyclesFor("2028-03-05"));
check("leap year clamps to 29 Feb", c[0]?.statement_date === "2028-02-29", c[0]);
({ c } = await cyclesFor("2026-03-25"));
check("zero balance past due is unscheduled, not overdue", c[0]?.coverage?.state === "unscheduled", c[0]);

// 11. Disabled cards drop out of the view
await call("PUT", `${P}/accounts/${cardC.id}/card_payment_terms`, { card_payment_terms: { statement_day: 31, due_gap_days: 22, due_weekend_rule: "previous", enabled: false } }, `terms-c-off-${run}`);
({ c } = await cyclesFor("2026-03-10"));
check("disabled card has no cycles", c.length === 0, c);

// 12. List and snapshot export
const list = await call("GET", `${P}/card_payment_terms`);
const listed = list.json.data.card_payment_terms.filter((t: any) => t.account_id === cardA.id || t.account_id === cardC.id);
check("list returns both cards", listed.length === 2, list);
const exported = await call("GET", `${P}/export_snapshot`);
const exportedTerms = (exported.json.data.snapshot.card_payment_terms ?? []).filter((t: any) => t.account_id === cardA.id || t.account_id === cardC.id);
check("snapshot carries card_payment_terms", exportedTerms.length === 2 && deepEqual(exportedTerms.find((t: any) => t.account_id === cardA.id), putA.json.data.card_payment_terms), exportedTerms);

// 13. Delete, replay delete, 404 after
const del = await call("DELETE", `${P}/accounts/${cardC.id}/card_payment_terms`, undefined, `terms-c-del-${run}`);
check("DELETE returns removed terms", del.status === 200 && del.json.data.card_payment_terms.account_id === cardC.id && del.json.data.card_payment_terms.enabled === false, del);
const delReplay = await call("DELETE", `${P}/accounts/${cardC.id}/card_payment_terms`, undefined, `terms-c-del-${run}`);
check("DELETE retry replays the receipt", delReplay.status === 200 && deepEqual(delReplay.json.data.card_payment_terms, del.json.data.card_payment_terms), delReplay);
check("GET after delete is 404", (await call("GET", `${P}/accounts/${cardC.id}/card_payment_terms`)).status === 404);
check("second DELETE without key is 404", (await call("DELETE", `${P}/accounts/${cardC.id}/card_payment_terms`)).status === 404);

// 14. Default as_of is today in the configured zone
const today = new Intl.DateTimeFormat("en-CA", { timeZone: expectedZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const defaulted = await call("GET", `${P}/card_payments`);
check(`default as_of is today in ${expectedZone}`, defaulted.json.data.as_of === today, { got: defaulted.json.data.as_of, today });

// 15. D1 only: import the exported snapshot into a second, empty instance
if (d1Mode) {
  const second = d1Server("Asia/Singapore");
  await second.repo.ensurePlan("p");
  const imported = await call("POST", `/v1/plans/p/import_snapshot`, { snapshot: exported.json.data.snapshot }, `import-${run}`, second.base);
  check("snapshot import 201 with card_payment_terms count", imported.status === 201 && imported.json.data.imported.card_payment_terms === 2, imported);
  const back = await call("GET", `/v1/plans/p/accounts/${cardA.id}/card_payment_terms`, undefined, undefined, second.base);
  check("imported terms identical", deepEqual(back.json?.data?.card_payment_terms, putA.json.data.card_payment_terms), back);
  const view2 = await call("GET", `/v1/plans/p/card_payments?as_of=2026-10-27`, undefined, undefined, second.base);
  const a2 = view2.json.data.cycles.find((cy: any) => cy.account_id === cardA.id && cy.cycle === "current");
  check("imported plan derives the same cycle (paid)", a2?.statement_balance === 1_234_560 && a2?.coverage?.state === "paid", a2);
  // Receipts: card terms writes are guarded commands.
  const kinds = primary!.sql.query("SELECT kind, count(*) AS n FROM write_commands WHERE kind LIKE 'card_payment_terms.%' GROUP BY kind ORDER BY kind").all();
  log.push(`write_commands receipts: ${JSON.stringify(kinds)}`);
  check("D1 receipts recorded for put and delete", kinds.length === 2, kinds);
  second.server.stop();
}

primary?.server.stop();
console.log(`mode: ${d1Mode ? "d1 (Worker/local-mode path)" : `bun stack ${base}`}`);
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
await Bun.write(new URL(`./http-log-${d1Mode ? "d1" : "bun"}.txt`, import.meta.url).pathname, log.join("\n\n") + "\n");
process.exit(failures ? 1 : 0);
