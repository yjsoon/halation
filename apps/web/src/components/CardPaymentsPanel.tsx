import type { Account, CardPaymentCycle, CardPaymentTerms } from "../api/types";
import { coverageStatus, needsScheduling } from "../lib/card-payments";
import { formatDayMonth, formatWeekdayDayMonth } from "../lib/dates";
import { formatMoney } from "../lib/money";

type CardRow = { account: Account; terms: CardPaymentTerms; current?: CardPaymentCycle; next?: CardPaymentCycle };

/**
 * Payments due, above the schedule list: one row per card with terms, showing
 * the current statement and how it is covered. The web only schedules; paying
 * is recorded in the register (or by the schedule materialising).
 */
export function CardPaymentsPanel({
  asOf,
  cycles,
  terms,
  cardAccounts,
  accountNames,
  loading,
  busy,
  onSchedule,
  onEditSchedule,
  onEditTerms,
}: {
  asOf: string | null;
  cycles: CardPaymentCycle[];
  terms: CardPaymentTerms[];
  cardAccounts: Account[];
  accountNames: Map<string, string>;
  loading: boolean;
  busy: boolean;
  onSchedule: (cycle: CardPaymentCycle, terms: CardPaymentTerms) => void;
  onEditSchedule: (scheduledTransactionId: string) => void;
  onEditTerms: (accountId: string | null) => void;
}) {
  const accountsById = new Map(cardAccounts.map((account) => [account.id, account]));
  const rows: CardRow[] = terms
    .flatMap((entry) => {
      const account = accountsById.get(entry.account_id);
      if (!account || account.closed) return [];
      const own = cycles.filter((cycle) => cycle.account_id === entry.account_id);
      return [{ account, terms: entry, current: own.find((cycle) => cycle.cycle === "current"), next: own.find((cycle) => cycle.cycle === "next") }];
    })
    .sort(compareRows);
  const unconfigured = cardAccounts.filter((account) => !account.closed && !terms.some((entry) => entry.account_id === account.id));

  if (rows.length === 0) {
    if (unconfigured.length === 0) return null;
    return (
      <section className="card-payments-setup" aria-labelledby="card-payments-setup-heading">
        <div>
          <span className="section-title" id="card-payments-setup-heading">Card payments</span>
          <span className="section-meta">Track each card's statement and due date, and schedule the payment from here.</span>
        </div>
        <button type="button" className="register-add-link register-secondary-action" onClick={() => onEditTerms(null)} disabled={busy}>Set up payment reminders</button>
      </section>
    );
  }

  return (
    <section className="report-section card-payments" aria-labelledby="card-payments-heading">
      <div className="section-heading">
        <div>
          <h2 id="card-payments-heading" className="section-title">Payments due</h2>
          <span className="section-meta">Amounts are what Halation has recorded up to each statement date. Check your statement for the actual amount.</span>
        </div>
        <span className="section-meta">{loading ? "Refreshing…" : asOf ? `as of ${formatDayMonth(asOf)}` : ""}</span>
      </div>
      <div className="table-wrap table-wrap-wide">
        <table className="ledger-table card-payments-table">
          <thead><tr><th>Card</th><th>Statement</th><th>Due</th><th className="num">Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map((row) => <CardPaymentRow key={row.account.id} row={row} accountNames={accountNames} busy={busy} onSchedule={onSchedule} onEditSchedule={onEditSchedule} onEditTerms={onEditTerms} />)}</tbody>
        </table>
      </div>
      {unconfigured.length > 0 && (
        <p className="card-payments-footnote">
          {unconfigured.length === 1 ? `${unconfigured[0]!.name} has no payment terms yet.` : `${unconfigured.length} cards have no payment terms yet.`}{" "}
          <button type="button" className="text-button card-payments-inline-button" onClick={() => onEditTerms(null)} disabled={busy}>Set up a card</button>
        </p>
      )}
    </section>
  );
}

