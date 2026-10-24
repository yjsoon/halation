-- A transaction whose amount is an estimate and still has to be checked
-- against the statement (for example a foreign-currency charge entered at an
-- estimated rate). Additive: rows default to 0 and older Workers ignore it.
ALTER TABLE transactions ADD COLUMN needs_confirmation INTEGER NOT NULL DEFAULT 0;

-- The to-confirm filter and count read only the few marked live rows.
CREATE INDEX IF NOT EXISTS idx_transactions_plan_needs_confirmation
  ON transactions(plan_id, date DESC)
  WHERE deleted = 0 AND needs_confirmation = 1;
