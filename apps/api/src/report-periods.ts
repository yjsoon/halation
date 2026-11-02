import { ValidationError } from "./repository";

const MAX_REPORT_PERIODS = 3660;

/**
 * The start of a report the client asked for without `from`: the earliest
 * transaction, but never more than the period limit before `to`, so one
 * mistyped ancient date cannot make the server reject a range it chose itself.
 */
export function implicitReportStart(earliest: string, to: string, interval: string): string {
  if (earliest > to) return to;
  const floor = new Date(`${to}T00:00:00Z`);
  const steps = MAX_REPORT_PERIODS - 1;
  if (interval === "day") floor.setUTCDate(floor.getUTCDate() - steps);
  else if (interval === "week") floor.setUTCDate(floor.getUTCDate() - steps * 7);
  else if (interval === "year") floor.setUTCFullYear(floor.getUTCFullYear() - steps, 0, 1);
  else floor.setUTCFullYear(floor.getUTCFullYear(), floor.getUTCMonth() - steps, 1);
  return new Date(`${earliest}T00:00:00Z`) < floor ? floor.toISOString().slice(0, 10) : earliest;
}

/** Bound calendar expansion identically for the SQLite and D1 reports. */
export function validateReportPeriods(from: string, to: string, interval: string): void {
  const dates = [from, to].map((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime())
      || date.toISOString().slice(0, 10) !== value) {
      throw new ValidationError("Report dates must be valid YYYY-MM-DD calendar dates");
    }
    return date;
  });
  const [start, end] = dates;
  if (!["day", "week", "month", "year"].includes(interval)) throw new ValidationError("Invalid report interval");
  if (start > end) throw new ValidationError("Report from must not be after to");
  const days = (end.getTime() - start.getTime()) / 86400000;
  const count = interval === "day" ? days + 1
    : interval === "week" ? Math.floor(days / 7) + 1
      : interval === "year" ? end.getUTCFullYear() - start.getUTCFullYear() + 1
        : (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
  if (count > MAX_REPORT_PERIODS) throw new ValidationError("Reports support at most 3660 periods; use a coarser interval or shorter range");
}