function CardPaymentRow({ row, accountNames, busy, onSchedule, onEditSchedule, onEditTerms }: {
  row: CardRow;
  accountNames: Map<string, string>;
  busy: boolean;
  onSchedule: (cycle: CardPaymentCycle, terms: CardPaymentTerms) => void;
  onEditSchedule: (scheduledTransactionId: string) => void;
  onEditTerms: (accountId: string | null) => void;
}) {
  const { account, terms, current, next } = row;
  const name = account.name;
  const termsButton = <button type="button" className="register-row-action" onClick={() => onEditTerms(account.id)} disabled={busy} aria-label={`Payment terms for ${name}`}>Terms</button>;
  if (!terms.enabled || !current) {
    return (
      <tr className="card-payment-row card-payment-row-off">
        <td className="card-payment-name">{name}</td>
        <td colSpan={3} className="card-payment-muted">Statement day {terms.statement_day}</td>
        <td><span className="card-payment-status card-payment-status-quiet">Reminders off</span></td>
        <td className="schedule-actions">{termsButton}</td>
      </tr>
    );
  }
  const status = coverageStatus(current, accountNames);
  const settled = (current.coverage.state === "paid" || current.coverage.state === "settled" || current.statement_balance <= 0) && !current.previous_unpaid;
  const previous = current.previous_unpaid;
  const coverage = current.coverage;
  return (
    <tr className={`card-payment-row card-payment-row-${status.tone}`}>
      <td className="card-payment-name">
        {name}
        <div className="schedule-mobile-detail">Statement {formatDayMonth(current.statement_date)} · due {formatWeekdayDayMonth(current.due_date)}</div>
      </td>
      <td className="schedule-date">{formatDayMonth(current.statement_date)}</td>
      <td className="schedule-date">{formatWeekdayDayMonth(current.due_date)}</td>
      <td className="num card-payment-amount">
        <span className="card-payment-recorded">{current.statement_balance > 0 ? <>{formatMoney(current.statement_balance)} <span className="card-payment-recorded-word">recorded</span></> : "Nothing recorded"}</span>
        {current.statement_balance > 0 && <span className="card-payment-minimum">min {formatMoney(current.minimum_due)}</span>}
      </td>
      <td>
        <span className={`card-payment-status card-payment-status-${status.tone}`}>{status.label}</span>
        {coverage.state === "scheduled" && coverage.amount !== current.statement_balance && <span className="card-payment-minimum">{formatMoney(coverage.amount)} scheduled</span>}
        {coverage.state === "overdue" && coverage.paid_amount > 0 && <span className="card-payment-minimum">{formatMoney(coverage.paid_amount)} paid so far</span>}
        {previous && coverage.state !== "overdue" && <span className="card-payment-warning">Previous statement {formatDayMonth(previous.statement_date)} unpaid, due {formatDayMonth(previous.due_date)}</span>}
        {settled && next && <div className="card-payment-next">Next: statement {formatDayMonth(next.statement_date)}, due {formatWeekdayDayMonth(next.due_date)}</div>}
      </td>
      <td className="schedule-actions">
        {needsScheduling(current) && <button type="button" className="register-row-action card-payment-schedule" onClick={() => onSchedule(current, terms)} disabled={busy} aria-label={`Schedule payment for ${name}`}>Schedule…</button>}
        {coverage.state === "scheduled" && <button type="button" className="register-row-action" onClick={() => onEditSchedule(coverage.scheduled_transaction_id)} disabled={busy} aria-label={`Edit scheduled payment for ${name}`}>Edit</button>}
        {termsButton}
      </td>
    </tr>
  );
}

/** Due date first, as the phone's band sorts; cards with reminders off go last. */
function compareRows(left: CardRow, right: CardRow): number {
  const leftDue = left.terms.enabled && left.current ? left.current.due_date : "9999-12-31";
  const rightDue = right.terms.enabled && right.current ? right.current.due_date : "9999-12-31";
  return leftDue.localeCompare(rightDue) || left.account.name.localeCompare(right.account.name);
}
