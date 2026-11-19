export class NotFoundError extends Error {}

/**
 * Reads no longer create the plan they are asked about, so a caller can name
 * one that does not exist. This inherits the 404 `resource_not_found` mapping
 * in `http.ts` while staying greppable.
 */
export class PlanNotFoundError extends NotFoundError {
  constructor(message = "Plan not found") {
    super(message);
  }
}

export class ValidationError extends Error {}

export class AccountPreferencesConflictError extends Error {}

export class TransactionStateConflictError extends Error {
  constructor(message = "Transaction cleared status changed; refresh and try again") {
    super(message);
  }
}

export class ReconciliationMismatchError extends Error {
  readonly difference: number;

  constructor(
    readonly currentReconciledBalance: number,
    readonly projectedReconciledBalance: number,
    readonly statementBalance: number,
  ) {
    super("Statement balance does not match the projected reconciled balance");
    this.difference = statementBalance - projectedReconciledBalance;
  }
}
