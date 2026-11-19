type Row = Record<string, any>;

/** One statement in a batched read, with its positional bindings. */
export type BatchStatement = { sql: string; values?: readonly any[] };

export type RepositoryStatement = {
  get(...values: any[]): Promise<Row | null>;
  all(...values: any[]): Promise<Row[]>;
  run(...values: any[]): Promise<{ changes: number }>;
};

export interface RepositoryDatabase {
  query(sql: string): RepositoryStatement;
  /**
   * Runs several read statements as one round trip, inside one transaction, and
   * returns their row sets in order. Callers rely on every statement seeing the
   * same snapshot — that is what lets a page query and the `server_knowledge`
   * it is labelled with come back consistent without a second read.
   */
  batchRead(statements: BatchStatement[]): Promise<Row[][]>;
}
