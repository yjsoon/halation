import type { RewardsReport } from "../api/types";
import type { Stage } from "./reward-exposure";

/*
 * The Skyline board's row rules (docs/frontend/rewards-exposure-card.md "Skyline"): how tall a
 * stacked row stands and the period's day count for the day rails (the gate row's pace is in rowText).
 * Civil dates are counted from their string parts with Date.UTC, as the projection does.
 */

type Calculation = RewardsReport["cards"][number]["calculation"];

/** Gate: still working towards a minimum. Climb: climbing to a cap or a tier. Noon: everything settled. */
type RowSize = "gate" | "climb" | "noon";

export function rowSize(stage: Stage | null | undefined): RowSize {
  return stage === "gate" ? "gate" : stage === "climb" ? "climb" : "noon";
}

export interface PeriodDays {
  start: string;
  end: string;
  /** Days in the period, both ends included. */
  total: number;
  /** The as-of day, 1 to total. */
  day: number;
  /** The day the minimum was met, 1 to total, when it was and the day is known. */
  metDay: number | null;
  metOn: string | null;
}

function utcDay(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000 : null;
}

/** The card period holding the as-of day (the latest one if periods overlap), or null outside any period. */
export function periodDays(calc: Calculation, asOf: string | undefined): PeriodDays | null {
  if (!asOf) return null;
  const period = calc.periods?.filter((entry) => entry.start <= asOf && asOf <= entry.end).at(-1);
  if (!period) return null;
  const start = utcDay(period.start), end = utcDay(period.end), today = utcDay(asOf);
  if (start == null || end == null || today == null || end < start) return null;
  const total = end - start + 1;
  // A met day only once the minimum counts as met (as iOS): a later refund can leave a stale date.
  const metOn = calc.minimum_spend_met ? period.calculation?.minimum_met_on ?? calc.minimum_met_on ?? null : null;
  const met = metOn ? utcDay(metOn) : null;
  return {
    start: period.start,
    end: period.end,
    total,
    day: Math.min(total, Math.max(1, today - start + 1)),
    metDay: met != null && met >= start && met <= end ? met - start + 1 : null,
    metOn: met != null && met >= start && met <= end ? metOn : null,
  };
}

export type MonthlyQualification = NonNullable<Calculation["monthly_qualifications"]>[number];

/** The monthly-minimum month holding the as-of day, if the card has a monthly minimum. */
export function activeMonth(calc: Calculation, asOf: string | undefined): MonthlyQualification | null {
  if (!asOf) return null;
  return calc.monthly_qualifications?.find((month) => month.start <= asOf && asOf <= month.end) ?? null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "17 May": the rails' day labels. */
export function dayMonth(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]}` : iso;
}
