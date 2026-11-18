import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import type { D1Binding, D1Result, D1Statement } from "./d1";

// Bun-only: tests and the YNAB scripts run the production D1 code over a
// local SQLite file through these. The Worker and the iOS engine never import
// this module.

const MIGRATIONS = new URL("../d1-migrations/", import.meta.url).pathname;

/**
 * Opens a SQLite database with the D1 schema, applying every D1 migration it
 * has not recorded yet in `d1_migrations` (the table Wrangler uses locally).
 */
export function openD1Sqlite(path = ":memory:"): Database {
  const db = new Database(path, { create: true, strict: true });
  if (db.query("SELECT 1 FROM sqlite_master WHERE name = 'schema_migrations'").get()) {
    db.close();
    throw new Error(`${path} is a ledger from the old local SQLite server, not a D1 database`);
  }
  applyD1Migrations(db);
  // D1 enforces foreign keys. Turned on after the migrations, whose table
  // rebuilds would otherwise cascade deletes through existing rows.
  db.run("PRAGMA foreign_keys = ON");
  return db;
}

export function applyD1Migrations(db: Database): void {
  db.run("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const applied = new Set((db.query("SELECT name FROM d1_migrations").all() as Array<{ name: string }>).map((row) => row.name));
  for (const name of readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue;
    db.transaction(() => {
      db.exec(readFileSync(`${MIGRATIONS}${name}`, "utf8"));
      db.run("INSERT INTO d1_migrations (name) VALUES (?)", [name]);
    })();
  }
}

/** A Cloudflare D1 binding backed by a local `bun:sqlite` database. */
export function sqliteD1Binding(db: Database): D1Binding {
  class Statement implements D1Statement {
    values: unknown[] = [];
    constructor(readonly sql: string) {}
    bind(...values: unknown[]) {
      this.values = values;
      return this;
    }
    async all<Row>(): Promise<D1Result<Row>> {
      return { success: true, results: db.query(this.sql).all(...(this.values as any[])) as Row[] };
    }
    async first<Row>(): Promise<Row | null> {
      return db.query(this.sql).get(...(this.values as any[])) as Row | null;
    }
    async run(): Promise<D1Result> {
      const result = db.query(this.sql).run(...(this.values as any[]));
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  }
  return {
    prepare: (sql) => new Statement(sql),
    // D1 runs each batch atomically and one at a time, so nothing here awaits:
    // concurrent requests cannot interleave inside another's transaction.
    batch: async <Row>(statements: D1Statement[]) => db.transaction(() => statements.map((statement) => {
      const { sql, values } = statement as Statement;
      const query = db.query(sql);
      if (/^\s*(SELECT|WITH)\b/i.test(sql)) return { success: true, results: query.all(...(values as any[])) as Row[] };
      return { success: true, meta: { changes: Number(query.run(...(values as any[])).changes) } } as D1Result<Row>;
    })).immediate(),
  };
}
