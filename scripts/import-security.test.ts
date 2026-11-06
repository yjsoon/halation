import { Database } from "bun:sqlite";
import { expect, setSystemTime, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { backupSqliteDatabase } from "./lib/sqlite-backup";

test("SQLite import backups stay private even with a permissive umask and existing directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "howmuch-backup-"));
  const mask = process.umask(0o022);
  const source = join(dir, "ledger.sqlite");
  const db = new Database(source);
  setSystemTime(new Date("2026-11-06T12:00:00Z"));
  try {
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA wal_autocheckpoint = 0");
    db.run("CREATE TABLE secret (value TEXT)");
    db.run("INSERT INTO secret VALUES ('synthetic ledger')");
    chmodSync(source, 0o600);
    mkdirSync(join(dir, "backups"), { mode: 0o755 });
    // Keep the writer open: copying just the main file would lose committed WAL data.
    expect(statSync(`${source}-wal`).size).toBeGreaterThan(0);
    const backup = backupSqliteDatabase(source)!;
    expect(statSync(backup).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "backups")).mode & 0o777).toBe(0o700);
    db.run("INSERT INTO secret VALUES ('after snapshot')");
    // Same timestamp must fail rather than replacing a previous successful backup.
    expect(() => backupSqliteDatabase(source)).toThrow();
    const copy = new Database(backup, { readonly: true });
    try {
      expect(copy.query("SELECT value FROM secret").all()).toEqual([{ value: "synthetic ledger" }]);
    } finally { copy.close(); }
    expect(readdirSync(join(dir, "backups"))).toEqual([basename(backup)]);
  } finally {
    db.close();
    setSystemTime();
    process.umask(mask);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed SQLite snapshot leaves no apparent backup or partial ledger", () => {
  const dir = mkdtempSync(join(tmpdir(), "howmuch-backup-failure-"));
  try {
    const source = join(dir, "invalid.sqlite");
    writeFileSync(source, "not a SQLite database");
    expect(() => backupSqliteDatabase(source)).toThrow();
    expect(readdirSync(join(dir, "backups"))).toEqual([]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the YNAB CLI refuses secret-valued token arguments", () => {
  const result = Bun.spawnSync(["bun", "scripts/import-ynab.ts", "--token", "synthetic-token", "--help"]);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("Unknown option");
});
