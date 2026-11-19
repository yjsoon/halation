-- Payee defaults (the category and per-account flag colour a new transaction
-- to a payee usually gets) read a payee's few most recent live rows by the
-- payee name each row carries: on D1 a payee typed by name has no payee id.
CREATE INDEX IF NOT EXISTS idx_transactions_payee_name_recent
  ON transactions(plan_id, payee_name_snapshot COLLATE NOCASE, account_id, date DESC, created_at DESC)
  WHERE deleted = 0;
