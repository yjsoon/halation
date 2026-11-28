import type { ScheduledTransaction, ScheduledTransactionInput, Transaction } from "../api/types";
import { legacyWords } from "./follow-up";

export function activeSchedulesForScope(
  schedules: ScheduledTransaction[],
  accountIds: ReadonlySet<string>,
): ScheduledTransaction[] {
  return schedules
    .filter((schedule) => !schedule.deleted && typeof schedule.account_id === "string" && accountIds.has(schedule.account_id))
    .sort((left, right) =>
      String(left.date_next ?? left.date_first ?? "9999-12-31")
        .localeCompare(String(right.date_next ?? right.date_first ?? "9999-12-31"))
      || left.id.localeCompare(right.id));
}

export function scheduledAmount(schedule: ScheduledTransaction): number {
  if (Number.isSafeInteger(schedule.amount)) return Number(schedule.amount);
  return (schedule.subtransactions ?? []).reduce(
    (sum, line) => sum + (Number.isSafeInteger(line.amount) ? line.amount : 0),
    0,
  );
}

export function scheduleRecurrence(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
    never: "Once",
    twiceamonth: "Twice a month",
    twiceayear: "Twice a year",
    everyotherweek: "Every other week",
    everyothermonth: "Every other month",
  };
  if (!value) return "Recurring";
  const key = value.trim().toLowerCase();
  if (labels[key]) return labels[key];
  const words = value.trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : "Recurring";
}

/** Every frequency the API accepts, with the label a Repeat select shows. */
export const SCHEDULE_FREQUENCIES: ReadonlyArray<readonly [string, string]> = [
  ["never", "Once"], ["daily", "Daily"], ["weekly", "Weekly"], ["everyOtherWeek", "Every other week"],
  ["every4Weeks", "Every 4 weeks"], ["monthly", "Monthly"], ["everyOtherMonth", "Every other month"],
  ["every3Months", "Every 3 months"], ["every4Months", "Every 4 months"], ["twiceAMonth", "Twice a month"],
  ["yearly", "Yearly"], ["everyOtherYear", "Every other year"], ["twiceAYear", "Twice a year"],
];

/**
 * A schedule that repeats a saved transaction. The transaction stays the
 * first occurrence; the schedule's next date is the first one on or after
 * today. Schedules name payees by ID, so `payeeIds` maps names the row only
 * stores as text. Null when nothing repeats.
 */
export function repeatScheduleInput(
  txn: Transaction,
  frequency: string,
  today: string,
  payeeIds: ReadonlyMap<string, string>,
): ScheduledTransactionInput | null {
  const next = nextRepeatDate(txn.date, frequency, today);
  if (!next) return null;
  const payeeId = (id: string | null, name: string | null | undefined) => id ?? payeeIds.get(name?.trim() ?? "") ?? null;
  const lines = (txn.subtransactions ?? []).filter((line) => !line.deleted);
  const split = lines.length > 0;
  return {
    account_id: txn.account_id,
    date_first: txn.date,
    date_next: next,
    frequency,
    amount: txn.amount,
    payee_id: !split && txn.transfer_account_id ? null : payeeId(txn.payee_id, txn.payee_name),
    category_id: split ? null : txn.category_id,
    transfer_account_id: split ? null : txn.transfer_account_id,
    memo: legacyWords(txn.memo).text || null,
    flag_color: txn.flag_color,
    subtransactions: lines.map((line) => ({
      amount: line.amount,
      payee_id: line.transfer_account_id ? null : payeeId(line.payee_id, line.payee_name),
      category_id: line.transfer_account_id ? null : line.category_id,
      transfer_account_id: line.transfer_account_id ?? null,
      memo: line.memo,
    })),
  };
}

/** Payee names a repeat of `txn` would lose, because no payee record has them yet. */
export function unresolvedRepeatPayees(txn: Transaction): string[] {
  const lines = (txn.subtransactions ?? []).filter((line) => !line.deleted && !line.transfer_account_id);
  const named = [
    ...(lines.length || txn.transfer_account_id ? [] : [{ id: txn.payee_id, name: txn.payee_name }]),
    ...lines.map((line) => ({ id: line.payee_id, name: line.payee_name })),
  ];
  return [...new Set(named.filter((entry) => !entry.id && entry.name?.trim()).map((entry) => entry.name!.trim()))];
}

/**
 * The first occurrence after `date` that falls on or after `today`, counted
 * as the server counts them (apps/api nextScheduledOccurrence), so repeating a
 * transaction never back-fills missed dates. Null when nothing repeats.
 */
export function nextRepeatDate(date: string, frequency: string, today: string): string | null {
  let cursor = nextOccurrence(date, date, frequency);
  while (cursor !== null && cursor < today) cursor = nextOccurrence(date, cursor, frequency);
  return cursor;
}

function nextOccurrence(first: string, current: string, frequency: string): string | null {
  const days: Record<string, number> = { daily: 1, weekly: 7, everyOtherWeek: 14, every4Weeks: 28 };
  if (days[frequency]) return addDays(current, days[frequency]);
  if (frequency === "twiceAMonth") return nextTwiceMonthly(first, current);
  const months: Record<string, number> = {
    monthly: 1, everyOtherMonth: 2, every3Months: 3, every4Months: 4, twiceAYear: 6, yearly: 12, everyOtherYear: 24,
  };
  return months[frequency] ? anchoredMonth(current, months[frequency], Number(first.slice(8, 10))) : null;
}

function addDays(value: string, count: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function anchoredMonth(value: string, offset: number, anchorDay: number): string {
  const monthIndex = Number(value.slice(5, 7)) - 1 + offset;
  const year = Number(value.slice(0, 4)) + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(Math.min(anchorDay, lastDay)).padStart(2, "0")}`;
}

function nextTwiceMonthly(first: string, current: string): string | null {
  const offset = (Number(current.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(current.slice(5, 7)) - Number(first.slice(5, 7));
  const anchorDay = Number(first.slice(8, 10));
  const candidates: string[] = [];
  for (let step = Math.max(0, offset - 2); step <= offset + 3; step += 1) {
    const anchor = anchoredMonth(first, step, anchorDay);
    candidates.push(anchor, addDays(anchor, 15));
  }
  return candidates.sort().find((candidate) => candidate > current && candidate >= first) ?? null;
}

export function transferScheduleLabel(accountId: string, accounts: Map<string, string>): string {
  return `Transfer to ${accounts.get(accountId) ?? "account"}`;
}
