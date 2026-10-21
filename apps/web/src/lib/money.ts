import { type AmountFormat, amountFormatOf, parseAmount } from "@howmuch/money";
import type { CurrencyFormat } from "../api/types";

let formatter = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let decimalSeparator = ".";
let groupSeparator = ",";
let amountFormat: AmountFormat = amountFormatOf(undefined);
let symbol = "";
let symbolFirst = true;
let currencyFormat: CurrencyFormat | undefined;

export function currentCurrencyFormat(): CurrencyFormat | undefined {
  return currencyFormat;
}

export function configureMoney(format?: CurrencyFormat): void {
  currencyFormat = format;
  const digits = format?.decimal_digits ?? 2;
  amountFormat = amountFormatOf(format);
  formatter = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  // The plan's own separators, so an imported "12,50" plan shows what its
  // register search (parsed with the same format) expects to be typed.
  decimalSeparator = format?.decimal_separator || ".";
  groupSeparator = format?.group_separator ?? ",";
  symbol = format?.display_symbol === false ? "" : (format?.currency_symbol ?? "");
  symbolFirst = format?.symbol_first ?? true;
}

/**
 * Reads a typed amount with the plan's marks and minor unit (see
 * `parseAmount`, which the server's CSV import and quick entry share), or
 * null. Never use `Number(value) * 1000`: values such as 1.135 cannot be
 * represented in binary floating point.
 */
export function parseMilliunits(value: string): number | null {
  return parseAmount(value, amountFormat);
}

/**
 * `parseMilliunits`, except that a field still showing its stored amount
 * (`formatMilliunitsField`) keeps it, even one saved with more decimals than
 * the currency now allows: an untouched amount must not block a save.
 */
export function parseMilliunitsKeeping(value: string, stored: number | null | undefined): number | null {
  if (stored != null && value.trim() === formatMilliunitsField(stored)) {
    return stored;
  }
  return parseMilliunits(value);
}

/** Milliunits in the plan currency's smallest unit: 10 for cents, 1,000 for yen. */
export function minorUnitMilliunits(): number {
  return 10 ** (3 - Math.min(amountFormat.decimalDigits, 3));
}

export function formatMilliunitsInput(milliunits: number): string {
  const sign = milliunits < 0 ? "-" : "";
  const absolute = Math.abs(milliunits);
  const whole = Math.trunc(absolute / 1_000);
  const fraction = absolute % 1_000;
  if (fraction === 0) {
    return `${sign}${whole}`;
  }
  return `${sign}${whole}.${String(fraction).padStart(3, "0").replace(/0+$/, "")}`;
}

/**
 * Puts the plan's decimal mark into a plain dot-decimal number the page shows
 * (an amount field after blur, a chart axis, a percentage). Only a comma is
 * swapped in, as that is the only other mark `parseMilliunits` reads.
 */
export function withPlanDecimal(text: string): string {
  return planDecimalIsComma() ? text.replace(".", ",") : text;
}

/** True when `parseMilliunits` reads a typed comma as the decimal mark. */
export function planDecimalIsComma(): boolean {
  return decimalSeparator === ",";
}

/** `formatMilliunitsInput` with the plan's decimal mark, for a field's text. */
export function formatMilliunitsField(milliunits: number): string {
  return withPlanDecimal(formatMilliunitsInput(milliunits));
}

export function formatMoney(milliunits: number, options?: { sign?: boolean }): string {
  const absolute = formatter
    .format(Math.abs(milliunits) / 1000)
    .replace(/[,.]/g, (mark) => (mark === "." ? decimalSeparator : groupSeparator));
  const withSymbol = symbolFirst ? `${symbol}${absolute}` : `${absolute}${symbol}`;
  if (milliunits < 0) {
    return `−${withSymbol}`;
  }
  return options?.sign && milliunits > 0 ? `+${withSymbol}` : withSymbol;
}

export function formatAmount(milliunits: number): string {
  return formatMoney(Math.abs(milliunits));
}

export function formatShare(share: number): string {
  return withPlanDecimal(`${(share * 100).toFixed(1)}%`);
}

export function formatSavingsRate(net: number, income: number): string {
  if (income <= 0) {
    return "—";
  }
  const rate = net / income;
  if (rate < -1) {
    return "—";
  }
  return withPlanDecimal(`${rate < 0 ? "−" : ""}${((Math.abs(net) / income) * 100).toFixed(1)}%`);
}
