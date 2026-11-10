import { isStorableMilliunits } from "@howmuch/money";
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
/** The stored, writable fields: everything but the server-set `created_at`. */
export type CardPaymentTermsFields = Omit<CardPaymentTerms, "created_at">;
type DueWeekendRule = CardPaymentTerms["due_weekend_rule"];
type DefaultAmountRule = CardPaymentTerms["default_amount_rule"];

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
  // Server-set; accepted and ignored so a client can send back what it read.
  "created_at",
]);

/**
 * Validates a PUT body. PUT replaces the whole row, so an omitted optional
 * field takes its default rather than keeping a stored value.
 */
export function parseCardPaymentTermsInput(value: unknown, accountId: string): CardPaymentTermsFields {
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
    if (!isStorableMilliunits(rawAmount) || rawAmount <= 0) {
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
    created_at: isoTimestamp(row.created_at),
  };
}

/** SQLite's `CURRENT_TIMESTAMP` ("2026-10-18 12:01:48", UTC) as ISO 8601 with a Z. */
function isoTimestamp(value: unknown): string {
  const text = String(value ?? "");
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(text);
  return match ? `${match[1]}T${match[2]}Z` : text;
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
function statementDateInMonth(year: number, monthIndex: number, statementDay: number): string {
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
function adjustToWorkingDay(value: string, rule: DueWeekendRule, holidays?: HolidayList): string {
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
function workingDaysBefore(value: string, count: number, holidays?: HolidayList): string {
  const set = holidaySet(holidays);
  let date = value;
  let remaining = count;
  while (remaining > 0) {
    date = addDays(date, -1);
    if (isWorkingDay(date, set)) remaining -= 1;
  }
  return date;
}

type CycleTerms = Pick<CardPaymentTerms, "statement_day" | "due_gap_days" | "due_weekend_rule" | "pay_days_before_due">;

type CycleDates = {
  statement_date: string;
  next_statement_date: string;
  due_date: string;
  last_safe_pay_date: string;
  /** First day of the payment window (inclusive). */
  window_start: string;
  /** Last day of the payment window (inclusive): the later of the next statement date and the due date. */
  window_end: string;
};

function rawCycle(terms: CycleTerms, year: number, monthIndex: number, holidays?: HolidayList) {
  const statement = statementDateInMonth(year, monthIndex, terms.statement_day);
  const nextStatement = statementDateInMonth(year, monthIndex + 1, terms.statement_day);
  const due = dueDate(statement, terms.due_gap_days, terms.due_weekend_rule, holidays);
  return { statement, nextStatement, due, end: nextStatement > due ? nextStatement : due };
}

/**
 * Dates for the cycle whose statement falls in `monthIndex` (may run past
 * 0..11). Payment windows tile the calendar: a cycle's window runs from the
 * day after the previous window's end to the later of its next statement date
 * and its own due date. A payment on a statement day therefore pays the
 * previous cycle, and with a gap longer than the month the cycle keeps its
 * window until its due date.
 */
function cycleDatesInMonth(terms: CycleTerms, year: number, monthIndex: number, holidays?: HolidayList): CycleDates {
  const cycle = rawCycle(terms, year, monthIndex, holidays);
  const previous = rawCycle(terms, year, monthIndex - 1, holidays);
  return {
    statement_date: cycle.statement,
    next_statement_date: cycle.nextStatement,
    due_date: cycle.due,
    last_safe_pay_date: workingDaysBefore(cycle.due, terms.pay_days_before_due, holidays),
    window_start: addDays(previous.end, 1),
    window_end: cycle.end,
  };
}

/**
 * The current cycle is the one with the latest statement on or before
 * `asOf`, unless an earlier cycle's due date has not passed yet (a gap longer
 * than the month): that earlier cycle stays current until its due date.
 * `previous` is the cycle before the current one, `next` the one after.
 */
export function cycleDatesFor(terms: CycleTerms, asOf: string, holidays?: HolidayList): { previous: CycleDates; current: CycleDates; next: CycleDates } {
  const year = Number(asOf.slice(0, 4));
  let monthIndex = Number(asOf.slice(5, 7)) - 1;
  if (statementDateInMonth(year, monthIndex, terms.statement_day) > asOf) monthIndex -= 1;
  for (let guard = 0; guard < 3 && rawCycle(terms, year, monthIndex - 1, holidays).due >= asOf; guard += 1) monthIndex -= 1;
  return {
    previous: cycleDatesInMonth(terms, year, monthIndex - 1, holidays),
    current: cycleDatesInMonth(terms, year, monthIndex, holidays),
    next: cycleDatesInMonth(terms, year, monthIndex + 1, holidays),
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
type CardLedgerRow = {
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

type CardContext = {
  accountId: string;
  /** The card's own `Transfer : <card>` payee, so a schedule naming it counts as a transfer into the card. */
  transferPayeeId: string | null;
  /** Each funding account's own transfer payee, to recognise a schedule kept on the card side. */
  transferPayeeAccounts: ReadonlyMap<string, string>;
  rows: readonly CardLedgerRow[];
  schedules: readonly CardScheduleRow[];
};

type CoverageInput = CardContext & {
  dates: CycleDates;
  asOf: string;
  statementBalance: number;
  minimumDue: number;
  /** Date part of the terms' `created_at`: a due date before it is never overdue. */
  termsCreatedOn: string;
};

function inWindow(date: string, dates: CycleDates): boolean {
  return date >= dates.window_start && date <= dates.window_end;
}

function scheduleInflow(schedule: CardScheduleRow, input: CardContext): { amount: number; fundingAccountId: string } | null {
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

/** Occurrences of a schedule from its `date_next` up to and including `through`. */
function occurrencesThrough(schedule: CardScheduleRow, through: string): string[] {
  const dates: string[] = [];
  let date: string | null = schedule.date_next ?? schedule.date_first;
  for (let guard = 0; date && date <= through && guard < 400; guard += 1) {
    dates.push(date);
    date = nextScheduledOccurrence(schedule.date_first, date, schedule.frequency);
  }
  return dates;
}

/**
 * Money a cycle's own rows and schedules say about it, before carry-over and
 * settlement are applied. Best first:
 * - `paid`: approved or cleared transfers into the card in the window reach the minimum due;
 * - `posted`: counting unapproved, uncleared ones too, they reach it;
 * - `scheduled`: a schedule into the card has an occurrence in the window;
 * - `overdue`: the due date has passed (and was on or after the day the terms
 *   were created) with a positive statement balance;
 * - `partial`: something was paid, but less than the minimum;
 * - `unscheduled`.
 */
function coverageFor(input: CoverageInput): CardPaymentCoverage {
  const transfers = input.rows
    .filter((row) => row.amount > 0 && row.transfer_account_id != null && inWindow(row.date, input.dates))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const settledRows = transfers.filter((row) => row.approved || row.cleared === "cleared" || row.cleared === "reconciled");
  const sum = (rows: readonly CardLedgerRow[]) => rows.reduce((total, row) => total + row.amount, 0);
  const settledAmount = sum(settledRows);
  const recordedAmount = sum(transfers);
  if (settledRows.length > 0 && settledAmount >= input.minimumDue) {
    const latest = settledRows[settledRows.length - 1]!;
    return { state: "paid", transaction_id: latest.id, amount: settledAmount, date: latest.date };
  }
  if (transfers.length > settledRows.length && recordedAmount >= input.minimumDue) {
    const latest = transfers[transfers.length - 1]!;
    return { state: "posted", transaction_id: latest.id, approved: false, amount: recordedAmount, date: latest.date };
  }
  const scheduled = input.schedules
    .map((schedule) => {
      const inflow = scheduleInflow(schedule, input);
      const payDate = inflow ? occurrencesThrough(schedule, input.dates.window_end).find((date) => inWindow(date, input.dates)) ?? null : null;
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
  if (input.asOf > input.dates.due_date && input.dates.due_date >= input.termsCreatedOn && input.statementBalance > 0) {
    return { state: "overdue", since: input.dates.due_date, paid_amount: recordedAmount };
  }
  if (transfers.length > 0) {
    const latest = transfers[transfers.length - 1]!;
    return {
      state: "partial",
      transaction_id: latest.id,
      date: latest.date,
      paid_amount: recordedAmount,
      remaining_amount: Math.max(0, input.statementBalance - recordedAmount),
    };
  }
  return { state: "unscheduled" };
}

type CardCyclesInput = CardContext & {
  terms: CardPaymentTermsFields;
  /** Date part of the terms' `created_at`. */
  termsCreatedOn: string;
  asOf: string;
  /**
   * The card's balance at the end of a date: opening balance plus every live
   * row dated on or before it. Called with each cycle's statement date.
   */
  balanceThrough: (date: string) => number;
  /** `accounts.balance_milli`, the balance including every live row. */
  balance: number;
  holidays?: HolidayList;
};

/**
 * The current and next cycle for one card. On top of each cycle's own
 * coverage:
 * - when nothing is owed now (`current_balance <= 0`), a cycle that is not
 *   paid, posted or scheduled is `settled` (covers a payment recorded as a
 *   plain inflow rather than a transfer);
 * - when the previous cycle is overdue and the current cycle is neither
 *   paid, posted, scheduled nor settled, the current cycle is `overdue` since
 *   the previous due date, and `previous_unpaid` describes that statement;
 * - the next cycle's projected statement balance nets off scheduled payments
 *   into the card that have not been entered yet and fall on or before its
 *   statement date.
 */
export function cardCycles(input: CardCyclesInput): CardPaymentCycle[] {
  const { previous, current, next } = cycleDatesFor(input.terms, input.asOf, input.holidays);
  const owedNow = -input.balance;
  const pendingPayments = (through: string) => input.schedules.reduce((total, schedule) => {
    const inflow = scheduleInflow(schedule, input);
    return inflow ? total + inflow.amount * occurrencesThrough(schedule, through).length : total;
  }, 0);
  const evaluate = (dates: CycleDates, statementBalance: number) => {
    const minimum = minimumDue(statementBalance, input.terms.minimum_floor_milli, input.terms.minimum_rate_bp);
    const coverage = coverageFor({ ...input, dates, asOf: input.asOf, statementBalance, minimumDue: minimum, termsCreatedOn: input.termsCreatedOn });
    return { minimum, coverage };
  };
  const previousBalance = -input.balanceThrough(previous.statement_date);
  const previousResult = evaluate(previous, previousBalance);
  // Carry-over only: every inflow counts (transfers and plain positive
  // inflows such as a payment entered without a transfer), never payees.
  const inflowsIn = (from: string, to: string) => input.rows.reduce((total, row) => (row.amount > 0 && row.date >= from && row.date <= to ? total + row.amount : total), 0);
  const previousPaidByInflows = inflowsIn(previous.window_start, previous.window_end) >= previousResult.minimum;
  // A late payment of the previous statement, made in the current window after its due date, clears the carry.
  const paidLate = inflowsIn(addDays(previous.due_date, 1) > current.window_start ? addDays(previous.due_date, 1) : current.window_start, current.window_end) >= previousResult.minimum;
  const previousOverdue = previousResult.coverage.state === "overdue" && !previousPaidByInflows && !paidLate;

  return ([["current", current], ["next", next]] as const).map(([cycle, dates]) => {
    const recorded = -input.balanceThrough(dates.statement_date);
    const statementBalance = cycle === "next" ? recorded - pendingPayments(dates.statement_date) : recorded;
    const { minimum, coverage: own } = evaluate(dates, statementBalance);
    let coverage: CardPaymentCoverage = own;
    let previousUnpaid: CardPaymentCycle["previous_unpaid"] = null;
    const open = own.state === "unscheduled" || own.state === "partial" || own.state === "overdue";
    if (open && owedNow <= 0) {
      coverage = { state: "settled" };
    } else if (cycle === "current" && previousOverdue && own.state !== "paid" && own.state !== "posted") {
      previousUnpaid = {
        statement_date: previous.statement_date,
        due_date: previous.due_date,
        statement_balance: previousBalance,
        minimum_due: previousResult.minimum,
      };
      if (open) {
        const paid = own.state === "partial" || own.state === "overdue" ? own.paid_amount : 0;
        coverage = { state: "overdue", since: previous.due_date, paid_amount: paid };
      }
    }
    const urgent = coverage.state === "overdue";
    const preferred = urgent ? input.asOf : (dates.last_safe_pay_date < input.asOf ? input.asOf : dates.last_safe_pay_date);
    const defaultPayDate = preferred < dates.window_start ? dates.window_start : preferred > dates.window_end ? dates.window_end : preferred;
    return {
      account_id: input.terms.account_id,
      cycle,
      statement_date: dates.statement_date,
      due_date: dates.due_date,
      last_safe_pay_date: dates.last_safe_pay_date,
      default_pay_date: defaultPayDate,
      window_start: dates.window_start,
      window_end: dates.window_end,
      statement_balance: statementBalance,
      minimum_due: minimum,
      current_balance: owedNow,
      coverage,
      previous_unpaid: previousUnpaid,
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
