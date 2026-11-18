import { D1Database, type D1Result } from "../../src/d1";
import type { SqlValues } from "../../src/async-sql";
import type { BatchStatement, RepositoryStatement } from "../../src/repository-db";

/**
 * One recorded Worker-to-D1 round trip. Only the statement text is kept, so
 * counts can be attributed without ever recording bound ledger values.
 */
type RoundTrip = { kind: "get" | "all" | "run" | "batch"; sql: string };

// Multiline, because a batch records its statements one per line and any of
// them may write even when the first is a SELECT or an assertion.
const MUTATION = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/im;

/**
 * Counts every Worker-to-D1 round trip a request makes.
 *
 * It extends `D1Database` so it satisfies both the `RepositoryDatabase`
 * surface the ledger repository uses (`query(sql).get/all/run`) and the
 * `AsyncSqlDatabase` surface the auth store and report service use
 * (`get/all/run`). Each call is one round trip; an atomic batch is one too.
 */
export class CountingD1Database extends D1Database {
  readonly roundTrips: RoundTrip[] = [];

  reset(): void {
    this.roundTrips.length = 0;
  }

  get count(): number {
    return this.roundTrips.length;
  }

  /** Statement texts that would write, in the order they were issued. */
  mutations(): string[] {
    return this.roundTrips.filter((trip) => MUTATION.test(trip.sql)).map((trip) => trip.sql);
  }

  private record<Result>(kind: RoundTrip["kind"], sql: string, result: Promise<Result>): Promise<Result> {
    this.roundTrips.push({ kind, sql });
    return result;
  }

  override query(sql: string): RepositoryStatement {
    const inner = super.query(sql);
    return {
      get: (...values) => this.record("get", sql, inner.get(...values)),
      all: (...values) => this.record("all", sql, inner.all(...values)),
      run: (...values) => this.record("run", sql, inner.run(...values)),
    };
  }

  override all<Row = Record<string, unknown>>(sql: string, values: SqlValues = []): Promise<Row[]> {
    return this.record("all", sql, super.all<Row>(sql, values));
  }

  override get<Row = Record<string, unknown>>(sql: string, values: SqlValues = []): Promise<Row | null> {
    return this.record("get", sql, super.get<Row>(sql, values));
  }

  override run(sql: string, values: SqlValues = []): Promise<{ rowCount: number }> {
    return this.record("run", sql, super.run(sql, values));
  }

  /** A batched read is one round trip, like the atomic batch it delegates to. */
  override batchRead(statements: BatchStatement[]): Promise<Record<string, any>[][]> {
    if (statements.length === 0) return super.batchRead(statements);
    return this.record(
      "batch",
      statements.map((statement) => statement.sql).join(";\n"),
      super.batchRead(statements),
    );
  }

  override atomicBatch<Row = Record<string, unknown>>(
    statements: Array<{ sql: string; values?: SqlValues }>,
  ): Promise<D1Result<Row>[]> {
    if (statements.length === 0) return super.atomicBatch<Row>(statements);
    return this.record(
      "batch",
      statements.map((statement) => statement.sql).join(";\n"),
      super.atomicBatch<Row>(statements),
    );
  }
}

export { sqliteD1Binding as fakeD1Binding } from "../../src/sqlite-d1";
