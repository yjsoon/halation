import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { calendarMonthOf, monthRange, reportPeriods, shiftMonth, trailingMonthsRange } from "./dates";

// A normal browser fixture cannot expose SQLite's week 00, the split week at
// New Year, leap days, or DST. Missing these would drop or duplicate activity.
describe("report period boundaries", () => {
  test("keeps empty calendar months and clips the first and last periods", () => {
    expect(reportPeriods("2026-05-20", "2026-07-03", "month")).toEqual([
      { period: "2026-05", from: "2026-05-20", to: "2026-05-31" },
      { period: "2026-06", from: "2026-06-01", to: "2026-06-30" },
      { period: "2026-07", from: "2026-07-01", to: "2026-07-03" },
    ]);
  });

  test("uses SQLite Monday weeks, including a partial week zero at New Year", () => {
    expect(reportPeriods("2025-12-29", "2026-01-06", "week")).toEqual([
      { period: "2025-W52", from: "2025-12-29", to: "2025-12-31" },
      { period: "2026-W00", from: "2026-01-01", to: "2026-01-04" },
      { period: "2026-W01", from: "2026-01-05", to: "2026-01-06" },
    ]);
    expect(reportPeriods("2024-01-01", "2024-01-01", "week")[0].period).toBe("2024-W01");
  });

  test("retains leap days and calendar days across daylight saving", () => {
    expect(reportPeriods("2028-02-28", "2028-03-01", "day").map((p) => p.period))
      .toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(reportPeriods("2026-03-07", "2026-03-09", "day").map((p) => p.period))
      .toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
    expect(reportPeriods("2025-12-31", "2026-01-01", "year")).toEqual([
      { period: "2025", from: "2025-12-31", to: "2025-12-31" },
      { period: "2026", from: "2026-01-01", to: "2026-01-01" },
    ]);
  });
});

// The browser exercises today's preset, but cannot cover a leap-day month end
// or prove that the shared register/rewards month bounds remain unchanged.
describe("report month boundaries", () => {
  afterEach(() => setSystemTime());

  test("recognises a month-to-date range without recognising arbitrary partial months", () => {
    setSystemTime(new Date(2026, 10, 17, 12));
    expect(calendarMonthOf("2026-11-01", "2026-11-17")).toBe("2026-11");
    expect(calendarMonthOf("2026-11-01", "2026-11-16")).toBeNull();
    expect(calendarMonthOf("2026-10-01", "2026-10-17")).toBeNull();
    expect(calendarMonthOf("2026-11-01", "2026-11-30")).toBe("2026-11");
  });

  test("caps the report stepper on today without shortening previous months or other callers", () => {
    setSystemTime(new Date(2028, 1, 10, 12));
    expect(shiftMonth("2028-01", 1, true)).toEqual({ from: "2028-02-01", to: "2028-02-10" });
    expect(shiftMonth("2028-02", -1, true)).toEqual({ from: "2028-01-01", to: "2028-01-31" });
    expect(shiftMonth("2028-01", 1)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange()).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange(-1)).toEqual({ from: "2028-01-01", to: "2028-01-31" });
  });
});

// Failure mode: Date#setMonth overflows a month-end day into the following
// month (31 May minus 3 months is "31 Feb", i.e. 3 Mar), so trailing presets
// silently drop the last days of the target month. iOS clamps instead.
describe("trailingMonthsRange", () => {
  test("clamps a month-end start to the shorter target month", () => {
    expect(trailingMonthsRange(3, new Date(2026, 4, 31))).toEqual({ from: "2026-02-28", to: "2026-05-31" });
    expect(trailingMonthsRange(2, new Date(2026, 3, 30))).toEqual({ from: "2026-02-28", to: "2026-04-30" });
    expect(trailingMonthsRange(12, new Date(2028, 1, 29))).toEqual({ from: "2027-02-28", to: "2028-02-29" });
  });

  test("keeps the same day when the target month has it", () => {
    expect(trailingMonthsRange(2, new Date(2026, 7, 28))).toEqual({ from: "2026-06-28", to: "2026-08-28" });
  });
});
