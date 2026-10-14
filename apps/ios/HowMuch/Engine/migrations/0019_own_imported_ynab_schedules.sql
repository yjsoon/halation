ALTER TABLE plans ADD COLUMN ynab_sourced INTEGER NOT NULL DEFAULT 0 CHECK (ynab_sourced IN (0, 1));

UPDATE plans SET ynab_sourced = 1
WHERE EXISTS (
  SELECT 1 FROM ynab_raw_objects r
  WHERE r.plan_id = plans.id AND r.object_type = 'month'
);

DROP TRIGGER IF EXISTS scheduled_transaction_edits_source_guard;
DROP TRIGGER IF EXISTS scheduled_transaction_edits_source_update_guard;
DROP TRIGGER IF EXISTS scheduled_transaction_snapshot_assertions_guard;
DROP TRIGGER IF EXISTS scheduled_transaction_edits_ownership_guard;
DROP TRIGGER IF EXISTS scheduled_subtransaction_edits_ownership_guard;

CREATE TRIGGER scheduled_transaction_snapshot_assertions_guard
BEFORE INSERT ON scheduled_transaction_snapshot_assertions
WHEN NEW.source <> 'edit' OR NOT EXISTS (
  SELECT 1 FROM scheduled_transaction_edits e
  WHERE e.plan_id = NEW.plan_id
    AND e.id = NEW.scheduled_transaction_id
    AND e.payload_json = NEW.payload_json
    AND e.deleted = NEW.deleted
    AND COALESCE((
      SELECT json_group_array(payload_json)
      FROM (
        SELECT payload_json FROM scheduled_subtransaction_edits
        WHERE plan_id = NEW.plan_id AND scheduled_transaction_id = NEW.scheduled_transaction_id
        ORDER BY id
      )
    ), '[]') = NEW.subtransactions_json
)
BEGIN SELECT RAISE(ABORT, 'stale scheduled transaction'); END;

CREATE TRIGGER scheduled_transaction_edits_ownership_guard BEFORE INSERT ON scheduled_transaction_edits
WHEN NEW.origin = 'howmuch-local' AND (
  NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = NEW.account_id AND a.plan_id = NEW.plan_id AND a.deleted = 0)
  OR (NEW.payee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payees p WHERE p.id = NEW.payee_id AND p.plan_id = NEW.plan_id AND p.deleted = 0))
  OR (NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.plan_id = NEW.plan_id AND c.deleted = 0))
  OR (NEW.transfer_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = NEW.transfer_account_id AND a.plan_id = NEW.plan_id AND a.deleted = 0))
)
BEGIN SELECT RAISE(ABORT, 'scheduled transaction ownership failed'); END;

CREATE TRIGGER scheduled_subtransaction_edits_ownership_guard BEFORE INSERT ON scheduled_subtransaction_edits
WHEN EXISTS (
    SELECT 1 FROM scheduled_transaction_edits e
    WHERE e.plan_id = NEW.plan_id AND e.id = NEW.scheduled_transaction_id AND e.origin = 'howmuch-local'
  ) AND (
    (NEW.payee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payees p WHERE p.id = NEW.payee_id AND p.plan_id = NEW.plan_id AND p.deleted = 0))
    OR (NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.plan_id = NEW.plan_id AND c.deleted = 0))
    OR (NEW.transfer_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = NEW.transfer_account_id AND a.plan_id = NEW.plan_id AND a.deleted = 0))
  )
BEGIN SELECT RAISE(ABORT, 'scheduled subtransaction ownership failed'); END;

INSERT INTO scheduled_transaction_edits
  (plan_id, id, origin, payload_json, account_id, date_first, date_next, frequency, amount_milli,
   payee_id, category_id, transfer_account_id, deleted, created_at, updated_at)
