#!/usr/bin/env bun
// Builds howmuch.sqlite for the iOS app's local mode, loaded with perf-snapshot.json
// through the app's own engine bundle.
//
//   bun .amp/in/artifacts/perf-pass/fixture/make-local-db.ts [out.sqlite]
//
// Mirrors apps/ios/HowMuch/Engine/LocalDatabase.swift and LocalEngine.swift:
// - opens the file and sets journal_mode=WAL, foreign_keys=ON, busy_timeout=5000;
// - `migrate`: _local_migrations, then every bundled migrations/*.sql not yet
//   recorded, in name order, each with foreign keys off, in BEGIN IMMEDIATE,
//   recorded by name, foreign_key_check must be empty, then COMMIT;
// - evaluates howmuch-engine.js in a bare JS context (node:vm, so the bundle's
//   own polyfills run as they do in JavaScriptCore) with the host globals
//   __sqlite.exec, __random and __log and the same console shim;
// - binds and returns values the way `execJSON`/`run`/`bind`/`row` do;
// - drives `__howmuch` through the same promise box `LocalEngine.call` uses.
// Then it imports the snapshot with POST /v1/plans/<plan>/import_snapshot,
// reads a few pages back, checkpoints the WAL and switches the file to
// journal_mode=DELETE so the single file can be copied into a simulator.

import { Database } from "bun:sqlite";
import vm from "node:vm";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const HERE = import.meta.dir;
const ROOT = resolve(HERE, "../../../../..");
const ENGINE_DIR = join(ROOT, "apps/ios/HowMuch/Engine");
const OUT = resolve(process.argv[2] ?? join(HERE, "howmuch.sqlite"));
const SNAPSHOT = resolve(process.env.HOWMUCH_PERF_SNAPSHOT ?? join(HERE, "perf-snapshot.json"));
const PLAN_ID = "plan_perfbench0000";
const API_TOKEN = "perf-local-engine-token";
const ORIGIN = "https://local.howmuch"; // LocalEngine.origin
const CONFIG = {
  apiToken: API_TOKEN,
  defaultPlanId: PLAN_ID,
  timeZone: "Asia/Singapore",
  // What PlanSettingsSeed.from(locale: en_SG) produces; seeds only a plan that configure creates.
  newPlanSettings: {
    currency_format: { iso_code: "SGD", example_format: "$123,456.78", decimal_digits: 2, decimal_separator: ".", symbol_first: true, group_separator: ",", currency_symbol: "$", display_symbol: true },
    date_format: { format: "DD/MM/YYYY" },
  },
};

const ms = (start: number) => `${(performance.now() - start).toFixed(1)} ms`;
if (!existsSync(SNAPSHOT)) throw new Error(`no snapshot at ${SNAPSHOT}; run make-snapshot.ts first`);
for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(OUT + suffix, { force: true });

// ------------------------------------------------------- LocalDatabase ----
class SQLiteError extends Error {}
const db = new Database(OUT, { create: true, readwrite: true });

/** sqlite3_exec: every statement in `sql`, rows ignored. */
function execute(sql: string): void {
  try {
    // bun:sqlite only reports a failing final statement when nothing but
    // whitespace-free text follows it (see apps/api/src/db.ts).
    db.run(sql.trimEnd());
  } catch (error) {
    throw new SQLiteError((error as Error).message);
  }
}

/** LocalDatabase.bind: NSNull, text, integral number as int64, other number as double, anything else as JSON text. */
function bindValue(value: unknown): string | number | bigint | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1n : 0n; // an NSNumber bool is not a float type
  if (typeof value === "number") return Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? BigInt(value) : value;
  // JSONSerialization escapes "/" by default.
  return JSON.stringify(value).replace(/\//g, "\\/");
}

const totalChanges = db.prepare("SELECT total_changes() AS n");
const lastChanges = db.prepare("SELECT changes() AS n");

/** LocalDatabase.run: prepare one statement, bind, step to the end, read rows and the change count. */
function run(sql: string, parameters: unknown[]): { rows: Record<string, unknown>[]; changes: number } {
  let statement;
  try {
    statement = db.prepare(sql);
  } catch (error) {
    throw new SQLiteError((error as Error).message);
  }
  try {
    const before = (totalChanges.get() as { n: number }).n;
    let values: unknown[][];
    try {
      // bun:sqlite returns null rather than [] for a statement without result columns.
      values = (statement.values(...(parameters.map(bindValue) as any[])) as unknown[][] | null) ?? [];
    } catch (error) {
      throw new SQLiteError((error as Error).message);
    }
    const columns = statement.columnNames ?? [];
    const rows = values.map((value) => {
      const row: Record<string, unknown> = {};
      columns.forEach((name, index) => {
        const cell = value[index];
        // SQLITE_BLOB comes back as an array of byte values; later duplicate names win, as in a Swift dictionary.
        row[name] = cell instanceof Uint8Array ? Array.from(cell) : cell === undefined ? null : cell;
      });
      return row;
    });
    // Swift returns 0 for a read-only statement (sqlite3_stmt_readonly), else
    // sqlite3_changes(). bun:sqlite does not expose stmt_readonly, so a
    // statement that changed no row reports 0 and any other reports changes();
    // the two agree except for DDL, which the engine never sends at runtime.
    const after = (totalChanges.get() as { n: number }).n;
    const changes = after === before ? 0 : (lastChanges.get() as { n: number }).n;
    return { rows, changes };
  } finally {
    statement.finalize();
  }
}

