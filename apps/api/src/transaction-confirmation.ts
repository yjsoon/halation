import type { ClearedState, TransactionInput } from "./types";

/**
 * The `needs_confirmation` value an update leaves on a row. An explicit value
 * in the patch wins. Otherwise clearing an uncleared row confirms it, because
 * ticking it off against the statement is the check the marker asks for.
 */
export function nextNeedsConfirmation(
  existing: { cleared?: unknown; needs_confirmation?: unknown },
  patch: Pick<Partial<TransactionInput>, "cleared" | "needs_confirmation">,
): boolean {
  if (patch.needs_confirmation !== undefined) return patch.needs_confirmation === true;
  if (existing.cleared === "uncleared" && clearsRow(patch.cleared)) return false;
  return Boolean(Number(existing.needs_confirmation ?? 0));
}

function clearsRow(cleared: ClearedState | null | undefined): boolean {
  return cleared === "cleared" || cleared === "reconciled";
}

/**
 * The bound value for an upsert: null keeps the stored marker (an import or a
 * mirror write that does not mention it), otherwise 0 or 1.
 */
export function needsConfirmationParam(value: unknown): 0 | 1 | null {
  if (value === undefined) return null;
  return value === true || value === 1 ? 1 : 0;
}

/** SQL fragments for an upsert that binds `needsConfirmationParam` twice. */
export const NEEDS_CONFIRMATION_INSERT_SQL = "COALESCE(?, 0)";
export const NEEDS_CONFIRMATION_CONFLICT_SQL =
  "needs_confirmation = CASE WHEN ? IS NULL THEN transactions.needs_confirmation ELSE excluded.needs_confirmation END";

/**
 * For the cleared toggle, binding the expected (old) state and then the new
 * one: only an uncleared row being cleared confirms.
 */
export const CLEARED_CONFIRMS_SQL =
  "needs_confirmation = CASE WHEN ? = 'uncleared' AND ? <> 'uncleared' THEN 0 ELSE needs_confirmation END";

/** The `type` filter value that lists rows still to confirm. */
export const NEEDS_CONFIRMATION_TYPE = "needs_confirmation";
