import type { Transaction } from "../api/types";
import { formatDate } from "../lib/dates";

export function ClearedStatus({
  transaction,
  busy,
  onToggle,
  onApprove,
  approving,
}: {
  transaction: Transaction;
  busy: boolean;
  onToggle: () => void;
  onApprove: () => void;
  approving: boolean;
}) {
  const payee = transaction.payee_name ?? (transaction.transfer_account_id ? "transfer" : "transaction");

  if (!transaction.approved) {
    return (
      <button
        type="button"
        className="cleared-status approve-dot"
        onClick={onApprove}
        disabled={busy || approving}
        aria-label={`Approve ${payee} on ${formatDate(transaction.date)}`}
        title={approving ? "Approving…" : "New — click to approve"}
      >
        <span aria-hidden="true" />
      </button>
    );
  }

  if (transaction.cleared === "reconciled") {
    return (
      <span className="cleared-status cleared-status-reconciled" aria-label="Reconciled" title="Reconciled">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6.5 8V6a3.5 3.5 0 0 1 7 0v2M5 8h10v8H5z" />
        </svg>
      </span>
    );
  }

  const cleared = transaction.cleared === "cleared";
  return (
    <button
      type="button"
      className={`cleared-status cleared-status-toggle${cleared ? " cleared-status-cleared" : ""}`}
      onClick={onToggle}
      disabled={busy}
      aria-pressed={cleared}
      aria-label={`Mark ${payee} on ${formatDate(transaction.date)} ${cleared ? "uncleared" : "cleared"}`}
      title={cleared ? "Cleared — click to mark uncleared" : "Uncleared — click to mark cleared"}
    >
      <span className="cleared-glyph" aria-hidden="true" />
    </button>
  );
}
