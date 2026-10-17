import { Fragment, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { Account, CategoryGroup, Payee, ScheduledTransaction, Transaction } from "../api/types";
import { formatDate } from "../lib/dates";
import { formatAmount } from "../lib/money";
import { scheduledAmount, scheduleRecurrence, transferScheduleLabel } from "../lib/schedules";

export function RegisterScheduledDisclosure({
  schedules,
  posted,
  loading,
  error,
  accounts,
  categoryGroups,
  payees,
  renderPosted,
}: {
  schedules: ScheduledTransaction[];
  posted: Transaction[];
  loading: boolean;
  error: string | null;
  accounts: Account[];
  categoryGroups: CategoryGroup[];
  payees: Payee[];
  renderPosted: (transaction: Transaction) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryNames = new Map(categoryGroups.flatMap((group) => group.categories ?? []).map((category) => [category.id, category.name]));
  const payeeNames = new Map(payees.map((payee) => [payee.id, payee.name]));
  const count = posted.length + schedules.length;
  const summary = error && count === 0
    ? "Unavailable"
    : String(count);

  const scheduleRows = (schedule: ScheduledTransaction) => {
    const amount = scheduledAmount(schedule);
    const transfer = schedule.transfer_account_id ? transferScheduleLabel(schedule.transfer_account_id, accountNames) : null;
    const payee = schedule.payee_name
      ?? (schedule.payee_id ? payeeNames.get(schedule.payee_id) : null)
      ?? transfer
      ?? "No payee";
    const category = schedule.subtransactions?.length
      ? `Split · ${schedule.subtransactions.length} lines`
      : transfer ?? schedule.category_name ?? (schedule.category_id ? categoryNames.get(schedule.category_id) : null) ?? "Uncategorised";
    const accountName = (typeof schedule.account_id === "string" ? accountNames.get(schedule.account_id) : undefined) ?? "Account";
    return [
      <tr key={schedule.id} className="register-scheduled-row">
        <td />
        <td className="nowrap">{schedule.date_next ? formatDate(schedule.date_next) : "No next date"}</td>
        <td>{accountName}</td>
        <td>{payee}</td>
        <td className="muted">Scheduled · {scheduleRecurrence(schedule.frequency)} · {category} · <NavLink className="register-row-action" to="/scheduled">Manage</NavLink></td>
        <td className="muted memo-cell" title={schedule.memo ?? ""}>{schedule.memo ?? "-"}</td>
        <td className="num amount-negative">{amount < 0 ? formatAmount(amount) : ""}</td>
        <td className="num amount-positive">{amount > 0 ? formatAmount(amount) : ""}</td>
        <td className="register-status" />
      </tr>,
      ...(schedule.subtransactions ?? []).map((line) => {
        const lineTransfer = line.transfer_account_id ? transferScheduleLabel(line.transfer_account_id, accountNames) : null;
        return <tr key={line.id} className="split-line-row register-scheduled-split-row">
          <td />
          <td />
          <td />
          <td className="muted split-line-cell">↳ {line.payee_name ?? (line.payee_id ? payeeNames.get(line.payee_id) : null) ?? lineTransfer ?? "-"}</td>
          <td className="muted">{lineTransfer ?? line.category_name ?? (line.category_id ? categoryNames.get(line.category_id) : null) ?? "Uncategorised"}</td>
          <td className="muted memo-cell" title={line.memo ?? ""}>{line.memo ?? "-"}</td>
          <td className="num amount-negative">{line.amount < 0 ? formatAmount(line.amount) : ""}</td>
          <td className="num amount-positive">{line.amount > 0 ? formatAmount(line.amount) : ""}</td>
          <td />
        </tr>;
      }),
    ];
  };

  const expandedRows = [
    ...posted.map((transaction) => ({
      date: transaction.date,
      kind: 0 as const,
      id: transaction.id,
      node: renderPosted(transaction),
    })),
    ...schedules.map((schedule) => ({
      date: schedule.date_next ?? schedule.date_first ?? "9999-12-31",
      kind: 1 as const,
      id: schedule.id,
      node: scheduleRows(schedule),
    })),
  ].sort((left, right) => right.date.localeCompare(left.date) || left.kind - right.kind || left.id.localeCompare(right.id));

  if (error && count === 0) {
    return (
      <tr className="register-scheduled-message">
        <td colSpan={9}>
          <span role="alert">Could not load scheduled transactions: {error}</span>
          {" · "}
          <NavLink to="/scheduled">Manage schedules</NavLink>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="register-scheduled-disclosure-row">
        <td colSpan={9}>
          <button
            type="button"
            className="register-scheduled-disclosure"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <svg className="register-scheduled-icon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 6.5h12M6.5 3.5v4M13.5 3.5v4M4 5h12v12H4z" />
            </svg>
            <span>Scheduled</span>
            <span className="register-scheduled-count">{summary}</span>
            <span className="register-scheduled-chevron" aria-hidden="true">›</span>
          </button>
        </td>
      </tr>
      {expanded && loading && count === 0 && (
        <tr className="register-scheduled-message"><td colSpan={9}><span role="status">Loading scheduled transactions…</span></td></tr>
      )}
      {expanded && expandedRows.map((entry) => (
        <Fragment key={`${entry.kind}-${entry.id}`}>{entry.node}</Fragment>
      ))}
    </>
  );
}
