import type { openDatabase } from "../../apps/api/src/db";

type Db = ReturnType<typeof openDatabase>;

export function singleNumber(db: Db, sql: string, ...params: string[]): number {
  const row = db.query(sql).get(...params) as { value: number | bigint } | null;
  return Number(row?.value ?? 0);
}

/** Live row counts and the transaction date range for one plan after an import. */
export function ledgerSummary(db: Db, planId: string) {
  const live = (table: string) =>
    singleNumber(db, `SELECT COUNT(*) AS value FROM ${table} WHERE plan_id = ? AND deleted = 0`, planId);
  const range = db
    .query("SELECT MIN(date) AS first_date, MAX(date) AS last_date FROM transactions WHERE plan_id = ?")
    .get(planId) as { first_date: string | null; last_date: string | null };
  return {
    accounts: live("accounts"),
    payees: live("payees"),
    category_groups: live("category_groups"),
    categories: live("categories"),
    transactions_active: live("transactions"),
    transactions_deleted: singleNumber(
      db,
      "SELECT COUNT(*) AS value FROM transactions WHERE plan_id = ? AND deleted = 1",
      planId,
    ),
    first_date: range.first_date,
    last_date: range.last_date,
  };
}
