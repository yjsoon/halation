import { describe, expect, test } from "bun:test";
import { configureMoney, formatMilliunitsInput, formatMoney, formatSavingsRate, parseMilliunits } from "./money";

describe("parseMilliunits", () => {
  test("parses whole numbers and up to three decimal places exactly", () => {
    expect(parseMilliunits("12")).toBe(12_000);
    expect(parseMilliunits("12.3")).toBe(12_300);
    expect(parseMilliunits("12.34")).toBe(12_340);
    expect(parseMilliunits("12.345")).toBe(12_345);
    expect(parseMilliunits("-0.29")).toBe(-290);
    expect(parseMilliunits(".5")).toBe(500);
    expect(parseMilliunits("-.29")).toBe(-290);
    expect(parseMilliunits("1.")).toBe(1_000);
    expect(parseMilliunits("+1.135")).toBe(1_135);
    expect(parseMilliunits("1,200.50")).toBe(1_200_500);
    expect(parseMilliunits("1,200")).toBe(1_200_000);
  });

  test("rejects scientific notation, extra decimals, and empty values", () => {
    expect(parseMilliunits("")).toBeNull();
    expect(parseMilliunits(".")).toBeNull();
    expect(parseMilliunits("1.2345")).toBeNull();
    expect(parseMilliunits("1e3")).toBeNull();
    expect(parseMilliunits("12.34.5")).toBeNull();
  });

  // Failure mode: formatMoney shows an imported comma-decimal plan's amounts
  // as "12,50", and the amount fields read that comma as a group mark, so
  // typing what the page shows stores a hundred times the amount. The fields
  // are still prefilled with a dot ("12.5"), so a dot must keep reading.
  test("reads the plan's comma decimal mark as the page shows it", () => {
    try {
      configureMoney({ iso_code: "EUR", example_format: "123.456,78", decimal_digits: 2, decimal_separator: ",", symbol_first: false, group_separator: ".", currency_symbol: "€", display_symbol: true });
      expect(formatMoney(12_500)).toBe("12,50€");
      expect(parseMilliunits("12,50")).toBe(12_500);
      expect(parseMilliunits("-12,5")).toBe(-12_500);
      expect(parseMilliunits("1.234,50")).toBe(1_234_500);
      expect(parseMilliunits("12.5")).toBe(12_500);
      expect(parseMilliunits("1,2,3")).toBeNull();
    } finally {
      configureMoney(undefined);
    }
    expect(parseMilliunits("12,50")).toBe(1_250_000);
  });
});

// A zero-decimal comma plan (decimal ",", group ".") shows 1,234 units as
// "1.234". Copying that into a field must give 1,234 units, not 1.234.
describe("parseMilliunits with a zero-decimal comma plan", () => {
  test("reads the displayed grouping back as the same amount", () => {
    try {
      configureMoney({ iso_code: "XXX", example_format: "123.456", decimal_digits: 0, decimal_separator: ",", symbol_first: false, group_separator: ".", currency_symbol: "", display_symbol: false });
      expect(formatMoney(1_234_000)).toBe("1.234");
      expect(parseMilliunits(formatMoney(1_234_000))).toBe(1_234_000);
      expect(parseMilliunits("1.234.567")).toBe(1_234_567_000);
      expect(parseMilliunits("-12.345")).toBe(-12_345_000);
      expect(parseMilliunits("1234")).toBe(1_234_000);
      expect(parseMilliunits("1.5")).toBe(1_500);
      // An explicit comma is always the decimal mark, whatever the digits.
      expect(parseMilliunits("1,234")).toBe(1_234);
      expect(parseMilliunits("-1,234")).toBe(-1_234);
      expect(parseMilliunits("1.234,5")).toBe(1_234_500);
    } finally {
      configureMoney(undefined);
    }
  });
});

describe("formatMilliunitsInput", () => {
  test("round-trips integer milliunits without float residue", () => {
    expect(formatMilliunitsInput(12_345)).toBe("12.345");
    expect(formatMilliunitsInput(-290)).toBe("-0.29");
    expect(formatMilliunitsInput(1_000)).toBe("1");
    expect(parseMilliunits(formatMilliunitsInput(1_135))).toBe(1_135);
  });
});

describe("formatSavingsRate", () => {
  // Demo YTD is ~80% saved. Zero income and rates below -100% (e.g. $26.40 in /
  // $525.31 out) are the cases the Income page recipe never exercises.
  test("dashes zero income and rates below -100 percent, keeps ordinary negatives", () => {
    expect(formatSavingsRate(1_750_000, 8_200_000)).toBe("21.3%");
    expect(formatSavingsRate(-450_000, 3_630_000)).toBe("−12.4%");
    expect(formatSavingsRate(-100, 0)).toBe("—");
    expect(formatSavingsRate(-100, 100)).toBe("−100.0%");
    expect(formatSavingsRate(-101, 100)).toBe("—");
    expect(formatSavingsRate(26_400 - 525_310, 26_400)).toBe("—");
  });
});
