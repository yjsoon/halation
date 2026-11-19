import type { AsyncReportService } from "./async-reports";
import type { D1LedgerRepository } from "./d1-ledger-repository";

type Awaitable<T> = T | Promise<T>;

/**
 * Public storage boundary used by HTTP, import, and scheduled-sync code.
 * Callers always await it, so a test double may answer synchronously.
 */
export type AwaitableMethods<T> = {
  [Key in keyof T]: T[Key] extends (...args: infer Args) => infer Result
    ? (...args: Args) => Awaitable<Awaited<Result>>
    : T[Key];
};

export type LedgerStore = AwaitableMethods<D1LedgerRepository>;
export type ReportStore = AwaitableMethods<AsyncReportService>;
