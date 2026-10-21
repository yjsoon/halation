import { describe, expect, test } from "bun:test";
import { type AmountFormat, isStorableMilliunits, MAX_AMOUNT_MILLIUNITS, parseAmount, sumMilliunits } from "./index";

// Failure modes an end-to-end run would not reach: typed and imported text
// read with the wrong marks (silently wrong money), junk that JS number
// parsing accepts, digits beyond the currency's minor unit, and amounts past
// what storage and the iOS app can add up safely.

const sgd: AmountFormat = { decimalDigits: 2, decimalSeparator: ".", groupSeparator: ",", currencySymbol: "$" };
const eur: AmountFormat = { decimalDigits: 2, decimalSeparator: ",", groupSeparator: ".", currencySymbol: "€" };
const frSpace: AmountFormat = { decimalDigits: 2, decimalSeparator: ",", groupSeparator: " ", currencySymbol: "€" };
const chf: AmountFormat = { decimalDigits: 2, decimalSeparator: ".", groupSeparator: "’", currencySymbol: "CHF" };
const jpy: AmountFormat = { decimalDigits: 0, decimalSeparator: ".", groupSeparator: ",", currencySymbol: "¥" };
const idr: AmountFormat = { decimalDigits: 0, decimalSeparator: ",", groupSeparator: ".", currencySymbol: "Rp" };
const kwd: AmountFormat = { decimalDigits: 3, decimalSeparator: ".", groupSeparator: ",", currencySymbol: "KD" };

describe("parseAmount in a comma-decimal plan", () => {
  test("reads the comma as the decimal mark and the dot as grouping", () => {
    expect(parseAmount("12,50", eur)).toBe(12_500);
    expect(parseAmount("1.234,56", eur)).toBe(1_234_560);
    expect(parseAmount("1.234", eur)).toBe(1_234_000);
    expect(parseAmount("1.234.567,8", eur)).toBe(1_234_567_800);
    expect(parseAmount("-0,5", eur)).toBe(-500);
    expect(parseAmount("€12,50", eur)).toBe(12_500);
    expect(parseAmount("12,50 €", eur)).toBe(12_500);
  });

  test("accepts a lone dot that cannot be grouping as the decimal mark", () => {
    expect(parseAmount("12.5", eur)).toBe(12_500);
    expect(parseAmount("12.50", eur)).toBe(12_500);
  });

  test("reads a space-grouped amount", () => {
    expect(parseAmount("1 234,50", frSpace)).toBe(1_234_500);
    expect(parseAmount("1 234,50", frSpace)).toBe(1_234_500);
    expect(parseAmount("1 234,50", frSpace)).toBe(1_234_500);
  });

  test("rejects malformed grouping", () => {
    expect(parseAmount("1.23,4", eur)).toBeNull();
    expect(parseAmount("12.34.5", eur)).toBeNull();
    expect(parseAmount("1,2,3", eur)).toBeNull();
    expect(parseAmount("1.234,5.6", eur)).toBeNull();
    expect(parseAmount(",5.000", eur)).toBeNull();
  });
});

describe("parseAmount in a dot-decimal plan", () => {
  test("reads the dot as the decimal mark and the comma as grouping", () => {
    expect(parseAmount("12", sgd)).toBe(12_000);
    expect(parseAmount("12.5", sgd)).toBe(12_500);
    expect(parseAmount("1,234.56", sgd)).toBe(1_234_560);
    expect(parseAmount("1,234", sgd)).toBe(1_234_000);
    expect(parseAmount("$1,234.56", sgd)).toBe(1_234_560);
    expect(parseAmount("-$5", sgd)).toBe(-5_000);
    expect(parseAmount("$-5", sgd)).toBe(-5_000);
    expect(parseAmount("−5", sgd)).toBe(-5_000);
    expect(parseAmount("+5", sgd)).toBe(5_000);
    expect(parseAmount(".5", sgd)).toBe(500);
    expect(parseAmount("5.", sgd)).toBe(5_000);
    expect(parseAmount("  7.25 ", sgd)).toBe(7_250);
  });

  test("accepts a lone comma that cannot be grouping as the decimal mark", () => {
    expect(parseAmount("1,5", sgd)).toBe(1_500);
    expect(parseAmount("12,50", sgd)).toBe(12_500);
  });

  test("reads an apostrophe-grouped amount", () => {
    expect(parseAmount("1’234.50", chf)).toBe(1_234_500);
    expect(parseAmount("1'234.50", chf)).toBe(1_234_500);
  });

  test("never turns a negative zero into -0", () => {
    expect(Object.is(parseAmount("-0", sgd), 0)).toBe(true);
    expect(Object.is(parseAmount("-0.00", sgd), 0)).toBe(true);
  });
});

