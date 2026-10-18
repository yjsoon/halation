-- Credit card payment terms: one row per card account in a plan.
--
-- Only what cannot be derived is stored. The statement date, due date,
-- statement balance, minimum due and payment coverage are computed by
-- `apps/api/src/card-payments.ts` from these terms, the register and the
-- plan's schedules, so the Worker, the Bun server and the phone agree.
--
-- `statement_day` 29 to 31 is clamped to the month's last day. Snooze and
-- per-cycle overrides are not stored here (snooze is phone-side in v1).
--
-- Additive only: the running Worker ignores this table, so the migration can
-- be applied before the Worker that reads it is deployed.
CREATE TABLE IF NOT EXISTS card_payment_terms (
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  statement_day INTEGER NOT NULL CHECK (statement_day BETWEEN 1 AND 31),
  due_gap_days INTEGER NOT NULL DEFAULT 25 CHECK (due_gap_days BETWEEN 1 AND 60),
  due_weekend_rule TEXT NOT NULL DEFAULT 'next' CHECK (due_weekend_rule IN ('next', 'previous')),
  default_funding_account_id TEXT REFERENCES accounts(id),
  default_amount_rule TEXT NOT NULL DEFAULT 'statement'
    CHECK (default_amount_rule IN ('statement', 'minimum', 'fixed')),
  default_amount_milli INTEGER,
  minimum_floor_milli INTEGER NOT NULL DEFAULT 50000 CHECK (minimum_floor_milli >= 0),
  minimum_rate_bp INTEGER NOT NULL DEFAULT 300 CHECK (minimum_rate_bp BETWEEN 0 AND 10000),
  pay_days_before_due INTEGER NOT NULL DEFAULT 2 CHECK (pay_days_before_due BETWEEN 0 AND 10),
  lead_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_days BETWEEN 0 AND 30),
  delivery_hour INTEGER NOT NULL DEFAULT 8 CHECK (delivery_hour BETWEEN 0 AND 23),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (plan_id, account_id),
  CHECK (default_amount_rule <> 'fixed' OR (default_amount_milli IS NOT NULL AND default_amount_milli > 0))
);

CREATE INDEX IF NOT EXISTS idx_card_payment_terms_plan ON card_payment_terms(plan_id, enabled);

-- Same-plan ownership, in the style of the scheduled-transaction guards: the
-- card and the funding account must be live accounts of the row's plan, and a
-- card cannot fund itself.
CREATE TRIGGER card_payment_terms_ownership_guard BEFORE INSERT ON card_payment_terms
WHEN NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.id = NEW.account_id AND a.plan_id = NEW.plan_id AND a.deleted = 0
  ) OR (NEW.default_funding_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.id = NEW.default_funding_account_id AND a.plan_id = NEW.plan_id
      AND a.deleted = 0 AND a.id <> NEW.account_id
  ))
BEGIN SELECT RAISE(ABORT, 'card payment terms ownership failed'); END;

CREATE TRIGGER card_payment_terms_ownership_update_guard
BEFORE UPDATE OF plan_id, account_id, default_funding_account_id ON card_payment_terms
WHEN NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.id = NEW.account_id AND a.plan_id = NEW.plan_id AND a.deleted = 0
  ) OR (NEW.default_funding_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.id = NEW.default_funding_account_id AND a.plan_id = NEW.plan_id
      AND a.deleted = 0 AND a.id <> NEW.account_id
  ))
BEGIN SELECT RAISE(ABORT, 'card payment terms ownership failed'); END;
