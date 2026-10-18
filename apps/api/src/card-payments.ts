/**
 * Pure card payment maths: terms validation, cycle dates, statement balance,
 * minimum due and coverage. No database calls, so the Worker, the Bun server
 * and the phone's engine compute the same dates from the same rows.
 *
 * Dates are ISO calendar dates (`YYYY-MM-DD`) handled in UTC arithmetic; time
 * zones only matter for choosing `asOf`, which the caller does.
 */

import { nextScheduledOccurrence } from "./scheduled-transactions";

export class CardPaymentTermsValidationError extends Error {}

import type { CardPaymentCoverage, CardPaymentCycle, CardPaymentTerms } from "@howmuch/contract";

export type { CardPaymentCoverage, CardPaymentCycle, CardPaymentTerms };
export type DueWeekendRule = CardPaymentTerms["due_weekend_rule"];
export type DefaultAmountRule = CardPaymentTerms["default_amount_rule"];

/** Optional extra non-working days (public holidays). Weekends are always non-working. */
export type HolidayList = ReadonlySet<string> | readonly string[];

export const CARD_PAYMENT_ACCOUNT_KINDS: ReadonlySet<string> = new Set(["creditCard", "lineOfCredit"]);

const DEFAULTS = {
  due_gap_days: 25,
  due_weekend_rule: "next" as DueWeekendRule,
  default_funding_account_id: null,
  default_amount_rule: "statement" as DefaultAmountRule,
  default_amount_milli: null,
  minimum_floor_milli: 50_000,
  minimum_rate_bp: 300,
  pay_days_before_due: 2,
  lead_days: 7,
  delivery_hour: 8,
  enabled: true,
};

const TERMS_FIELDS = new Set([
  "account_id", "statement_day", "due_gap_days", "due_weekend_rule", "default_funding_account_id",
  "default_amount_rule", "default_amount_milli", "minimum_floor_milli", "minimum_rate_bp",
  "pay_days_before_due", "lead_days", "delivery_hour", "enabled",
]);

/**
 * Validates a PUT body. PUT replaces the whole row, so an omitted optional
 * field takes its default rather than keeping a stored value.
 */
export function parseCardPaymentTermsInput(value: unknown, accountId: string): CardPaymentTerms {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CardPaymentTermsValidationError("card_payment_terms is required");
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!TERMS_FIELDS.has(key)) throw new CardPaymentTermsValidationError(`card_payment_terms.${key} is not a card payment term`);
  }
  if (input.account_id !== undefined && input.account_id !== accountId) {
    throw new CardPaymentTermsValidationError("card_payment_terms.account_id must match the account in the path");
  }
  const integer = (field: string, min: number, max: number, fallback?: number): number => {
    const raw = input[field];
    if (raw === undefined || raw === null) {
      if (fallback === undefined) throw new CardPaymentTermsValidationError(`card_payment_terms.${field} is required`);
      return fallback;
    }
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < min || raw > max) {
      throw new CardPaymentTermsValidationError(`card_payment_terms.${field} must be an integer from ${min} to ${max}`);
    }
    return raw;
  };
  const choice = <T extends string>(field: string, options: readonly T[], fallback: T): T => {
    const raw = input[field];
    if (raw === undefined || raw === null) return fallback;
    if (typeof raw !== "string" || !options.includes(raw as T)) {
      throw new CardPaymentTermsValidationError(`card_payment_terms.${field} must be one of ${options.join(", ")}`);
    }
    return raw as T;
  };
  const funding = input.default_funding_account_id;
  if (funding !== undefined && funding !== null && (typeof funding !== "string" || !funding.trim())) {
    throw new CardPaymentTermsValidationError("card_payment_terms.default_funding_account_id must be an account id or null");
  }
  if (funding === accountId) {
    throw new CardPaymentTermsValidationError("card_payment_terms.default_funding_account_id cannot be the card itself");
  }
  if (input.enabled !== undefined && input.enabled !== null && typeof input.enabled !== "boolean") {
    throw new CardPaymentTermsValidationError("card_payment_terms.enabled must be true or false");
  }
  const rule = choice("default_amount_rule", ["statement", "minimum", "fixed"] as const, DEFAULTS.default_amount_rule);
  const rawAmount = input.default_amount_milli;
  let amount: number | null = null;
  if (rawAmount !== undefined && rawAmount !== null) {
    if (typeof rawAmount !== "number" || !Number.isSafeInteger(rawAmount) || rawAmount <= 0) {
      throw new CardPaymentTermsValidationError("card_payment_terms.default_amount_milli must be positive integer milliunits or null");
    }
    amount = rawAmount;
  }
  if (rule === "fixed" && amount === null) {
    throw new CardPaymentTermsValidationError("card_payment_terms.default_amount_milli is required when default_amount_rule is fixed");
  }
  return {
    account_id: accountId,
    statement_day: integer("statement_day", 1, 31),
    due_gap_days: integer("due_gap_days", 1, 60, DEFAULTS.due_gap_days),
    due_weekend_rule: choice("due_weekend_rule", ["next", "previous"] as const, DEFAULTS.due_weekend_rule),
    default_funding_account_id: typeof funding === "string" ? funding : null,
    default_amount_rule: rule,
    default_amount_milli: amount,
    minimum_floor_milli: integer("minimum_floor_milli", 0, Number.MAX_SAFE_INTEGER, DEFAULTS.minimum_floor_milli),
    minimum_rate_bp: integer("minimum_rate_bp", 0, 10_000, DEFAULTS.minimum_rate_bp),
    pay_days_before_due: integer("pay_days_before_due", 0, 10, DEFAULTS.pay_days_before_due),
    lead_days: integer("lead_days", 0, 30, DEFAULTS.lead_days),
    delivery_hour: integer("delivery_hour", 0, 23, DEFAULTS.delivery_hour),
    enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULTS.enabled,
  };
}