const query = (sql: string, parameters: unknown[] = []) => run(sql, parameters).rows;

/** LocalDatabase.execJSON: the bridge the engine's D1 binding calls. */
function execJSON(sql: string, parametersJSON: string): string {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(parametersJSON);
    } catch (error) {
      throw new Error(`The data couldn’t be read because it isn’t in the correct format.`);
    }
    const { rows, changes } = run(sql, Array.isArray(parsed) ? parsed : []);
    if (rows.some((row) => Object.values(row).some((value) => typeof value === "number" && !Number.isFinite(value)))) {
      return JSON.stringify({ error: "The database returned a value that is not JSON" });
    }
    return JSON.stringify({ rows, changes });
  } catch (error) {
    return JSON.stringify({ error: (error as Error).message });
  }
}

/** LocalDatabase.migrate. */
function migrate(): string[] {
  execute("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()))");
  const applied = new Set(query("SELECT name FROM _local_migrations").map((row) => String(row.name)));
  const available = readdirSync(join(ENGINE_DIR, "migrations")).filter((name) => name.endsWith(".sql")).sort();
  const names: string[] = [];
  for (const name of available.filter((name) => !applied.has(name))) {
    const sql = readFileSync(join(ENGINE_DIR, "migrations", name), "utf8");
    execute("PRAGMA foreign_keys = OFF");
    try {
      execute("BEGIN IMMEDIATE");
      try {
        execute(sql);
        query("INSERT INTO _local_migrations(name) VALUES(?)", [name]);
        const violation = query("PRAGMA foreign_key_check")[0];
        if (violation) throw new SQLiteError(`foreign key check failed on ${violation.table ?? "a table"}`);
        execute("COMMIT");
      } catch (error) {
        try { execute("ROLLBACK"); } catch {}
        throw new Error(`Couldn’t update the on-device database (${name}): ${(error as Error).message}`);
      }
    } finally {
      try { execute("PRAGMA foreign_keys = ON"); } catch {}
    }
    names.push(name);
  }
  return names;
}

// ---------------------------------------------------------- LocalEngine ----
let started = performance.now();
execute("PRAGMA journal_mode = WAL");
execute("PRAGMA foreign_keys = ON");
execute("PRAGMA busy_timeout = 5000");
const journalDuringImport = String(query("PRAGMA journal_mode")[0]?.journal_mode);
const applied = migrate();
console.log(`migrations: applied ${applied.length} (${applied[0]} .. ${applied.at(-1)}) in ${ms(started)}; journal_mode=${journalDuringImport}; SQLite ${query("SELECT sqlite_version() AS v")[0]!.v}`);

