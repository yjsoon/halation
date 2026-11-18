import { describe, expect, test } from "bun:test";
import { openD1Sqlite } from "../src/sqlite-d1";

describe("D1 schema", () => {
  test("personal API tokens enforce hashed secrets and cascade with their user", () => {
    const db = openD1Sqlite();
    try {
      db.run("INSERT INTO users(id,display_name) VALUES ('owner','Owner')");
      const hash = "a".repeat(64);
      db.run("INSERT INTO personal_api_tokens(id,user_id,name,token_hash) VALUES ('one','owner','Home server',?)", [hash]);
      expect(() => db.run(
        "INSERT INTO personal_api_tokens(id,user_id,name,token_hash) VALUES ('two','owner','Duplicate',?)",
        [hash],
      )).toThrow();
      expect(() => db.run(
        "INSERT INTO personal_api_tokens(id,user_id,name,token_hash) VALUES ('bad','owner','Bad hash',?)",
        ["A".repeat(64)],
      )).toThrow();
      db.run("DELETE FROM users WHERE id='owner'");
      expect(db.query("SELECT id FROM personal_api_tokens").get()).toBeNull();
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  test("query indexes serve transfer-graph and live register lookups", () => {
    const db = openD1Sqlite();
    try {
      db.run("INSERT INTO plans(id,name) VALUES ('p','Plan')");
      db.run("INSERT INTO accounts(id,plan_id,name) VALUES ('a','p','Cash')");
      const detail = (sql: string) => JSON.stringify(db.query(`EXPLAIN QUERY PLAN ${sql}`).all());
      expect(detail("SELECT * FROM transactions WHERE transfer_transaction_id = 'x' AND deleted = 0")).toContain("idx_transactions_transfer_transaction_id");
      expect(detail("SELECT t.id FROM transactions t WHERE t.plan_id = 'p' AND t.deleted = 0 ORDER BY t.date DESC, t.created_at DESC, t.id DESC LIMIT 51")).toContain("idx_transactions_plan_live_register");
      expect(detail("SELECT t.id FROM transactions t WHERE t.account_id = 'a' AND t.deleted = 0 ORDER BY t.date DESC, t.created_at DESC, t.id DESC LIMIT 51")).toContain("idx_transactions_account_live_register");
      expect(detail("SELECT MAX(date) FROM transactions WHERE account_id = 'a' AND deleted = 0 AND cleared = 'reconciled'")).toContain("idx_transactions_account_reconciled_date");
      expect(detail("SELECT id, name, transfer_account_id, deleted FROM payees WHERE plan_id = 'p' AND deleted = 0 ORDER BY name")).toContain("idx_payees_plan_live_name");
      // The aggregate triggers recompute one account-month on every ledger
      // write, so that lookup must be a seek, never a scan.
      expect(detail(`SELECT SUM(t.amount_milli) FROM transactions t
        WHERE t.plan_id = 'p' AND t.account_id = 'a' AND t.deleted = 0
          AND t.date >= '2026-01-01' AND t.date < '2026-02-01'`)).toContain("idx_transactions_account_live_register");
    } finally {
      db.close();
    }
  });
});
