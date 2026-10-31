// E2E probe for the transaction `needs_confirmation` marker, driven through
// the real HTTP handler over both storage engines (D1 and SQLite) with
// synthetic data. Run from the repo root:
//   bun .amp/in/artifacts/to-confirm/api-e2e.ts
import { Database } from "bun:sqlite";
import { AsyncReportService } from "../../../../apps/api/src/async-reports";
import { D1AuthStore } from "../../../../apps/api/src/auth-store";
import { D1LedgerRepository } from "../../../../apps/api/src/d1-ledger-repository";
import { createHandler } from "../../../../apps/api/src/http";
import { newSession, passwordCredential } from "../../../../apps/api/src/password-auth";
import { LedgerRepository } from "../../../../apps/api/src/repository";
import { CountingD1Database, fakeD1Binding } from "../../../../apps/api/tests/helpers/counting-d1";

const PLAN = "p";
let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

async function stack(engine: "d1" | "sqlite") {
  const sqlite = new Database(":memory:", { strict: true });
  const dir = new URL("../../../../apps/api/d1-migrations/", import.meta.url).pathname;
  for (const file of [...new Bun.Glob("*.sql").scanSync(dir)].sort()) sqlite.exec(await Bun.file(`${dir}${file}`).text());
  const db = new CountingD1Database(fakeD1Binding(sqlite));
  const session = newSession();
  await new D1AuthStore(db).setup({ userId: "u", username: "owner", credential: await passwordCredential("correct-horse-battery-staple"), session, planId: PLAN });
  const repo = engine === "d1" ? new D1LedgerRepository(db, PLAN) : new LedgerRepository(sqlite, PLAN);
  const handler = createHandler({ repo, reports: new AsyncReportService(db), auth: new D1AuthStore(db), config: { dbPath: "", port: 0, apiToken: "api-token", defaultPlanId: PLAN, transitionReadOnly: false } });
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await handler(new Request(`https://howmuch.test${path}`, {
      method,
      headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() as any };
  };
}

for (const engine of ["d1", "sqlite"] as const) {
  console.log(`\n== ${engine} ==`);
  const api = await stack(engine);
  const card = (await api("POST", `/v1/plans/${PLAN}/accounts`, { account: { name: "Example Card", type: "creditCard", balance: 0 } })).body.data.account;
  const cash = (await api("POST", `/v1/plans/${PLAN}/accounts`, { account: { name: "Example Cash", type: "checking", balance: 0 } })).body.data.account;
  const create = async (extra: Record<string, unknown>) => (await api("POST", `/v1/plans/${PLAN}/transactions`, {
    transaction: { account_id: card.id, date: "2026-10-18", amount: -42100, payee_name: "Example Bistro Tokyo", memo: "JPY 4,900", ...extra },
  })).body.data.transaction;

  const estimated = await create({ needs_confirmation: true });
  check("create with true returns true", estimated.needs_confirmation, true);
  const plain = await create({});
  check("create without field returns false", plain.needs_confirmation, false);
  check("create rejects a string", (await api("POST", `/v1/plans/${PLAN}/transactions`, { transaction: { account_id: card.id, date: "2026-10-18", amount: -1, needs_confirmation: "yes" } })).status, 400);

  const listed = (await api("GET", `/v1/plans/${PLAN}/transactions?type=needs_confirmation`)).body.data.transactions.map((t: any) => t.id);
  check("type filter lists only marked rows", listed, [estimated.id]);
  check("plan count", (await api("GET", `/v1/plans/${PLAN}/transactions/needs_confirmation_count`)).body.data.count, 1);
  check("account count", (await api("GET", `/v1/plans/${PLAN}/accounts/${card.id}/transactions/needs_confirmation_count`)).body.data.count, 1);
  check("other account count", (await api("GET", `/v1/plans/${PLAN}/accounts/${cash.id}/transactions/needs_confirmation_count`)).body.data.count, 0);

  const memoEdit = (await api("PATCH", `/v1/plans/${PLAN}/transactions/${estimated.id}`, { transaction: { memo: "JPY 4,900 dinner", amount: -42500 } })).body.data.transaction;
  check("memo and amount edit keeps the marker", memoEdit.needs_confirmation, true);

  const toggled = (await api("PATCH", `/v1/plans/${PLAN}/transactions/${estimated.id}/cleared`, { expected_cleared: "uncleared", cleared: "cleared" })).body.data.transaction;
  check("cleared toggle confirms", toggled.needs_confirmation, false);
  check("count drops to zero", (await api("GET", `/v1/plans/${PLAN}/transactions/needs_confirmation_count`)).body.data.count, 0);

  const second = await create({ needs_confirmation: true });
  const viaPatch = (await api("PATCH", `/v1/plans/${PLAN}/transactions/${second.id}`, { transaction: { cleared: "cleared" } })).body.data.transaction;
  check("PATCH cleared confirms", viaPatch.needs_confirmation, false);
  const third = await create({ needs_confirmation: true });
  const explicit = (await api("PATCH", `/v1/plans/${PLAN}/transactions/${third.id}`, { transaction: { cleared: "cleared", needs_confirmation: true } })).body.data.transaction;
  check("explicit true with cleared wins", explicit.needs_confirmation, true);
  const unclearAgain = (await api("PATCH", `/v1/plans/${PLAN}/transactions/${third.id}/cleared`, { expected_cleared: "cleared", cleared: "uncleared" })).body.data.transaction;
  check("unclearing leaves the marker alone", unclearAgain.needs_confirmation, true);

  const bulk = (await api("PATCH", `/v1/plans/${PLAN}/transactions`, { transactions: [{ id: plain.id, needs_confirmation: true }, { id: third.id, needs_confirmation: false }] })).body.data.transactions;
  check("collection PATCH sets each row", bulk.map((t: any) => t.needs_confirmation), [true, false]);
  const nulled = (await api("PATCH", `/v1/plans/${PLAN}/transactions/${plain.id}`, { transaction: { needs_confirmation: null } })).body.data.transaction;
  check("null clears the marker", nulled.needs_confirmation, false);

  // Transfers: each side owns its marker.
  const transfer = (await api("POST", `/v1/plans/${PLAN}/transactions`, { transaction: { account_id: cash.id, date: "2026-10-19", amount: -100000, payee_id: card.transfer_payee_id, needs_confirmation: true } })).body.data.transaction;
  const mirrorId = transfer.transfer_transaction_id;
  check("transfer side keeps its marker", transfer.needs_confirmation, true);
  check("mirror starts unmarked", (await api("GET", `/v1/plans/${PLAN}/transactions/${mirrorId}`)).body.data.transaction.needs_confirmation, false);
  await api("PATCH", `/v1/plans/${PLAN}/transactions/${mirrorId}`, { transaction: { needs_confirmation: true } });
  await api("PATCH", `/v1/plans/${PLAN}/transactions/${transfer.id}`, { transaction: { amount: -110000, needs_confirmation: false } });
  check("editing one side keeps the mirror's own marker", (await api("GET", `/v1/plans/${PLAN}/transactions/${mirrorId}`)).body.data.transaction.needs_confirmation, true);

  // Reconcile confirms any cleared row that was still marked.
  // The SQLite engine reconciles only on its own schema (audit FK); see sqlite-reconcile-e2e.ts.
  if (engine === "d1") {
    const marked = await create({ needs_confirmation: true, cleared: "cleared", date: "2026-10-01" });
    check("create cleared with true keeps it", marked.needs_confirmation, true);
    const accountNow = (await api("GET", `/v1/plans/${PLAN}/accounts/${card.id}/reconciliation?statement_date=2026-10-31`)).body.data;
    const reconcile = await api("POST", `/v1/plans/${PLAN}/accounts/${card.id}/reconcile`, { statement_date: "2026-10-31", statement_balance: accountNow.projected_reconciled_balance }, { "idempotency-key": `op-${engine}-reconcile` });
    check("reconcile succeeds", reconcile.status, 200);
    check("reconcile confirms", (await api("GET", `/v1/plans/${PLAN}/transactions/${marked.id}`)).body.data.transaction.needs_confirmation, false);
  }

  // Split parent.
  const split = await create({ needs_confirmation: true, subtransactions: [{ amount: -20000, memo: "a" }, { amount: -22100, memo: "b" }] });
  check("split parent carries the marker", split.needs_confirmation, true);

  // Snapshot export carries it.
  const snapshot = (await api("GET", `/v1/plans/${PLAN}/export_snapshot`)).body.data.snapshot;
  check("snapshot export includes the field", snapshot.transactions.find((t: any) => t.id === split.id)?.needs_confirmation, true);
  check("snapshot export writes false too", snapshot.transactions.find((t: any) => t.id === plain.id)?.needs_confirmation, false);

  check("quick entry accepts it", (await api("POST", `/api/mobile/quick-entry`, { account_id: card.id, amount: "12.30", payee_name: "Example Kiosk", needs_confirmation: true })).body?.data?.transaction?.needs_confirmation ?? "n/a", true);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
