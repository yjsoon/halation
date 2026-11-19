import type { Database } from "bun:sqlite";
import { AsyncReportService } from "../../src/async-reports";
import { D1AuthStore, type AuthStore } from "../../src/auth-store";
import { D1Database } from "../../src/d1";
import { D1LedgerRepository } from "../../src/d1-ledger-repository";
import { createHandler, type HandlerOptions } from "../../src/http";
import type { LedgerStore } from "../../src/storage";
import { newSession } from "../../src/password-auth";
import { openD1Sqlite, sqliteD1Binding } from "../../src/sqlite-d1";

export const API_TOKEN = "test-token";

export type NativeHarness = {
  db: Database;
  repo: LedgerStore;
  /** The raw handler, for auth flows that need cookies, origins or session tokens of their own. */
  handle: (request: Request) => Promise<Response>;
  request: (path: string, init?: { method?: string; body?: unknown; key?: string; token?: string }) => Promise<Response>;
  /** Statement count of every binding.batch call (reads and writes). */
  batches: number[];
  close: () => void;
};

/**
 * The production API over an in-memory database with the D1 migrations
 * applied behind a SQLite-backed D1 binding, with plans `p` (default) and
 * `q` already created.
 */
export async function nativeHarness(
  /** Wraps the auth store, so a test can run code between two of its calls. */
  wrapAuth: (store: AuthStore) => AuthStore = (store) => store,
): Promise<NativeHarness> {
  const db = openD1Sqlite();
  const writeBatches: number[] = [];
  const config = { apiToken: API_TOKEN, defaultPlanId: "p" };
  const binding = sqliteD1Binding(db);
  const batch = binding.batch.bind(binding);
  binding.batch = (async (statements: Parameters<typeof batch>[0]) => {
    writeBatches.push(statements.length);
    return batch(statements);
  }) as typeof binding.batch;
  const d1 = new D1Database(binding);
  const repo: LedgerStore = new D1LedgerRepository(d1, "p");
  const handler = d1Handler(db, { repo, auth: wrapAuth(new D1AuthStore(d1)), config }, d1);
  await repo.ensurePlan("p");
  await repo.ensurePlan("q");
  return {
    db,
    repo,
    handle: handler,
    request: (path, init = {}) => handler(new Request(`https://howmuch.test${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${init.token ?? API_TOKEN}`,
        "content-type": "application/json",
        ...(init.key ? { "idempotency-key": init.key } : {}),
      },
      ...(init.body === undefined ? {} : { body: typeof init.body === "string" ? init.body : JSON.stringify(init.body) }),
    })),
    batches: writeBatches,
    close: () => db.close(),
  };
}

/** The ledger store production uses, over `db`. */
export function d1Repo(db: Database, planId: string): D1LedgerRepository {
  return new D1LedgerRepository(new D1Database(sqliteD1Binding(db)), planId);
}

/** The production handler over `db`; `repo` and `auth` default to the D1 stores. */
export function d1Handler(
  db: Database,
  options: Omit<HandlerOptions, "reports" | "repo" | "auth"> & Partial<Pick<HandlerOptions, "repo" | "auth">>,
  d1 = new D1Database(sqliteD1Binding(db)),
): (request: Request) => Promise<Response> {
  return createHandler({
    ...options,
    repo: options.repo ?? new D1LedgerRepository(d1, options.config.defaultPlanId),
    reports: new AsyncReportService(d1),
    auth: options.auth ?? new D1AuthStore(d1),
  });
}

/** Makes plan `p` a YNAB mirror the way the importer does: it sets the plan marker. */
export function markYnabMirror(db: Database, planId = "p"): void {
  db.run("UPDATE plans SET ynab_sourced = 1 WHERE id = ?", [planId]);
}

/** A bearer session for a new user holding `role` on `planId`. */
export function sessionFor(db: Database, role: "owner" | "editor" | "viewer", planId = "p"): string {
  const session = newSession();
  const userId = `user-${role}-${session.id.slice(0, 8)}`;
  db.run("INSERT INTO users (id) VALUES (?)", [userId]);
  db.run(
    "INSERT INTO password_credentials (user_id, username, cost_n, block_size, parallelization, salt_hex, hash_hex) VALUES (?, ?, 16384, 8, 1, ?, ?)",
    [userId, userId.toLowerCase(), "0".repeat(32), "0".repeat(64)],
  );
  db.run("INSERT INTO plan_memberships (plan_id, user_id, role) VALUES (?, ?, ?)", [planId, userId, role]);
  db.run("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)", [session.id, userId, session.tokenHash, session.expiresAt]);
  return session.token;
}

export function count(db: Database, sql: string, ...values: any[]): number {
  return Number((db.query(sql).get(...values) as { n: number }).n);
}
