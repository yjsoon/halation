import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

/**
 * Snapshots a local SQLite ledger into `<db dir>/backups/` before an import.
 *
 * The ledger runs in WAL mode, so committed writes can live only in the `-wal`
 * file while the local API holds the database open. Copying the main file
 * alone misses them; `VACUUM INTO` writes one consistent, self-contained copy
 * that includes everything committed so far.
 */
export function backupSqliteDatabase(dbPath: string): string | null {
  if (!existsSync(dbPath)) {
    return null;
  }

  const backupDir = join(dirname(dbPath), "backups");
  mkdirSync(backupDir, { recursive: true });
  const extension = extname(dbPath);
  const name = basename(dbPath, extension);
  const backupPath = join(backupDir, `${name}-${timestampForFileName()}.${extension ? extension.slice(1) : "sqlite"}`);
  const source = new Database(dbPath, { readonly: true });
  try {
    source.run("VACUUM INTO ?", [backupPath]);
  } finally {
    source.close();
  }
  return backupPath;
}

function timestampForFileName(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}
