-- A receipt to claim back (to_claim) or one already claimed (claimed), set by
-- the user or the claims tool. Replaces the old TODO / CLAIMED memo words.
-- Additive: rows default to null and older Workers ignore it.
ALTER TABLE transactions ADD COLUMN claim_status TEXT CHECK (claim_status IN ('to_claim', 'claimed'));
-- The day the claims tool billed it (YYYY-MM-DD), when known.
ALTER TABLE transactions ADD COLUMN claimed_on TEXT;

-- The to-claim filter and count read only the few marked live rows.
CREATE INDEX IF NOT EXISTS idx_transactions_plan_to_claim
  ON transactions(plan_id, date DESC)
  WHERE deleted = 0 AND claim_status = 'to_claim';
