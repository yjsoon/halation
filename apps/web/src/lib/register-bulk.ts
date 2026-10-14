import type { TransactionBulkSummary } from "../api/client";
import type { Transaction } from "../api/types";

export function categorisableRows(rows: readonly Transaction[]): Transaction[] {
  return rows.filter((txn) => !txn.transfer_account_id && !txn.parent_transaction_id && !(txn.subtransactions?.length));
}

export function clearedTargets(
  rows: readonly Transaction[],
  cleared: "cleared" | "uncleared",
): Transaction[] {
  return rows.filter((txn) => txn.cleared !== "reconciled" && txn.cleared !== cleared);
}

export function remainingWorkIds(summary: Pick<TransactionBulkSummary, "outcomes">): string[] {
  return summary.outcomes
    .filter((outcome) => outcome.status === "unresolved" || outcome.status === "unattempted")
    .map((outcome) => outcome.id);
}

export function bulkOutcomeIsComplete(summary: TransactionBulkSummary): boolean {
  return summary.unresolved_count === 0
    && summary.conflict_count === 0
    && summary.unattempted_count === 0;
}

export function bulkOutcomeToast(label: string, summary: TransactionBulkSummary): string {
  const confirmed = summary.applied_count;
  const alreadyRemoved = summary.already_removed_count;
  const uncertain = summary.unresolved_count;
  const skipped = summary.conflict_count + summary.unattempted_count;
  const sentences: string[] = [];
  if (confirmed > 0) {
    sentences.push(`${label} ${confirmed} transaction${confirmed === 1 ? "" : "s"}.`);
  }
  if (alreadyRemoved > 0) {
    sentences.push(`${alreadyRemoved} transaction${alreadyRemoved === 1 ? " was" : "s were"} already removed.`);
  }
  if (uncertain > 0) {
    sentences.push(`${uncertain} transaction${uncertain === 1 ? "" : "s"} may or may not have been updated.`);
  }
  if (skipped > 0) {
    sentences.push(skipped === 1
      ? "1 transaction was not updated."
      : `${skipped} transactions were not updated.`);
  }
  if (sentences.length === 0) {
    sentences.push(`${label} no transactions.`);
  }
  return sentences.join(" ");
}

export type BulkWriteKind = "categorise" | "cleared" | "delete";

export function bulkWriteTouchesReconciliation(kind: BulkWriteKind): boolean {
  return kind === "cleared" || kind === "delete";
}

export type BulkDeleteFollowUp = {
  readonly retryIds: readonly string[];
  readonly complete: boolean;
};

export function bulkDeleteFollowUp(summary: TransactionBulkSummary): BulkDeleteFollowUp {
  const complete = bulkOutcomeIsComplete(summary);
  return {
    retryIds: complete ? [] : remainingWorkIds(summary),
    complete,
  };
}