started = performance.now();
const logLines: string[] = [];
const context = vm.createContext({
  __sqlite: { exec: (sql: string, parameters: string) => execJSON(String(sql), String(parameters)) },
  __random: (count: number) => Array.from(crypto.getRandomValues(new Uint8Array(Math.max(0, Number(count) || 0)))),
  __log: (message: string) => {
    logLines.push(String(message));
    if (process.env.ENGINE_LOG) process.stderr.write(`[engine] ${message}\n`);
  },
});
const WEB_GLOBALS = `["TextEncoder", "URL", "URLSearchParams", "Request", "Response", "Headers", "crypto", "setTimeout"].filter(function (n) { return typeof globalThis[n] !== "undefined"; })`;
const bareGlobals = [...vm.runInContext(WEB_GLOBALS, context)];
vm.runInContext(`
  var console = { log: function () { __log(Array.prototype.map.call(arguments, String).join(" ")); } };
  console.info = console.warn = console.error = console.debug = console.log;
`, context);
const sourcePath = join(ENGINE_DIR, "howmuch-engine.js");
vm.runInContext(readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
const invoke = vm.runInContext(`
  (function (name, args) {
    var box = { done: false };
    var fail = function (error) { box.done = true; box.error = String((error && error.stack) || error); };
    try {
      Promise.resolve(__howmuch[name].apply(null, args)).then(function (value) {
        box.done = true;
        box.value = JSON.stringify(value === undefined ? null : value);
      }, fail);
    } catch (error) {
      fail(error);
    }
    return box;
  })
`, context) as (name: string, args: unknown[]) => { done: boolean; value?: string; error?: string };
const polyfilled = [...vm.runInContext(WEB_GLOBALS, context)].filter((name) => !bareGlobals.includes(name));
console.log(`engine: loaded ${(statSync(sourcePath).size / 1024).toFixed(0)} KiB bundle in ${ms(started)}; bare context had web globals [${bareGlobals.join(", ")}], the bundle polyfilled [${polyfilled.join(", ")}]`);

/** LocalEngine.call: run, let queued microtasks settle, then read the box. */
async function call(name: string, args: unknown[]): Promise<string> {
  const box = invoke(name, args);
  // JSContext drains microtasks when the host call returns; under Bun they run
  // at the next checkpoint. One macrotask turn lets every queued microtask run
  // but no timer or I/O, so a call that is not synchronous still shows as unsettled.
  if (!box.done) await new Promise((resolve) => setImmediate(resolve));
  if (!box.done) throw new Error(`The on-device engine did not finish ${name}.`);
  if (box.error !== undefined) throw new Error(`The on-device engine failed: ${box.error}`);
  return box.value ?? "null";
}

async function handle(method: string, path: string, body: string | null = null, extraHeaders: Record<string, string> = {}) {
  const headers = { Accept: "application/json", Authorization: `Bearer ${API_TOKEN}`, ...(body === null ? {} : { "Content-Type": "application/json" }), ...extraHeaders };
  const raw = await call("handle", [method, ORIGIN + path, JSON.stringify(headers), body]);
  const response = JSON.parse(raw) as { status: number; headers: Record<string, string>; body: string };
  if (typeof response.status !== "number") throw new Error("The on-device engine returned an invalid response.");
  return response;
}

started = performance.now();
await call("configure", [JSON.stringify(CONFIG)]);
console.log(`configure: ${ms(started)}`);

const snapshotText = readFileSync(SNAPSHOT, "utf8");
started = performance.now();
const imported = await handle("POST", `/v1/plans/${PLAN_ID}/import_snapshot`, `{"snapshot":${snapshotText}}`, { "Idempotency-Key": "perf-bench-import-0001" });
if (imported.status !== 201) throw new Error(`import returned ${imported.status}: ${imported.body.slice(0, 2000)}`);
console.log(`import: HTTP ${imported.status} in ${ms(started)} ${JSON.stringify(JSON.parse(imported.body).data.imported)}`);

// --------------------------------------------------------------- verify ----
const plan = `/v1/plans/${PLAN_ID}`;
for (const path of [
  `${plan}/transactions?limit=100&offset=0`,
  `${plan}/transactions?limit=250&offset=0`,
  `${plan}/transactions?limit=100&offset=10000`,
  `${plan}/accounts`,
  `${plan}/payees`,
  `${plan}/categories`,
  `${plan}/scheduled_transactions`,
  `${plan}/settings`,
]) {
  const runs: number[] = [];
  let response!: Awaited<ReturnType<typeof handle>>;
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    response = await handle("GET", path);
    runs.push(performance.now() - t);
  }
  if (response.status !== 200) throw new Error(`GET ${path} returned ${response.status}: ${response.body.slice(0, 500)}`);
  const data = JSON.parse(response.body).data;
  const summary = Object.entries(data).map(([key, value]) => Array.isArray(value) ? `${key}=${value.length}`
    : key === "settings" ? `currency=${(value as any).currency_format?.iso_code}`
      : value !== null && typeof value === "object" ? `${key}={…}` : `${key}=${value}`).join(" ");
  runs.sort((a, b) => a - b);
  console.log(`GET ${path.replace(plan, "<plan>")}: ${response.body.length} B, median of 5 ${runs[2]!.toFixed(1)} ms in Bun; ${summary}`);
}
const transactionsTotal = query("SELECT count(*) AS n FROM transactions WHERE plan_id = ? AND deleted = 0", [PLAN_ID])[0]!.n;
const accountsTotal = query("SELECT count(*) AS n FROM accounts WHERE plan_id = ? AND deleted = 0", [PLAN_ID])[0]!.n;
console.log(`live rows for ${PLAN_ID}: ${transactionsTotal} transactions, ${accountsTotal} accounts`);

// ------------------------------------------------- one self-contained file ----
const integrity = query("PRAGMA integrity_check").map((row) => Object.values(row)[0]).join(", ");
const foreignKeys = query("PRAGMA foreign_key_check").length;
const checkpoint = query("PRAGMA wal_checkpoint(TRUNCATE)")[0];
const journal = query("PRAGMA journal_mode = DELETE")[0];
db.close();
const leftovers = ["-wal", "-shm", "-journal"].filter((suffix) => existsSync(OUT + suffix));
if (leftovers.length) throw new Error(`sidecar files remain: ${leftovers.join(", ")}`);

const check = new Database(OUT, { readonly: true });
const tables = check.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
console.log(`integrity_check=${integrity}; foreign_key_check rows=${foreignKeys}; wal_checkpoint=${JSON.stringify(checkpoint)}; journal_mode=${JSON.stringify(journal)}`);
console.log(`wrote ${OUT} (${statSync(OUT).size} bytes, single file; header journal byte ${readFileSync(OUT).subarray(18, 20).join("/")} = rollback journal)`);
console.log("row counts per table:");
for (const { name } of tables) {
  const n = (check.query(`SELECT count(*) AS n FROM "${name.replace(/"/g, '""')}"`).get() as { n: number }).n;
  console.log(`  ${name.padEnd(40)} ${n}`);
}
check.close();
if (logLines.length) console.log(`engine log: ${logLines.length} lines (set ENGINE_LOG=1 to stream them)`);
