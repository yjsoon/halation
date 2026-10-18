import type { Account, CardPaymentCycle, CardPaymentTerms } from "../api/types";
import { formatDayMonth } from "./dates";
import { stableHash } from "./hash";

/** Account types that can carry card payment terms; the server refuses the rest. */
export const CARD_ACCOUNT_TYPES: ReadonlySet<string> = new Set(["creditCard", "lineOfCredit"]);

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

/** A statement with something owed and nothing in place to pay it. */
export function needsScheduling(cycle: CardPaymentCycle): boolean {
  return cycle.statement_balance > 0 && (cycle.coverage.state === "unscheduled" || cycle.coverage.state === "overdue");
}

/** The positive amount the card's usual rule would pay this cycle. */
export function usualPaymentAmount(cycle: CardPaymentCycle, terms: CardPaymentTerms | undefined): number {
  if (terms?.default_amount_rule === "minimum") return cycle.minimum_due;
  if (terms?.default_amount_rule === "fixed" && terms.default_amount_milli && terms.default_amount_milli > 0) return terms.default_amount_milli;
  return Math.max(cycle.statement_balance, 0);
}

export function cardPaymentMemo(cardName: string, statementDate: string): string {
  return `${cardName} statement ${formatDayMonth(statementDate)}`;
}

export type CoverageTone = "needs" | "scheduled" | "posted" | "paid" | "overdue" | "quiet";

export function coverageStatus(cycle: CardPaymentCycle, accountNames: Map<string, string>): { label: string; tone: CoverageTone } {
  const coverage = cycle.coverage;
  switch (coverage.state) {
    case "scheduled":
      return { label: `Scheduled ${formatDayMonth(coverage.pay_date)} from ${accountNames.get(coverage.funding_account_id) ?? "another account"}`, tone: "scheduled" };
    case "posted":
      return { label: `Posted ${formatDayMonth(coverage.date)}, awaiting approval`, tone: "posted" };
    case "paid":
      return { label: `Paid ${formatDayMonth(coverage.date)}`, tone: "paid" };
    case "overdue":
      return { label: `Overdue since ${formatDayMonth(cycle.due_date)}`, tone: "overdue" };
    default:
      return cycle.statement_balance > 0 ? { label: "Unscheduled", tone: "needs" } : { label: "Nothing to pay", tone: "quiet" };
  }
}
