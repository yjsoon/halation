// The SQLite engine's reconcile path on its own (local-dev) schema, which the
// HTTP probe cannot reach because its harness uses the D1 schema.
//   bun .amp/in/artifacts/to-confirm/sqlite-reconcile-e2e.ts
import { openDatabase } from "../../../../apps/api/src/db";
import { LedgerRepository } from "../../../../apps/api/src/repository";

const db = openDatabase(":memory:");
const repo = new LedgerRepository(db, "p");
await repo.ensurePlan("p");
const account = await repo.createAccount("p", { name: "Example Card", type: "creditCard", balance: 0 });
const row = await repo.createTransaction("p", { account_id: account.id, date: "2026-10-01", amount: -42100, cleared: "cleared", needs_confirmation: true });
console.log("before", row.needs_confirmation);
const preview = await repo.getAccountReconciliation("p", account.id, "2026-10-31");
await repo.reconcileAccount("p", account.id, "2026-10-31", preview.projected_reconciled_balance, { operationId: "op-1" });
const after = await repo.getTransaction("p", row.id);
console.log("after", after.cleared, after.needs_confirmation);
process.exit(after.needs_confirmation === false && after.cleared === "reconciled" ? 0 : 1);