describe("parseAmount rejects junk instead of guessing", () => {
  test.each(["", " ", "-", "+", ".", ",", "$", "--5", "+-5", "1.-5", "0x10", "1e3", "Infinity", "NaN", "12a", "1 2", "1.2.3", "(5)", "5-"])(
    "%p",
    (text) => {
      expect(parseAmount(text, sgd)).toBeNull();
    },
  );
});

describe("parseAmount respects the currency's decimal places", () => {
  test("rejects digits beyond the minor unit, keeping trailing zeros", () => {
    expect(parseAmount("1.9999", sgd)).toBeNull();
    expect(parseAmount("1.005", sgd)).toBeNull();
    expect(parseAmount("1.2500", sgd)).toBe(1_250);
    expect(parseAmount("1.5", jpy)).toBeNull();
    expect(parseAmount("1.0", jpy)).toBe(1_000);
    expect(parseAmount("1,234", jpy)).toBe(1_234_000);
    expect(parseAmount("1.234", idr)).toBe(1_234_000);
    expect(parseAmount("1,5", idr)).toBeNull();
    expect(parseAmount("1.235", kwd)).toBe(1_235);
    expect(parseAmount("1.2345", kwd)).toBeNull();
  });
});

describe("parseAmount caps amounts at a storable size", () => {
  test("accepts the cap and rejects anything past it", () => {
    expect(parseAmount("1000000000000", sgd)).toBe(MAX_AMOUNT_MILLIUNITS);
    expect(parseAmount("-1000000000000", sgd)).toBe(-MAX_AMOUNT_MILLIUNITS);
    expect(parseAmount("1000000000000.01", sgd)).toBeNull();
    expect(parseAmount("9007199254740993", sgd)).toBeNull();
    expect(parseAmount("5000000000000000", sgd)).toBeNull();
    expect(parseAmount("0000000000000000000001", sgd)).toBe(1_000);
  });
});

describe("parseAmount never reads a leading zero group as grouping", () => {
  test("0.500 in a comma plan is half a unit, not five hundred", () => {
    expect(parseAmount("0.500", eur)).toBe(500);
    expect(parseAmount("00.500", eur)).toBe(500);
    expect(parseAmount("0,500", sgd)).toBe(500);
    expect(parseAmount("0.500.000", eur)).toBeNull();
  });
});

// Ten lines of 1e15 pass 2^53, where 1e16 + 1 === 1e16, so a float sum can
// match a parent its lines do not add up to.
describe("sumMilliunits", () => {
  test("adds exactly or refuses once a running total leaves safe integers", () => {
    expect(sumMilliunits([1_000, -250, 5])).toBe(755);
    expect(sumMilliunits([])).toBe(0);
    const lines = [...Array(10).fill(MAX_AMOUNT_MILLIUNITS), 1, ...Array(9).fill(-MAX_AMOUNT_MILLIUNITS)];
    expect(sumMilliunits(lines)).toBeNull();
  });
});

describe("isStorableMilliunits", () => {
  test("allows safe integers within the cap", () => {
    expect(isStorableMilliunits(0)).toBe(true);
    expect(isStorableMilliunits(-12_340)).toBe(true);
    expect(isStorableMilliunits(MAX_AMOUNT_MILLIUNITS)).toBe(true);
    expect(isStorableMilliunits(-MAX_AMOUNT_MILLIUNITS)).toBe(true);
  });

  test("refuses fractions, unsafe integers, values past the cap and non-numbers", () => {
    expect(isStorableMilliunits(1.5)).toBe(false);
    expect(isStorableMilliunits(MAX_AMOUNT_MILLIUNITS + 1)).toBe(false);
    expect(isStorableMilliunits(9_007_199_254_740_992_000)).toBe(false);
    expect(isStorableMilliunits(Number.NaN)).toBe(false);
    expect(isStorableMilliunits("12")).toBe(false);
    expect(isStorableMilliunits(null)).toBe(false);
  });
});
