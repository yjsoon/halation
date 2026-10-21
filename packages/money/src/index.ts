/**
 * The largest amount, in milliunits, a ledger accepts either way of zero: one
 * trillion units. Sums of up to nine such amounts stay exact in JS numbers;
 * longer sums must check each running total with `isStorableMilliunits`.
 */
export const MAX_AMOUNT_MILLIUNITS = 1_000_000_000_000_000;

/** How a plan writes amounts. `currencySymbol` is accepted around a typed amount. */
export type AmountFormat = {
  decimalDigits: number;
  decimalSeparator: string;
  groupSeparator: string;
  currencySymbol?: string;
};

/** A plan's stored `currency_format`, as the API returns it. */
export type CurrencyFormatLike = {
  decimal_digits?: number | null;
  decimal_separator?: string | null;
  group_separator?: string | null;
  currency_symbol?: string | null;
} | null | undefined;

export const DEFAULT_AMOUNT_FORMAT: AmountFormat = {
  decimalDigits: 2,
  decimalSeparator: ".",
  groupSeparator: ",",
  currencySymbol: "$",
};

export function amountFormatOf(format: CurrencyFormatLike): AmountFormat {
  const digits = format?.decimal_digits;
  return {
    decimalDigits: typeof digits === "number" && Number.isInteger(digits) && digits >= 0 && digits <= 4 ? digits : DEFAULT_AMOUNT_FORMAT.decimalDigits,
    decimalSeparator: format?.decimal_separator || DEFAULT_AMOUNT_FORMAT.decimalSeparator,
    groupSeparator: format?.group_separator ?? DEFAULT_AMOUNT_FORMAT.groupSeparator,
    currencySymbol: format?.currency_symbol ?? "",
  };
}

/** True for whole milliunits a ledger can store: safe integers within the cap. */
export function isStorableMilliunits(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= MAX_AMOUNT_MILLIUNITS;
}

/** The exact sum of milliunit amounts, or null once a running total leaves the safe integers. */
export function sumMilliunits(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

const SPACES = [" ", " ", " "];
const APOSTROPHES = ["'", "’"];

/**
 * Reads typed or imported text as signed milliunits in the plan's format, or
 * returns null. It never guesses: the plan's decimal mark is the decimal,
 * grouping must fall in threes, and junk that JS number parsing accepts
 * ("0x10", "1e3", "--5") is refused, as are digits beyond the currency's
 * minor unit and amounts past `MAX_AMOUNT_MILLIUNITS`.
 *
 * The other of "." and "," is always a group mark, except that once, where it
 * cannot be one (not followed by exactly three digits), it is read as the
 * decimal: "12.5" in a comma plan, "1,5" in a dot plan.
 */
export function parseAmount(text: string, format: AmountFormat): number | null {
  let body = text.trim().replace(/−/g, "-");
  let negative = false;
  let signed = false;
  const takeSign = () => {
    if (!signed && (body.startsWith("-") || body.startsWith("+"))) {
      negative = body.startsWith("-");
      signed = true;
      body = body.slice(1).trimStart();
    }
  };
  const symbol = format.currencySymbol ?? "";
  takeSign();
  if (symbol && body.startsWith(symbol)) body = body.slice(symbol.length).trimStart();
  takeSign();
  if (symbol && body.endsWith(symbol)) body = body.slice(0, -symbol.length).trimEnd();

  const decimal = format.decimalSeparator;
  const other = decimal === "," ? "." : decimal === "." ? "," : null;
  const groupMarks = new Set<string>(groupVariants(format.groupSeparator));
  if (other) groupMarks.add(other);
  groupMarks.delete(decimal);

  let decimalMark = decimal;
  if (!body.includes(decimal) && other) {
    const parts = body.split(other);
    // "0.500" in a comma plan is half a unit: nobody groups a leading zero.
    if (parts.length === 2 && (parts[1].length !== 3 || /^0*$/.test(parts[0])) && ![...groupMarks].some((mark) => mark !== other && body.includes(mark))) {
      decimalMark = other;
    }
  }

  const pieces = body.split(decimalMark);
  if (pieces.length > 2) return null;
  const [integerText, fraction = ""] = pieces;
  if (!/^\d*$/.test(fraction)) return null;
  const whole = groupedDigits(integerText, decimalMark === decimal ? groupMarks : new Set());
  if (whole === null || (whole === "" && fraction === "")) return null;

  const minorDigits = Math.min(format.decimalDigits, 3);
  if (/[1-9]/.test(fraction.slice(minorDigits))) return null;

  const significant = whole.replace(/^0+/, "");
  if (significant.length > 13) return null;
  const milliunits = Number(significant || "0") * 1_000 + Number(fraction.slice(0, 3).padEnd(3, "0"));
  if (milliunits > MAX_AMOUNT_MILLIUNITS) return null;
  return negative && milliunits !== 0 ? -milliunits : milliunits;
}

function groupVariants(groupSeparator: string): string[] {
  if (!groupSeparator) return [];
  if (SPACES.includes(groupSeparator) || /^\s$/.test(groupSeparator)) return SPACES;
  if (APOSTROPHES.includes(groupSeparator)) return APOSTROPHES;
  return [groupSeparator];
}

/** The digits of an integer part, after checking any grouping falls in threes. */
function groupedDigits(text: string, groupMarks: Set<string>): string | null {
  if (/^\d*$/.test(text)) return text;
  const used = [...groupMarks].filter((mark) => text.includes(mark));
  if (used.length === 0) return null;
  // One kind of mark per amount; the space and apostrophe spellings count as one.
  const kinds = new Set(used.map((mark) => (SPACES.includes(mark) ? " " : APOSTROPHES.includes(mark) ? "'" : mark)));
  if (kinds.size > 1) return null;
  const groups = text.split(new RegExp(used.map(escapeRegExp).join("|")));
  if (!/^[1-9]\d{0,2}$/.test(groups[0]) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))) return null;
  return groups.join("");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
