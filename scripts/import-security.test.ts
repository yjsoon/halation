import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupSqliteDatabase } from "./lib/sqlite-backup";

test("SQLite import backups stay private even with a permissive umask and existing directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "howmuch-backup-"));
  const mask = process.umask(0o022);
  try {
    const source = join(dir, "ledger.sqlite");
    const db = new Database(source);
    db.run("CREATE TABLE secret (value TEXT)");
    db.run("INSERT INTO secret VALUES ('synthetic ledger')");
    db.close();
    chmodSync(source, 0o600);
    mkdirSync(join(dir, "backups"), { mode: 0o755 });
    const backup = backupSqliteDatabase(source)!;
    expect(statSync(backup).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "backups")).mode & 0o777).toBe(0o700);
    const copy = new Database(backup, { readonly: true });
    expect(copy.query("SELECT value FROM secret").get()).toEqual({ value: "synthetic ledger" });
    copy.close();
  } finally {
    process.umask(mask);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the YNAB CLI refuses secret-valued token arguments", () => {
  const result = Bun.spawnSync(["bun", "scripts/import-ynab.ts", "--token", "synthetic-token", "--help"]);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("Unknown option");
});
