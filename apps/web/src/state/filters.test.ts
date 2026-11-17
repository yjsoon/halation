import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { applyFilterPatch, filtersFromSearch } from "./filters";
import { REPORT_RANGE_PRESETS } from "../lib/dates";

// A same-day browser check cannot catch a saved report link freezing its end
// at yesterday. Exercise the write/read contract across midnight as well.
describe("rolling report ranges", () => {
  afterEach(() => setSystemTime());

  test("keeps report presets ending today open when saved and read tomorrow", () => {
    for (const preset of REPORT_RANGE_PRESETS.filter((preset) => preset.id !== "last-month")) {
      setSystemTime(new Date(2026, 10, 17, 12));
      const params = applyFilterPatch(new URLSearchParams(), preset.range(), { throughToday: true });
      expect(params.get("to")).toBeNull();
      expect(params.get("range")).toBe(preset.id === "all" ? "all" : null);
      setSystemTime(new Date(2026, 10, 18, 12));
      expect(filtersFromSearch(params, { defaultRange: () => ({}), throughToday: true }).to).toBe("2026-11-18");
    }
  });

  test("keeps fixed report ranges and non-report ranges explicit", () => {
    setSystemTime(new Date(2026, 10, 17, 12));
    for (const to of ["2026-10-31", "2026-12-31"]) {
      expect(applyFilterPatch(new URLSearchParams(), { from: "2026-10-01", to }, { throughToday: true }).get("to")).toBe(to);
    }
    expect(applyFilterPatch(new URLSearchParams(), { to: "2026-11-17" }).get("to")).toBe("2026-11-17");
  });

  test("does not invert a future open range or discard its explicit end", () => {
    setSystemTime(new Date(2026, 10, 17, 12));
    const options = { defaultRange: () => ({}), throughToday: true };
    const future = filtersFromSearch(new URLSearchParams("from=2026-12-01"), options);
    expect(future.from).toBe("2026-12-01");
    expect(future.to).toBeUndefined();
    expect(filtersFromSearch(new URLSearchParams("from=2026-12-01&to=2026-12-31"), options).to).toBe("2026-12-31");
  });
});

describe("applyFilterPatch", () => {
  test("writes empty account and category selections instead of ignoring them", () => {
    const previous = new URLSearchParams("accounts=acc-1&categories=cat-1&from=2026-08-01&to=2026-08-31");
    const next = applyFilterPatch(previous, { accountIds: [], categoryIds: [] });
    expect(next.get("accounts")).toBe("all");
    expect(next.get("categories")).toBeNull();
    expect(next.get("from")).toBe("2026-08-01");
  });

  test("marks a cleared date range as explicit all-time", () => {
    const next = applyFilterPatch(new URLSearchParams("from=2026-08-01&to=2026-08-31"), {
      from: undefined,
      to: undefined,
    });
    expect(next.get("from")).toBeNull();
    expect(next.get("to")).toBeNull();
    expect(next.get("range")).toBe("all");
  });
});

describe("filtersFromSearch", () => {
  test("treats accounts=all as a deliberate empty selection", () => {
    const filters = filtersFromSearch(new URLSearchParams("accounts=all"), {
      defaultRange: () => ({ from: "2026-08-01", to: "2026-08-31" }),
      rememberAccounts: true,
      prefs: { accountIds: ["remembered"] },
    });
    expect(filters.accountIds).toEqual([]);
    expect(filters.from).toBe("2026-08-01");
  });

  test("uses remembered accounts only for opted-in reports without a URL scope", () => {
    const options = {
      defaultRange: () => ({}),
      prefs: { accountIds: ["remembered"], interval: "week" as const },
    };
    expect(filtersFromSearch(new URLSearchParams(), options).accountIds).toEqual([]);
    expect(filtersFromSearch(new URLSearchParams("accounts=explicit"), options).accountIds).toEqual(["explicit"]);
    const filters = filtersFromSearch(new URLSearchParams(), { ...options, rememberAccounts: true });
    expect(filters.accountIds).toEqual(["remembered"]);
    expect(filters.interval).toBe("week");
  });
});
