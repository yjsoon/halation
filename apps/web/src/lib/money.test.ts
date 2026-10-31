import { describe, expect, test } from "bun:test";
import { configureMoney, formatMilliunitsField, formatMilliunitsInput, formatMoney, formatSavingsRate, parseMilliunits, parseMilliunitsKeeping } from "./money";

describe("parseMilliunits", () => {
  test("parses whole numbers and decimals up to the currency's minor unit exactly", () => {
    expect(parseMilliunits("12")).toBe(12_000);
    expect(parseMilliunits("12.3")).toBe(12_300);
    expect(parseMilliunits("12.34")).toBe(12_340);
    expect(parseMilliunits("-0.29")).toBe(-290);
    expect(parseMilliunits(".5")).toBe(500);
    expect(parseMilliunits("-.29")).toBe(-290);
    expect(parseMilliunits("1.")).toBe(1_000);
    expect(parseMilliunits("+1.13")).toBe(1_130);
    expect(parseMilliunits("1,200.50")).toBe(1_200_500);
    expect(parseMilliunits("1,200")).toBe(1_200_000);
  });

  test("rejects scientific notation, extra decimals, and empty values", () => {
    expect(parseMilliunits("")).toBeNull();
    expect(parseMilliunits(".")).toBeNull();
    expect(parseMilliunits("12.345")).toBeNull();
    expect(parseMilliunits("1.2345")).toBeNull();
    expect(parseMilliunits("1e3")).toBeNull();
    expect(parseMilliunits("12.34.5")).toBeNull();
  });

  // Failure mode: formatMoney shows an imported comma-decimal plan's amounts
  // as "12,50", and the amount fields read that comma as a group mark, so
  // typing what the page shows stores a hundred times the amount. A lone dot
  // that cannot be grouping ("12.5") still reads as the decimal.
  test("reads the plan's comma decimal mark as the page shows it", () => {
    try {
      configureMoney({ iso_code: "EUR", example_format: "123.456,78", decimal_digits: 2, decimal_separator: ",", symbol_first: false, group_separator: ".", currency_symbol: "€", display_symbol: true });
      expect(formatMoney(12_500)).toBe("12,50€");
      expect(parseMilliunits("12,50")).toBe(12_500);
      expect(parseMilliunits("-12,5")).toBe(-12_500);
      expect(parseMilliunits("1.234,50")).toBe(1_234_500);
      expect(parseMilliunits("12.5")).toBe(12_500);
      expect(parseMilliunits("1.234")).toBe(1_234_000);
      expect(parseMilliunits("1,2,3")).toBeNull();
    } finally {
      configureMoney(undefined);
    }
    // In a dot plan a lone comma that cannot be grouping is the decimal too.
    expect(parseMilliunits("12,50")).toBe(12_500);
    expect(parseMilliunits("12,500")).toBe(12_500_000);
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
      // The plan has no minor unit, so any fraction is refused.
      expect(parseMilliunits("1.5")).toBeNull();
      expect(parseMilliunits("1,234")).toBeNull();
      expect(parseMilliunits("1.234,5")).toBeNull();
      expect(parseMilliunits("1.234,0")).toBe(1_234_000);
    } finally {
      configureMoney(undefined);
    }
  });
});

// Imported dot-decimal plans can group with a space or an apostrophe: the page
// shows 1 234.50 or 1’234.50, and copying that into a field must be accepted.
describe("parseMilliunits with a non-comma group mark in a dot-decimal plan", () => {
  for (const group of [" ", "’", "'", "\u00a0", "\u202f"]) {
    test(`reads back what the page shows with group ${JSON.stringify(group)}`, () => {
      try {
        configureMoney({ iso_code: "CHF", example_format: "1’234.56", decimal_digits: 2, decimal_separator: ".", symbol_first: true, group_separator: group, currency_symbol: "", display_symbol: false });
        const shown = formatMoney(1_234_500);
        expect(shown).toContain(group);
        expect(parseMilliunits(shown)).toBe(1_234_500);
        expect(parseMilliunits("12.5")).toBe(12_500);
        expect(parseMilliunits("1,234.50")).toBe(1_234_500);
      } finally {
        configureMoney(undefined);
      }
    });
  }
});

describe("formatMilliunitsInput", () => {
  test("round-trips integer milliunits without float residue", () => {
    expect(formatMilliunitsInput(12_345)).toBe("12.345");
    expect(formatMilliunitsInput(-290)).toBe("-0.29");
    expect(formatMilliunitsInput(1_000)).toBe("1");
    expect(parseMilliunits(formatMilliunitsInput(1_130))).toBe(1_130);
  });
});

describe("formatSavingsRate", () => {
  test("dashes zero income only; overspending stays a negative rate", () => {
    expect(formatSavingsRate(1_750_000, 8_200_000)).toBe("21.3%");
    expect(formatSavingsRate(-450_000, 3_630_000)).toBe("−12.4%");
    expect(formatSavingsRate(-100, 0)).toBe("—");
    expect(formatSavingsRate(-100, 100)).toBe("−100.0%");
    expect(formatSavingsRate(-101, 100)).toBe("−101.0%");
    expect(formatSavingsRate(26_400 - 525_310, 26_400)).toBe("−1889.8%");
  });
});

// A schedule or card term saved before amounts were held to the currency's
// minor unit prefills text that no longer parses; left untouched, it must
// save as the stored amount rather than block the form.
describe("parseMilliunitsKeeping", () => {
  test("keeps an untouched stored amount and parses anything typed", () => {
    expect(parseMilliunitsKeeping(formatMilliunitsField(12_345), 12_345)).toBe(12_345);
    expect(parseMilliunitsKeeping(" 12.345 ", 12_345)).toBe(12_345);
    expect(parseMilliunitsKeeping("12.345", undefined)).toBeNull();
    expect(parseMilliunitsKeeping("12.34", 12_345)).toBe(12_340);
    expect(parseMilliunitsKeeping("12.346", 12_345)).toBeNull();
  });
});
