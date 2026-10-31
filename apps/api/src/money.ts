import { type AmountFormat, parseAmount } from "@howmuch/money";

/**
 * Reads a decimal amount in the plan's format; throws on anything it cannot
 * read exactly. A JSON number is never locale text, so it is read with a
 * plain dot: 1.234 is not 1,234 in a comma plan.
 */
export function decimalToMilliunits(value: string | number, format: AmountFormat): number {
  const parsed = typeof value === "number"
    ? parseAmount(String(value), { decimalDigits: format.decimalDigits, decimalSeparator: ".", groupSeparator: "" })
    : parseAmount(value, format);
  if (parsed === null) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return parsed;
}

export function csvRowToMilliunits(row: { outflow?: unknown; inflow?: unknown; amount?: unknown }, format: AmountFormat): number {
  if (row.amount !== undefined && row.amount !== null && String(row.amount).trim() !== "") {
    return decimalToMilliunits(typeof row.amount === "number" ? row.amount : String(row.amount), format);
  }

  const cell = (value: unknown): string | number => (typeof value === "number" ? value : value === undefined || value === null ? "" : String(value).trim());
  const outflow = cell(row.outflow);
  const inflow = cell(row.inflow);

  // Register exports (YNAB's among them) fill the unused column with "0.00",
  // so a filled outflow cell must not hide the inflow beside it.
  const outflowMilli = outflow !== "" ? Math.abs(decimalToMilliunits(outflow, format)) : 0;
  const inflowMilli = inflow !== "" ? Math.abs(decimalToMilliunits(inflow, format)) : 0;
  return inflowMilli - outflowMilli || 0;
}
