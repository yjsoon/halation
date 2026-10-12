import { describe, expect, test } from "bun:test";
import { trailingMonthsRange } from "./dates";

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
