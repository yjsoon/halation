import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveAccountPresentation } from "./account-icon";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

export function openDatabase(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path);
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");
  applyMigrations(db);
  return db;
}

export function applyMigrations(db: Database): void {
  db.run("PRAGMA foreign_keys = ON");
  db.run(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );

  const migrations: Array<{
    version: string;
    path: string;
    rebuildsForeignKeyTarget?: boolean;
  }> = [
    {
      version: "001_initial",
      path: join(migrationsDir, "001_initial.sql"),
    },
    {
      version: "002_transaction_server_knowledge",
      path: join(migrationsDir, "002_transaction_server_knowledge.sql"),
    },
    {
      version: "003_transfer_payees",
      path: join(migrationsDir, "003_transfer_payees.sql"),
    },
    {
      version: "004_auth_foundation",
      path: join(migrationsDir, "004_auth_foundation.sql"),
    },
    {
      version: "005_password_auth",
      path: join(migrationsDir, "005_password_auth.sql"),
    },
    {
      version: "006_allow_duplicate_payee_names",
      path: join(migrationsDir, "006_allow_duplicate_payee_names.sql"),
      rebuildsForeignKeyTarget: true,
    },
    {
      version: "007_ynab_raw_objects",
      path: join(migrationsDir, "007_ynab_raw_objects.sql"),
    },
    {
      version: "008_plan_month_assignments",
      path: join(migrationsDir, "008_plan_month_assignments.sql"),
    },
    {
      version: "009_plan_month_category_targets",
      path: join(migrationsDir, "009_plan_month_category_targets.sql"),
    },
    {
      version: "010_scheduled_transaction_edits",
      path: join(migrationsDir, "010_scheduled_transaction_edits.sql"),
    },
    {
      version: "011_scheduled_transaction_snapshot_assertions",
      path: join(migrationsDir, "011_scheduled_transaction_snapshot_assertions.sql"),
    },
    {
      version: "012_account_reconciliation_assertions",
      path: join(migrationsDir, "012_account_reconciliation_assertions.sql"),
    },
    {
      version: "013_unique_live_import_id",
      path: join(migrationsDir, "013_unique_live_import_id.sql"),
    },
    {
      version: "014_personal_api_tokens",
      path: join(migrationsDir, "014_personal_api_tokens.sql"),
    },
    {
      version: "015_account_preferences",
      path: join(migrationsDir, "015_account_preferences.sql"),
    },
    {
      version: "016_account_icons",
      path: join(migrationsDir, "016_account_icons.sql"),
    },
    {
      version: "017_account_icon_emoji_backfill",
      path: join(migrationsDir, "017_account_icon_emoji_backfill.sql"),
    },
    {
      version: "018_rewards_tracker",
      path: join(migrationsDir, "018_rewards_tracker.sql"),
    },
    {
      version: "019_query_covering_indexes",
      path: join(migrationsDir, "019_query_covering_indexes.sql"),
    },
    {
      version: "020_ynab_source_month_activity",
      path: join(migrationsDir, "020_ynab_source_month_activity.sql"),
    },
    {
      version: "021_account_month_balances",
      path: join(migrationsDir, "021_account_month_balances.sql"),
    },
    {
      version: "022_own_imported_ynab_schedules",
      path: join(migrationsDir, "022_own_imported_ynab_schedules.sql"),
    },
    {
      version: "023_drop_budgeting_tables",
      path: join(migrationsDir, "023_drop_budgeting_tables.sql"),
    },
  ];

  // The previous runner recorded 017 but ran the JS backfill after the
  // migrations on every start, leaving no record of it. Such a plan has had
  // it, so only record it: any emoji names since are the user's. (A start that
  // crashed before the backfill was finished by the next start on that build,
  // and the read path splits a leading emoji for display either way.)
  const applied = new Set(
    (db.query("SELECT version FROM schema_migrations").all() as Array<{ version: string }>).map((row) => row.version),
  );
  if (applied.has(ICON_EMOJI_MIGRATION) && !applied.has(PRESENTATION_BACKFILL_RECORD)) {
    db.query("INSERT INTO schema_migrations (version) VALUES (?)").run(PRESENTATION_BACKFILL_RECORD);
  }

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }

    const sql = readFileSync(migration.path, "utf8");
    if (migration.rebuildsForeignKeyTarget) db.run("PRAGMA foreign_keys = OFF");
    try {
      db.transaction(() => {
        // bun:sqlite reports an error from the last statement of a multi-statement
        // string only when nothing but the semicolon follows it, so a trailing
        // newline would hide a failing final statement (a migration's own
        // consistency check).
        db.run(sql.trimEnd());
        // The JS half of 017, in the same transaction so an interrupted upgrade
        // retries it. It must never run again later: by then a leading emoji in
        // a name is one the user typed on purpose.
        if (migration.version === ICON_EMOJI_MIGRATION) {
          backfillAccountPresentations(db);
          db.query("INSERT INTO schema_migrations (version) VALUES (?)").run(PRESENTATION_BACKFILL_RECORD);
        }
        db.query("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
      })();
    } finally {
      if (migration.rebuildsForeignKeyTarget) db.run("PRAGMA foreign_keys = ON");
    }

    if (migration.rebuildsForeignKeyTarget && db.query("PRAGMA foreign_key_check").all().length) {
      throw new Error(`Migration ${migration.version} introduced foreign-key violations`);
    }
  }

}

const ICON_EMOJI_MIGRATION = "017_account_icon_emoji_backfill";
/** Recorded with the JS backfill. Not a migration file. */
const PRESENTATION_BACKFILL_RECORD = "017_account_presentation_backfill";

function backfillAccountPresentations(db: Database): void {
  const hasIcon = db.query("SELECT 1 AS ok FROM pragma_table_info('accounts') WHERE name='icon'").get();
  if (!hasIcon) return;

  const accounts = db.query(
    "SELECT id, name, icon, type FROM accounts WHERE deleted = 0",
  ).all() as Array<{ id: string; name: string; icon: string; type: string | null }>;

  for (const account of accounts) {
    const presentation = resolveAccountPresentation({
      name: account.name,
      existingIcon: account.icon,
      type: account.type,
    });
    if (presentation.name === account.name && presentation.icon === account.icon) continue;
    db.query("UPDATE accounts SET name = ?, icon = ? WHERE id = ?").run(
      presentation.name,
      presentation.icon,
      account.id,
    );
  }

  db.run(`
    UPDATE payees
    SET
      name = 'Transfer : ' || (SELECT a.name FROM accounts a WHERE a.id = payees.transfer_account_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE deleted = 0
      AND transfer_account_id IS NOT NULL
      AND name LIKE 'Transfer : %'
      AND EXISTS (
        SELECT 1 FROM accounts a
        WHERE a.id = payees.transfer_account_id
          AND payees.name <> 'Transfer : ' || a.name
      )
  `);
}
