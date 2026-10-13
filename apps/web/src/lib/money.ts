import type { CurrencyFormat } from "../api/types";

let formatter = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let decimalSeparator = ".";
let groupSeparator = ",";
let decimalDigits = 2;
let symbol = "";
let symbolFirst = true;
let currencyFormat: CurrencyFormat | undefined;

/** The plan currency format last passed to `configureMoney`. */
export function currentCurrencyFormat(): CurrencyFormat | undefined {
  return currencyFormat;
}

export function configureMoney(format?: CurrencyFormat): void {
  currencyFormat = format;
  const digits = format?.decimal_digits ?? 2;
  decimalDigits = digits;
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
 * Exact decimal → milliunit conversion. Never use `Number(value) * 1000`:
 * values such as 1.135 cannot be represented in binary floating point.
 */
export function parseMilliunits(value: string): number | null {
  let text = value.trim();
  // A comma-decimal plan shows "1.234,50" (formatMoney), so a typed comma is
  // its decimal mark, whatever digits follow it. Text without a comma keeps
  // the dot reading the fields are prefilled with (formatMilliunitsInput),
  // except that a plan with no minor unit shows 1,234 units as "1.234": dots
  // grouped in threes cannot be a decimal there. Judged on the text as typed,
  // before any comma becomes a dot.
  if (decimalSeparator === ",") {
    if (text.includes(",")) {
      if (groupSeparator && groupSeparator !== ",") {
        text = text.split(groupSeparator).join("");
      }
      text = text.replace(/,/g, ".");
    } else if (groupSeparator === "." && decimalDigits === 0 && /^[+-]?\d{1,3}(\.\d{3})+$/.test(text)) {
      text = text.replace(/\./g, "");
    }
  }
  const match = text.replace(/,/g, "").match(/^([+-]?)(?:(\d+)(?:\.(\d{0,3}))?|\.(\d{1,3}))$/);
  if (!match) {
    return null;
  }
  const whole = match[2] === undefined ? 0 : Number(match[2]);
  const fractionDigits = match[2] === undefined ? (match[4] ?? "") : (match[3] ?? "");
  const amount = whole * 1_000 + Number(fractionDigits.padEnd(3, "0"));
  const signed = match[1] === "-" ? -amount : amount;
  return Number.isSafeInteger(signed) ? signed : null;
}

/** Formats integer milliunits for an editable decimal field without float rounding. */
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

/** Formats integer milliunits for display, e.g. -12340 -> "−£12.34". */
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

/** Formats positive magnitudes (report totals are already absolute). */
export function formatAmount(milliunits: number): string {
  return formatMoney(Math.abs(milliunits));
}

export function formatShare(share: number): string {
  return withPlanDecimal(`${(share * 100).toFixed(1)}%`);
}

/** Net over income. Zero income or a rate below -100% is an em dash. */
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
