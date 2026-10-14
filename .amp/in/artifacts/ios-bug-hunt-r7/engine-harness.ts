// Runs the shipped iOS engine bundle in a bare node:vm context the way
// LocalEngine.swift runs it in JSContext: __sqlite/__random/__log globals,
// the bundled migrations applied with foreign keys off and then on, and
// statement parameters bound the way LocalDatabase.bind binds them.
import { Database } from "bun:sqlite";
import vm from "node:vm";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const ORIGIN = "https://local.howmuch";

export function startEngine(engineDir: string, dbPath = ":memory:") {
  const db = new Database(dbPath);
  db.exec("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()))");
  for (const name of readdirSync(join(engineDir, "migrations")).filter((n) => n.endsWith(".sql")).sort()) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    db.exec(readFileSync(join(engineDir, "migrations", name), "utf8"));
    db.prepare("INSERT INTO _local_migrations(name) VALUES(?)").run(name);
    db.exec("COMMIT");
  }
  db.exec("PRAGMA foreign_keys = ON");
  // LocalDatabase.bind: null, text, integral number as int64, other number as
  // double, anything else as its JSON text.
  const bind = (v: unknown) => (v === null ? null : typeof v === "string" || typeof v === "number" ? v : JSON.stringify(v));
  const exec = (sql: string, paramsJson: string) => {
    try {
      const params = (JSON.parse(paramsJson) as unknown[]).map(bind);
      const stmt = db.prepare(sql);
      const rows = (stmt.all(...(params as any[])) as Record<string, unknown>[]).map((row) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) out[k] = v instanceof Uint8Array ? Array.from(v) : v;
        return out;
      });
      const readonly = /^\s*(select|with|pragma)/i.test(sql) && !/\b(insert|update|delete)\b/i.test(sql);
      const changes = readonly ? 0 : (db.query("SELECT changes() AS c").get() as any).c;
      return JSON.stringify({ rows, changes });
    } catch (error) {
      return JSON.stringify({ error: String((error as Error).message) });
    }
  };
  // NATIVE_GLOBALS=1 hands the context the host's own web APIs, so the
  // bundle's polyfills stand aside: a difference between the two runs is a
  // polyfill defect.
  const native = process.env.NATIVE_GLOBALS
    ? { URL, URLSearchParams, TextEncoder, TextDecoder, Request, Response, Headers, btoa, atob }
    : {};
  const context = vm.createContext({
    ...native,
    __sqlite: { exec },
    __random: (n: number) => Array.from(randomBytes(Math.max(0, n))),
    __log: (message: string) => { if (process.env.ENGINE_LOG) process.stderr.write(message + "\n"); },
  });
  vm.runInContext(`var console = { log: function () { __log(Array.prototype.map.call(arguments, String).join(" ")); } };
    console.info = console.warn = console.error = console.debug = console.log;`, context);
  vm.runInContext(readFileSync(join(engineDir, "howmuch-engine.js"), "utf8"), context, { filename: "howmuch-engine.js" });
  const engine = vm.runInContext("__howmuch", context);
  const token = "local-token";
  return {
    db,
    token,
    configure: (config: Record<string, unknown>) => engine.configure(JSON.stringify({ apiToken: token, ...config })),
    async handle(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
      const result = await engine.handle(method, ORIGIN + path,
        JSON.stringify({ authorization: `Bearer ${token}`, "content-type": "application/json", ...headers }),
        body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body));
      let parsed: any = result.body;
      try { parsed = JSON.parse(result.body); } catch {}
      return { status: result.status as number, body: parsed };
    },
    runScheduledMaterialization: async (ms: number) => JSON.parse(JSON.stringify(await engine.runScheduledMaterialization(ms))),
  };
}
