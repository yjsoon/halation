// E2E probe for the stored "To claim" flag (`claim_status` / `claimed_on`)
// and the memo words older clients write (TODO, CLAIMED - day, TOCHECK),
// driven through the real HTTP handler over both storage engines (D1 and
// SQLite) with synthetic data. Run from the repo root:
//   bun .amp/in/artifacts/to-claim/api-e2e.ts
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
const claim = (t: any) => ({ memo: t.memo, claim_status: t.claim_status, claimed_on: t.claimed_on });

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
  const post = (extra: Record<string, unknown>) => api("POST", `/v1/plans/${PLAN}/transactions`, {
    transaction: { account_id: card.id, date: "2026-10-18", amount: -12340, payee_name: "Example Taxi", ...extra },
  });
  const create = async (extra: Record<string, unknown>) => (await post(extra)).body.data.transaction;
  const patch = async (id: string, transaction: Record<string, unknown>) =>
    (await api("PATCH", `/v1/plans/${PLAN}/transactions/${id}`, { transaction })).body.data.transaction;
  const get = async (id: string) => (await api("GET", `/v1/plans/${PLAN}/transactions/${id}`)).body.data.transaction;

  // Memo words written by older clients become flags.
  const todo = await create({ memo: "TODO: Airport taxi" });
  check("TODO: memo becomes to_claim", claim(todo), { memo: "Airport taxi", claim_status: "to_claim", claimed_on: null });
  const both = await create({ memo: "TOCHECK TODO Hotel deposit" });
  check("TOCHECK then TODO sets both", [claim(both), both.needs_confirmation], [{ memo: "Hotel deposit", claim_status: "to_claim", claimed_on: null }, true]);
  const bare = await create({ memo: "TODO" });
  check("bare TODO leaves no memo", claim(bare), { memo: null, claim_status: "to_claim", claimed_on: null });
  const plain = await create({ memo: "Todos los dias cafe" });
  check("a word that only starts with todo is text", claim(plain), { memo: "Todos los dias cafe", claim_status: null, claimed_on: null });
  const prose = await create({ memo: "Todo list app" });
  check("mixed-case todo without a colon is prose", claim(prose), { memo: "Todo list app", claim_status: null, claimed_on: null });
  const lowerBare = await create({ memo: "todo" });
  check("a bare lower-case todo is prose", claim(lowerBare), { memo: "todo", claim_status: null, claimed_on: null });
  const lowerColon = await create({ memo: "todo: parking" });
  check("any case with a colon is a word", claim(lowerColon), { memo: "parking", claim_status: "to_claim", claimed_on: null });
  const claimedProse = await create({ memo: "Claimed back from Sam" });
  check("Claimed in prose is text", claim(claimedProse), { memo: "Claimed back from Sam", claim_status: null, claimed_on: null });
  const tocheckProse = await create({ memo: "Tocheck later" });
  check("mixed-case Tocheck without a colon is text", [tocheckProse.memo, tocheckProse.needs_confirmation], ["Tocheck later", false]);
  const middle = await create({ memo: "Lunch TODO later" });
  check("a word later in the memo is text", claim(middle), { memo: "Lunch TODO later", claim_status: null, claimed_on: null });
  const explicit = await create({ memo: "TODO: Taxi", claim_status: null });
  check("an explicit field wins over the word", claim(explicit), { memo: "Taxi", claim_status: null, claimed_on: null });
  const flagged = await create({ memo: "Team lunch", claim_status: "to_claim" });
  check("create with the field", claim(flagged), { memo: "Team lunch", claim_status: "to_claim", claimed_on: null });
  check("create rejects an unknown status", (await post({ claim_status: "pending" })).status, 400);
  check("create rejects a bad day", (await post({ claim_status: "claimed", claimed_on: "24/10/2026" })).status, 400);

  // The claims tool marks claimed by rewriting the memo.
  const claimed = await patch(todo.id, { memo: "CLAIMED - 2026-10-24: Airport taxi" });
  check("CLAIMED - day memo marks claimed", claim(claimed), { memo: "Airport taxi", claim_status: "claimed", claimed_on: "2026-10-24" });
  const memoOnly = await patch(todo.id, { memo: "Airport taxi to hotel" });
  check("a memo edit keeps the claim", claim(memoOnly), { memo: "Airport taxi to hotel", claim_status: "claimed", claimed_on: "2026-10-24" });
  const reclaim = await patch(todo.id, { claim_status: "to_claim" });
  check("back to to_claim drops the day", claim(reclaim), { memo: "Airport taxi to hotel", claim_status: "to_claim", claimed_on: null });
  const viaFields = await patch(todo.id, { claim_status: "claimed", claimed_on: "2026-10-25" });
  check("claimed via fields", claim(viaFields), { memo: "Airport taxi to hotel", claim_status: "claimed", claimed_on: "2026-10-25" });
  const cleared = await patch(todo.id, { claim_status: null });
  check("null clears the claim", claim(cleared), { memo: "Airport taxi to hotel", claim_status: null, claimed_on: null });
  const amountEdit = await patch(flagged.id, { amount: -15000, cleared: "cleared" });
  check("amount and cleared edits keep the claim", amountEdit.claim_status, "to_claim");

  // Filters and counts.
  const listed = (await api("GET", `/v1/plans/${PLAN}/transactions?type=to_claim`)).body.data.transactions.map((t: any) => t.id).sort();
  check("type=to_claim lists only rows to claim", listed, [both.id, bare.id, flagged.id, lowerColon.id].sort());
  check("plan count", (await api("GET", `/v1/plans/${PLAN}/transactions/to_claim_count`)).body.data.count, 4);
  check("account count", (await api("GET", `/v1/plans/${PLAN}/accounts/${card.id}/transactions/to_claim_count`)).body.data.count, 4);
  check("other account count", (await api("GET", `/v1/plans/${PLAN}/accounts/${cash.id}/transactions/to_claim_count`)).body.data.count, 0);

  // Collection PATCH (the claims tool's bulk path).
  const bulk = (await api("PATCH", `/v1/plans/${PLAN}/transactions`, { transactions: [
    { id: both.id, memo: "CLAIMED - 2026-10-26: Hotel deposit" },
    { id: bare.id, memo: "CLAIMED: Taxi" },
  ] })).body.data.transactions;
  check("collection PATCH marks each row", bulk.map(claim), [
    { memo: "Hotel deposit", claim_status: "claimed", claimed_on: "2026-10-26" },
    { memo: "Taxi", claim_status: "claimed", claimed_on: null },
  ]);
  check("type=claimed lists claimed rows", (await api("GET", `/v1/plans/${PLAN}/transactions?type=claimed`)).body.data.transactions.length, 2);

  // Transfers: the pair holds one claim, as it holds one memo.
  const transfer = await create({ account_id: cash.id, amount: -50000, payee_id: card.transfer_payee_id, payee_name: undefined, memo: "TODO: Card top-up" });
  const mirrorId = transfer.transfer_transaction_id;
  check("transfer side carries the claim", claim(transfer), { memo: "Card top-up", claim_status: "to_claim", claimed_on: null });
  check("other side takes the same claim", claim(await get(mirrorId)), { memo: "Card top-up", claim_status: "to_claim", claimed_on: null });
  await patch(mirrorId, { claim_status: "claimed", claimed_on: "2026-10-27" });
  check("claiming the inflow side claims the pair", claim(await get(transfer.id)), { memo: "Card top-up", claim_status: "claimed", claimed_on: "2026-10-27" });
  await patch(transfer.id, { amount: -60000 });
  check("an edit that leaves the claim alone keeps it on both sides", [claim(await get(transfer.id)), claim(await get(mirrorId))].map((c) => c.claim_status), ["claimed", "claimed"]);
  await patch(transfer.id, { claim_status: null });
  check("clearing one side clears the pair", [claim(await get(transfer.id)).claim_status, claim(await get(mirrorId)).claim_status], [null, null]);
  await patch(mirrorId, { needs_confirmation: true });
  check("To confirm stays each side's own", [(await get(transfer.id)).needs_confirmation, (await get(mirrorId)).needs_confirmation], [false, true]);

  // A schedule's memo words become fields on each occurrence.
  const schedule = (await api("POST", `/v1/plans/${PLAN}/scheduled_transactions`, { scheduled_transaction: {
    account_id: card.id, date_first: "2026-10-19", frequency: "monthly", amount: -45000, memo: "TODO: Phone bill",
  } }, { "idempotency-key": `op-${engine}-schedule` })).body.data.scheduled_transaction;
  const occurrence = (await api("POST", `/v1/plans/${PLAN}/scheduled_transactions/${schedule.id}/materialize`, { occurrence_date: "2026-10-19", date: "2026-10-19" }, { "idempotency-key": `op-${engine}-occurrence` })).body.data?.transaction;
  check("scheduled occurrence takes the claim from its memo", occurrence && claim(occurrence), { memo: "Phone bill", claim_status: "to_claim", claimed_on: null });

  // Split lines keep their memos; only the parent memo is read.
  const split = await create({ memo: "TODO: Conference", subtransactions: [{ amount: -10000, memo: "TODO: ticket" }, { amount: -2340, memo: "snacks" }] });
  check("split parent claim", claim(split), { memo: "Conference", claim_status: "to_claim", claimed_on: null });
  check("split line memo untouched", split.subtransactions.map((s: any) => s.memo).sort(), ["TODO: ticket", "snacks"]);

  // Quick entry.
  const quick = (await api("POST", `/api/mobile/quick-entry`, { account_id: card.id, amount: "12.30", payee_name: "Example Kiosk", memo: "TOCHECK Coffee", claim_status: "to_claim" })).body?.data?.transaction;
  check("quick entry takes the field and the word", [quick?.claim_status, quick?.needs_confirmation, quick?.memo], ["to_claim", true, "Coffee"]);

  // Snapshots carry it both ways.
  const snapshot = (await api("GET", `/v1/plans/${PLAN}/export_snapshot`)).body.data.snapshot;
  const exported = snapshot.transactions.find((t: any) => t.id === both.id);
  check("snapshot export includes the fields", [exported?.claim_status, exported?.claimed_on], ["claimed", "2026-10-26"]);
  const fresh = await stack(engine);
  const imported = await fresh("POST", `/v1/plans/${PLAN}/import_snapshot`, { snapshot }, { "idempotency-key": `op-${engine}-snapshot` });
  check("snapshot import succeeds", imported.status, 201);
  const back = await fresh("GET", `/v1/plans/${PLAN}/transactions/${both.id}`);
  check("snapshot import keeps the claim", claim(back.body.data.transaction), { memo: "Hotel deposit", claim_status: "claimed", claimed_on: "2026-10-26" });
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
