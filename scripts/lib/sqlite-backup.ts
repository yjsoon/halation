import { Database } from "bun:sqlite";
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const directory = lstatSync(backupDir);
  if (!directory.isDirectory() || directory.uid !== process.getuid?.()) {
    throw new Error("Backup directory must be a directory owned by the current user");
  }
  chmodSync(backupDir, 0o700);
  const extension = extname(dbPath);
  const name = basename(dbPath, extension);
  const backupPath = join(backupDir, `${name}-${timestampForFileName()}.${extension ? extension.slice(1) : "sqlite"}`);
  // macOS SQLite rejects even an empty existing destination. Let SQLite create
  // it inside a private directory, then publish only the finished 0600 file.
  const stagingDir = mkdtempSync(join(backupDir, ".pending-"));
  const stagingPath = join(stagingDir, "snapshot.sqlite");
  try {
    const source = new Database(dbPath, { readonly: true });
    try {
      source.run("VACUUM INTO ?", [stagingPath]);
    } finally {
      source.close();
    }
    chmodSync(stagingPath, 0o600);
    // Same filesystem: link is atomic and refuses to overwrite an existing backup.
    linkSync(stagingPath, backupPath);
    return backupPath;
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

function timestampForFileName(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}
