import type { Account, CardPaymentCycle, CardPaymentTerms } from "../api/types";
import { formatDayMonth } from "./dates";
import { stableHash } from "./hash";
import { formatMoney } from "./money";

/** Account types that can carry card payment terms; the server refuses the rest. */
const CARD_ACCOUNT_TYPES: ReadonlySet<string> = new Set(["creditCard", "lineOfCredit"]);

export function isCardAccount(account: Pick<Account, "type" | "deleted">): boolean {
  return !account.deleted && CARD_ACCOUNT_TYPES.has(account.type ?? "");
}

export type BankPresetId = "dbs" | "ocbc" | "uob" | "other";

/** Statement-to-due gaps and weekend rules from the Singapore card terms; Other leaves both to the user. */
export const BANK_PRESETS: Array<{ id: Exclude<BankPresetId, "other">; label: string; gap: number; rule: CardPaymentTerms["due_weekend_rule"] }> = [
  { id: "dbs", label: "DBS / POSB", gap: 25, rule: "next" },
  { id: "ocbc", label: "OCBC", gap: 23, rule: "previous" },
  { id: "uob", label: "UOB", gap: 21, rule: "next" },
];

export function presetFor(gap: number, rule: CardPaymentTerms["due_weekend_rule"]): BankPresetId {
  return BANK_PRESETS.find((preset) => preset.gap === gap && preset.rule === rule)?.id ?? "other";
}

/**
 * The Idempotency-Key the phone and the web both send for "schedule this
 * statement's payment", so a second tap anywhere replays rather than doubles.
 * A suffix makes a fresh key when that schedule was deleted and the user
 * schedules the statement again.
 */
export function cardPaymentKey(accountId: string, statementDate: string, suffix?: string): string {
  const raw = ["card-pay", accountId, statementDate, ...(suffix ? [suffix] : [])].join(":");
  const clean = raw.replace(/[^A-Za-z0-9._:-]/g, "-");
  if (clean.length <= 128) return clean;
  return `card-pay:${stableHash(clean)}${stableHash(`${clean}#`)}:${statementDate}`;
}

/** Partial, overdue and unscheduled cycles are not covered: reminders continue and Schedule… is offered. */
export function needsScheduling(cycle: CardPaymentCycle): boolean {
  const coverage = cycle.coverage;
  if (coverage.state === "partial") return coverage.remaining_amount > 0;
  if (coverage.state === "overdue") return true;
  return coverage.state === "unscheduled" && (cycle.statement_balance > 0 || cycle.previous_unpaid !== null);
}

/**
 * What is still owed for the cycle. The current statement balance already
 * includes any carried previous debt net of earlier payments, so it is the
 * base; only payments in this cycle's own window come off it. A carried
 * previous statement's (older, larger) balance is never used.
 */
function outstanding(cycle: CardPaymentCycle): number {
  const coverage = cycle.coverage;
  if (coverage.state === "partial") return coverage.remaining_amount;
  const paid = coverage.state === "overdue" ? coverage.paid_amount : 0;
  return Math.max(cycle.statement_balance - paid, 0);
}

/** The positive amount the card's usual rule would pay this cycle. */
export function usualPaymentAmount(cycle: CardPaymentCycle, terms: CardPaymentTerms | undefined): number {
  const remaining = outstanding(cycle);
  if (terms?.default_amount_rule === "minimum") {
    const paid = cycle.coverage.state === "partial" || cycle.coverage.state === "overdue" ? cycle.coverage.paid_amount : 0;
    const minimum = Math.max(cycle.minimum_due, cycle.previous_unpaid?.minimum_due ?? 0);
    return Math.min(Math.max(minimum - paid, 0), remaining);
  }
  if (terms?.default_amount_rule === "fixed" && terms.default_amount_milli && terms.default_amount_milli > 0) return terms.default_amount_milli;
  return remaining;
}

/** The suggested pay day, kept inside the cycle's payment window and not in the past. */
export function payDateFor(cycle: CardPaymentCycle, today: string): string {
  const floor = today > cycle.window_start ? today : cycle.window_start;
  const date = cycle.default_pay_date < floor ? floor : cycle.default_pay_date;
  return date > cycle.window_end ? cycle.window_end : date;
}

const MEMO_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Shared with iOS, exactly: "<card account name> statement <d MMM>", e.g. "Card A statement 3 Oct", whatever the plan's date format. */
export function cardPaymentMemo(cardName: string, statementDate: string): string {
  return `${cardName} statement ${Number(statementDate.slice(8, 10))} ${MEMO_MONTHS[Number(statementDate.slice(5, 7)) - 1]}`;
}

type CoverageTone = "needs" | "scheduled" | "posted" | "paid" | "overdue" | "quiet";

export function coverageStatus(cycle: CardPaymentCycle, accountNames: Map<string, string>): { label: string; tone: CoverageTone } {
  const coverage = cycle.coverage;
  switch (coverage.state) {
    case "scheduled":
      return { label: `Scheduled ${formatDayMonth(coverage.pay_date)} from ${accountNames.get(coverage.funding_account_id) ?? "another account"}`, tone: "scheduled" };
    case "posted":
      return { label: `Posted ${formatDayMonth(coverage.date)}, awaiting approval`, tone: "posted" };
    case "paid":
      return { label: `Paid ${formatMoney(coverage.amount)} on ${formatDayMonth(coverage.date)}`, tone: "paid" };
    case "settled":
      return { label: "Nothing owed now", tone: "paid" };
    case "partial":
      return { label: `${formatMoney(coverage.paid_amount)} of ${formatMoney(coverage.paid_amount + coverage.remaining_amount)} paid`, tone: "needs" };
    case "overdue":
      return { label: `Overdue since ${formatDayMonth(coverage.since)}`, tone: "overdue" };
    default:
      return cycle.statement_balance > 0 || cycle.previous_unpaid ? { label: "Unscheduled", tone: "needs" } : { label: "Nothing to pay", tone: "quiet" };
  }
}
