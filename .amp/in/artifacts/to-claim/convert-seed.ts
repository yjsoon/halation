// Seeds rows as they were stored before the claim field, for a run of
// scripts/convert-follow-up-memos.ts against the disposable local stack.
// Memo words go straight to SQLite, bypassing the API that would convert them.
//   bun .amp/in/artifacts/to-claim/convert-seed.ts
import { Database } from "bun:sqlite";

const state = JSON.parse(await Bun.file("/tmp/howmuch-verify/current/state.json").text());
const db = new Database(state.db_path);
const headers = { authorization: `Bearer ${state.api_token}`, "content-type": "application/json" };
const base = `${state.api_url}/v1/plans/${state.plan_id}`;
const call = async (method: string, path: string, body?: unknown) =>
  (await (await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })).json()).data;
const store = (id: string, memo: string) =>
  db.run("UPDATE transactions SET memo = ?, claim_status = NULL, claimed_on = NULL, needs_confirmation = 0 WHERE id = ?", [memo, id]);

const accounts = (await call("GET", "/accounts")).accounts.filter((a: any) => !a.closed);
const [from, to] = accounts;
const payee = (await call("GET", "/payees")).payees.find((p: any) => p.transfer_account_id === to.id);
const make = async (fields: Record<string, unknown>) =>
  (await call("POST", "/transactions", { transaction: { account_id: from.id, date: "2026-10-20", amount: -10000, approved: true, ...fields } })).transaction;

const rows: Record<string, string> = {};
for (const [name, memo] of [
  ["todo", "TODO: Example taxi"],
  ["claimed", "CLAIMED - 2026-01-02: Example lunch"],
  ["tocheck", "TOCHECK Example hotel"],
  ["both", "TOCHECK TODO: Example flight"],
  ["claimedBare", "CLAIMED: Example bus"],
  ["prose", "todo dinner"],
  ["setAlready", "TODO: Example notebooks"],
] as const) {
  const row = await make({ payee_name: `Example ${name}`, memo: "seed" });
  store(row.id, memo);
  rows[name] = row.id;
}
db.run("UPDATE transactions SET claim_status = 'to_claim' WHERE id = ?", [rows.setAlready]);

// A transfer pair whose sides share the legacy memo, and one whose sides differ.
for (const [name, memoOut, memoIn] of [
  ["pair", "TODO: Example card top-up", "TODO: Example card top-up"],
  ["pairDiffers", "TODO: Example refund", "Example refund from salary"],
] as const) {
  const out = await make({ payee_id: payee.id, memo: "seed" });
  store(out.id, memoOut);
  store(out.transfer_transaction_id, memoIn);
  rows[`${name}Out`] = out.id;
  rows[`${name}In`] = out.transfer_transaction_id;
}

// A transfer made from a split line: the line owns that side's memo.
const split = await make({ payee_name: "Example split shop", amount: -30000, subtransactions: [
  { amount: -10000, memo: "Example groceries" },
  { amount: -20000, payee_id: payee.id, memo: "TODO: Example transfer line" },
] });
rows.splitLinked = split.subtransactions.find((line: any) => line.transfer_transaction_id).transfer_transaction_id;

console.log(JSON.stringify(rows, null, 2));