/** Projects a stored `card_payment_terms` row into the wire shape. */
export function termsFromRow(row: Record<string, any>): CardPaymentTerms {
  return {
    account_id: String(row.account_id),
    statement_day: Number(row.statement_day),
    due_gap_days: Number(row.due_gap_days),
    due_weekend_rule: row.due_weekend_rule === "previous" ? "previous" : "next",
    default_funding_account_id: row.default_funding_account_id ?? null,
    default_amount_rule: row.default_amount_rule === "minimum" || row.default_amount_rule === "fixed" ? row.default_amount_rule : "statement",
    default_amount_milli: row.default_amount_milli == null ? null : Number(row.default_amount_milli),
    minimum_floor_milli: Number(row.minimum_floor_milli),
    minimum_rate_bp: Number(row.minimum_rate_bp),
    pay_days_before_due: Number(row.pay_days_before_due),
    lead_days: Number(row.lead_days),
    delivery_hour: Number(row.delivery_hour),
    enabled: row.enabled === true || Number(row.enabled) === 1,
  };
}

// ---- Calendar arithmetic -------------------------------------------------

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function format(year: number, monthIndex: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addDays(value: string, count: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** The statement date in a month: `statementDay` clamped to that month's length. */
export function statementDateInMonth(year: number, monthIndex: number, statementDay: number): string {
  const normalisedYear = year + Math.floor(monthIndex / 12);
  const normalisedMonth = ((monthIndex % 12) + 12) % 12;
  return format(normalisedYear, normalisedMonth, Math.min(statementDay, daysInMonth(normalisedYear, normalisedMonth)));
}

function holidaySet(holidays?: HolidayList): ReadonlySet<string> {
  if (!holidays) return new Set();
  return holidays instanceof Set ? holidays : new Set(holidays as readonly string[]);
}

export function isWorkingDay(value: string, holidays?: HolidayList): boolean {
  const weekday = new Date(`${value}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidaySet(holidays).has(value);
}

/** Moves a date off a weekend or holiday: forwards for `next`, backwards for `previous`. */
export function adjustToWorkingDay(value: string, rule: DueWeekendRule, holidays?: HolidayList): string {
  const set = holidaySet(holidays);
  let date = value;
  for (let guard = 0; !isWorkingDay(date, set); guard += 1) {
    if (guard > 366) throw new Error("No working day within a year");
    date = addDays(date, rule === "previous" ? -1 : 1);
  }
  return date;
}

/** Statement date plus the gap, moved off a non-working day by the rule. */
export function dueDate(statementDate: string, gapDays: number, rule: DueWeekendRule, holidays?: HolidayList): string {
  return adjustToWorkingDay(addDays(statementDate, gapDays), rule, holidays);
}

/** The date `count` working days before `value`; `count` 0 returns `value` itself. */
export function workingDaysBefore(value: string, count: number, holidays?: HolidayList): string {
  const set = holidaySet(holidays);
  let date = value;
  let remaining = count;
  while (remaining > 0) {
    date = addDays(date, -1);
    if (isWorkingDay(date, set)) remaining -= 1;
  }
  return date;
}

export type CycleDates = {
  statement_date: string;
  /** The following statement date; the cycle's payment window ends the day before it. */
  next_statement_date: string;
  due_date: string;
  last_safe_pay_date: string;
};

function cycleDatesFrom(terms: Pick<CardPaymentTerms, "statement_day" | "due_gap_days" | "due_weekend_rule" | "pay_days_before_due">, year: number, monthIndex: number, holidays?: HolidayList): CycleDates {
  const statement = statementDateInMonth(year, monthIndex, terms.statement_day);
  const due = dueDate(statement, terms.due_gap_days, terms.due_weekend_rule, holidays);
  return {
    statement_date: statement,
    next_statement_date: statementDateInMonth(year, monthIndex + 1, terms.statement_day),
    due_date: due,
    last_safe_pay_date: workingDaysBefore(due, terms.pay_days_before_due, holidays),
  };
}

/**
 * The current cycle is the one whose statement date is the latest on or before
 * `asOf`; the next cycle is the one after it.
 */
export function cycleDatesFor(
  terms: Pick<CardPaymentTerms, "statement_day" | "due_gap_days" | "due_weekend_rule" | "pay_days_before_due">,
  asOf: string,
  holidays?: HolidayList,
): { current: CycleDates; next: CycleDates } {
  const year = Number(asOf.slice(0, 4));
  let monthIndex = Number(asOf.slice(5, 7)) - 1;
  if (statementDateInMonth(year, monthIndex, terms.statement_day) > asOf) monthIndex -= 1;
  return {
    current: cycleDatesFrom(terms, year, monthIndex, holidays),
    next: cycleDatesFrom(terms, year, monthIndex + 1, holidays),
  };
}

// ---- Money ---------------------------------------------------------------

/** Higher of the floor and the rate, rounded up to a cent, capped at the balance. Zero when nothing is owed. */
export function minimumDue(statementBalance: number, floorMilli: number, rateBp: number): number {
  if (statementBalance <= 0) return 0;
  const byRate = Math.ceil((statementBalance * rateBp) / 10_000 / 10) * 10;
  return Math.min(statementBalance, Math.max(floorMilli, byRate));
}

// ---- Coverage ------------------------------------------------------------

/** A live register row in the card account. */
export type CardLedgerRow = {
  id: string;
  date: string;
  amount: number;
  approved: boolean;
  cleared: string;
  transfer_account_id: string | null;
};

/** A live schedule as the schedules collection returns it. */
export type CardScheduleRow = {
  id: string;
  account_id: string;
  date_first: string;
  date_next: string;
  frequency: string;
  amount: number;
  payee_id?: string | null;
  transfer_account_id?: string | null;
  subtransactions?: unknown[];
};

export type CoverageInput = {
  accountId: string;
  /** The card's own `Transfer : <card>` payee, so a schedule naming it counts as a transfer into the card. */
  transferPayeeId: string | null;
  /** Each funding account's own transfer payee, to recognise a schedule kept on the card side. */
  transferPayeeAccounts: ReadonlyMap<string, string>;
  dates: CycleDates;
  asOf: string;
  statementBalance: number;
  rows: readonly CardLedgerRow[];
  schedules: readonly CardScheduleRow[];
};

/** Rows that pay this cycle: transfers into the card dated after the statement date and before the next one. */
function inWindow(date: string, dates: CycleDates): boolean {
  return date > dates.statement_date && date < dates.next_statement_date;
}

function scheduleInflow(schedule: CardScheduleRow, input: CoverageInput): { amount: number; fundingAccountId: string } | null {
  if (Array.isArray(schedule.subtransactions) && schedule.subtransactions.length > 0) return null;
  const amount = Number(schedule.amount);
  if (schedule.account_id !== input.accountId) {
    const intoCard = schedule.transfer_account_id === input.accountId
      || (input.transferPayeeId != null && schedule.payee_id === input.transferPayeeId);
    return intoCard && amount < 0 ? { amount: -amount, fundingAccountId: schedule.account_id } : null;
  }
  const funding = schedule.transfer_account_id
    ?? (schedule.payee_id ? input.transferPayeeAccounts.get(schedule.payee_id) ?? null : null);
  return funding && funding !== input.accountId && amount > 0 ? { amount, fundingAccountId: funding } : null;
}

/** The first occurrence of a schedule inside the cycle's window, if any. */
function occurrenceInWindow(schedule: CardScheduleRow, dates: CycleDates): string | null {
  let date: string | null = schedule.date_next ?? schedule.date_first;
  for (let guard = 0; date && date < dates.next_statement_date && guard < 400; guard += 1) {
    if (inWindow(date, dates)) return date;
    date = nextScheduledOccurrence(schedule.date_first, date, schedule.frequency);
  }
  return null;
}

/**
 * Paid beats posted beats scheduled. Paid: an approved or cleared transfer
 * into the card in the window (amount is their sum). Posted: only unapproved,
 * uncleared ones (typically a materialised schedule awaiting approval).
 * Scheduled: a schedule into the card with an occurrence in the window.
 * Otherwise overdue once `asOf` is past the due date with something owed.
 */
export function coverageFor(input: CoverageInput): CardPaymentCoverage {
  const transfers = input.rows
    .filter((row) => row.amount > 0 && row.transfer_account_id != null && inWindow(row.date, input.dates))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const settled = transfers.filter((row) => row.approved || row.cleared === "cleared" || row.cleared === "reconciled");
  if (settled.length > 0) {
    const latest = settled[settled.length - 1]!;
    return { state: "paid", transaction_id: latest.id, amount: settled.reduce((sum, row) => sum + row.amount, 0), date: latest.date };
  }
  if (transfers.length > 0) {
    const latest = transfers[transfers.length - 1]!;
    return { state: "posted", transaction_id: latest.id, approved: false, amount: transfers.reduce((sum, row) => sum + row.amount, 0), date: latest.date };
  }
  const scheduled = input.schedules
    .map((schedule) => {
      const inflow = scheduleInflow(schedule, input);
      const payDate = inflow ? occurrenceInWindow(schedule, input.dates) : null;
      return inflow && payDate ? { schedule, inflow, payDate } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => left.payDate.localeCompare(right.payDate) || left.schedule.id.localeCompare(right.schedule.id));
  if (scheduled.length > 0) {
    const first = scheduled[0]!;
    return {
      state: "scheduled",
      scheduled_transaction_id: first.schedule.id,
      pay_date: first.payDate,
      amount: first.inflow.amount,
      funding_account_id: first.inflow.fundingAccountId,
    };
  }
  if (input.asOf > input.dates.due_date && input.statementBalance > 0) return { state: "overdue" };
  return { state: "unscheduled" };
}

export type CardCyclesInput = {
  terms: CardPaymentTerms;
  asOf: string;
  /**
   * The card's balance at the end of a date: opening balance plus every live
   * row dated on or before it. Called with each cycle's statement date.
   */
  balanceThrough: (date: string) => number;
  /** `accounts.balance_milli`, the balance including every live row. */
  balance: number;
  transferPayeeId: string | null;
  transferPayeeAccounts: ReadonlyMap<string, string>;
  /** Transfers into the card; only rows inside a cycle's window are read. */
  rows: readonly CardLedgerRow[];
  schedules: readonly CardScheduleRow[];
  holidays?: HolidayList;
};

/** The current and next cycle for one card. */
export function cardCycles(input: CardCyclesInput): CardPaymentCycle[] {
  const { current, next } = cycleDatesFor(input.terms, input.asOf, input.holidays);
  return ([["current", current], ["next", next]] as const).map(([cycle, dates]) => {
    const statementBalance = -input.balanceThrough(dates.statement_date);
    return {
      account_id: input.terms.account_id,
      cycle,
      statement_date: dates.statement_date,
      due_date: dates.due_date,
      last_safe_pay_date: dates.last_safe_pay_date,
      // Never suggest a pay day in the past: once the last safe day has gone,
      // the earliest possible day is today.
      default_pay_date: dates.last_safe_pay_date < input.asOf ? input.asOf : dates.last_safe_pay_date,
      statement_balance: statementBalance,
      minimum_due: minimumDue(statementBalance, input.terms.minimum_floor_milli, input.terms.minimum_rate_bp),
      current_balance: -input.balance,
      coverage: coverageFor({
        accountId: input.terms.account_id,
        transferPayeeId: input.transferPayeeId,
        transferPayeeAccounts: input.transferPayeeAccounts,
        dates,
        asOf: input.asOf,
        statementBalance,
        rows: input.rows,
        schedules: input.schedules,
      }),
    };
  });
}

/** Today's date in `timeZone`, falling back to UTC for an unknown zone. */
export function localDate(now: Date, timeZone: string | undefined): string {
  const formatWith = (zone: string | undefined) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };
  try {
    return formatWith(timeZone);
  } catch {
    return formatWith("UTC");
  }
}