SELECT
  r.plan_id,
  r.object_id,
  'ynab-overlay',
  r.payload_json,
  json_extract(r.payload_json, '$.account_id'),
  json_extract(r.payload_json, '$.date_first'),
  json_extract(r.payload_json, '$.date_next'),
  json_extract(r.payload_json, '$.frequency'),
  CAST(json_extract(r.payload_json, '$.amount') AS INTEGER),
  (SELECT p.id FROM payees p WHERE p.id = json_extract(r.payload_json, '$.payee_id')),
  (SELECT c.id FROM categories c WHERE c.id = json_extract(r.payload_json, '$.category_id')),
  (SELECT a.id FROM accounts a WHERE a.id = json_extract(r.payload_json, '$.transfer_account_id')),
  r.deleted,
  'ynab-schedule-copy',
  r.updated_at
FROM ynab_raw_objects r
WHERE r.object_type = 'scheduled_transaction'
  AND NOT EXISTS (
    SELECT 1 FROM scheduled_transaction_edits e
    WHERE e.plan_id = r.plan_id AND e.id = r.object_id
  );

INSERT INTO scheduled_subtransaction_edits
  (plan_id, id, scheduled_transaction_id, payload_json, amount_milli,
   payee_id, category_id, transfer_account_id, created_at, updated_at)
SELECT
  s.plan_id,
  COALESCE(json_extract(s.payload_json, '$.id'), s.object_id),
  json_extract(s.payload_json, '$.scheduled_transaction_id'),
  s.payload_json,
  CAST(json_extract(s.payload_json, '$.amount') AS INTEGER),
  (SELECT p.id FROM payees p WHERE p.id = json_extract(s.payload_json, '$.payee_id')),
  (SELECT c.id FROM categories c WHERE c.id = json_extract(s.payload_json, '$.category_id')),
  (SELECT a.id FROM accounts a WHERE a.id = json_extract(s.payload_json, '$.transfer_account_id')),
  s.updated_at,
  s.updated_at
FROM ynab_raw_objects s
JOIN scheduled_transaction_edits e
  ON e.plan_id = s.plan_id
 AND e.id = json_extract(s.payload_json, '$.scheduled_transaction_id')
 AND e.created_at = 'ynab-schedule-copy'
WHERE s.object_type = 'scheduled_subtransaction'
  AND COALESCE(json_extract(s.payload_json, '$.deleted'), 0) = 0;

UPDATE scheduled_transaction_edits SET created_at = updated_at WHERE created_at = 'ynab-schedule-copy';

-- 4. Refuse to finish with a mirrored schedule or live line that has no owned
-- row. Keep this the last statement: some runners report only the last
-- statement's error, so an earlier INSERT that failed is caught here by its
-- effect. It sets an impossible `ynab_sourced` value, which the column's CHECK
-- rejects, only if something was missed; otherwise it matches no row. A failure
-- aborts and rolls back the whole migration.
--
-- A schedule copied above is recognisable by its payload equal to the mirror's
-- and its timestamps equal to the mirror row's; an overlay written by the app
-- has a later `updated_at`, so its own set of lines is not second-guessed.
UPDATE plans SET ynab_sourced = 2
WHERE EXISTS (
  SELECT 1 FROM ynab_raw_objects r
  WHERE r.object_type = 'scheduled_transaction'
    AND NOT EXISTS (
      SELECT 1 FROM scheduled_transaction_edits e
      WHERE e.plan_id = r.plan_id AND e.id = r.object_id
    )
)
OR EXISTS (
  SELECT 1 FROM ynab_raw_objects s
  JOIN ynab_raw_objects r
    ON r.plan_id = s.plan_id AND r.object_type = 'scheduled_transaction'
   AND r.object_id = json_extract(s.payload_json, '$.scheduled_transaction_id')
  JOIN scheduled_transaction_edits e
    ON e.plan_id = r.plan_id AND e.id = r.object_id
   AND e.payload_json = r.payload_json
   AND e.updated_at = r.updated_at
   AND e.created_at = e.updated_at
  WHERE s.object_type = 'scheduled_subtransaction'
    AND COALESCE(json_extract(s.payload_json, '$.deleted'), 0) = 0
    AND NOT EXISTS (
      SELECT 1 FROM scheduled_subtransaction_edits l
      WHERE l.plan_id = s.plan_id
        AND l.scheduled_transaction_id = e.id
        AND l.id = COALESCE(json_extract(s.payload_json, '$.id'), s.object_id)
    )
);
