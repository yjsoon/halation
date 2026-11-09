import type { ClaimStatus, TransactionInput } from "./types";

/**
 * "To claim" is a stored field: `claim_status` is `to_claim` for a receipt to
 * claim back and `claimed` once the claims tool has billed it, with the day in
 * `claimed_on`. Older clients wrote memo words instead (`TODO:`, `CLAIMED - day:`
 * and `TOCHECK` for an estimate); `normaliseFollowUpWords` turns those into the
 * fields so every writer lands on the same state.
 */

/** The `type` filter values that list rows to claim and rows claimed. */
export const TO_CLAIM_TYPE = "to_claim";
export const CLAIMED_TYPE = "claimed";

/** A claimed day: a real calendar date as YYYY-MM-DD, as snapshots require. */
export function isClaimDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// A word counts when it is in capitals (`TODO`, `CLAIMED`, `TOCHECK`) or is
// followed by a colon in any case (`todo: taxi`). Prose such as "Todo list app"
// is left alone, since the word is removed from the stored memo.
const TODO_WORD = /^\s*(TODO)(?=[:\s]|$)(:?)\s*/i;
const CLAIMED_WORD = /^\s*(CLAIMED)\b(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*(:|$)\s*/i;
const TOCHECK_WORD = /^\s*(TOCHECK)\b(:?)\s*/i;

function marker(pattern: RegExp, text: string, colonGroup: number): RegExpExecArray | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return match[1] === match[1]!.toUpperCase() || match[colonGroup] === ":" ? match : null;
}

type FollowUpWords = {
  memo: string | null;
  claim_status?: ClaimStatus;
  claimed_on?: string | null;
  needs_confirmation?: true;
};

/**
 * Reads the follow-up word a memo starts with, if any, and returns the memo
 * without it plus the fields it stands for. Several words can lead one memo
 * ("TOCHECK TODO: Taxi"). Words later in the memo are ordinary text.
 */
function followUpWords(memo: string | null): FollowUpWords {
  const result: FollowUpWords = { memo };
  let text = memo ?? "";
  for (;;) {
    const todo = marker(TODO_WORD, text, 2);
    if (todo) {
      if (!result.claim_status) result.claim_status = "to_claim";
      text = text.slice(todo[0].length);
      continue;
    }
    const claimed = marker(CLAIMED_WORD, text, 3);
    if (claimed) {
      if (!result.claim_status) {
        result.claim_status = "claimed";
        result.claimed_on = isClaimDay(claimed[2]) ? claimed[2] : null;
      }
      text = text.slice(claimed[0].length);
      continue;
    }
    const check = marker(TOCHECK_WORD, text, 2);
    if (check) {
      result.needs_confirmation = true;
      text = text.slice(check[0].length);
      continue;
    }
    break;
  }
  if (text.length !== (memo ?? "").length) result.memo = text.trim() || null;
  return result;
}

/**
 * Moves the follow-up words at the start of a write's memo into fields. A
 * field the write sets explicitly wins over the word; the word is removed
 * either way. Only the transaction memo is read: split lines keep their memos.
 */
export function normaliseFollowUpWords<T extends Partial<TransactionInput>>(input: T): T {
  if (typeof input.memo !== "string") return input;
  const words = followUpWords(input.memo);
  if (words.memo === input.memo) return input;
  const next = input as Partial<TransactionInput>;
  next.memo = words.memo;
  if (words.claim_status && next.claim_status === undefined) next.claim_status = words.claim_status;
  // The word's day fills a claimed write that does not give one. A word
  // without a day leaves the day to the row (kept if it is already claimed).
  if (words.claim_status === "claimed" && next.claim_status === "claimed" && next.claimed_on === undefined && words.claimed_on) {
    next.claimed_on = words.claimed_on;
  }
  if (words.needs_confirmation && next.needs_confirmation === undefined) next.needs_confirmation = true;
  return input;
}

/**
 * Interpret an edit against the row protected by the write's transaction or
 * version guard. Keep the request unchanged so a stale-write retry can read
 * its words again against the newer snapshot.
 */
export function normaliseFollowUpEdit(
  stored: { memo?: unknown; claim_status?: unknown },
  input: Partial<TransactionInput>,
): Partial<TransactionInput> {
  if (typeof input.memo !== "string") return input;
  const words = followUpWords(input.memo);
  if (words.memo === input.memo) return input;
  const setsClaim = input.claim_status !== undefined;
  const setsField = setsClaim || input.needs_confirmation !== undefined;
  // Saving another field on a row kept with words leaves those words alone.
  if (stored.memo === input.memo && !setsField) return input;
  const patch = normaliseFollowUpWords({ ...input });
  // An echoed stored word, or a TODO memo cached before the claim was billed,
  // cannot move the claim that the current row already holds.
  if (
    !setsClaim && (
      (stored.claim_status === "claimed" && (stored.memo || null) === (words.memo || null) && words.claim_status === "to_claim")
      || (stored.claim_status != null && stored.memo === input.memo)
    )
  ) {
    delete patch.claim_status;
    delete patch.claimed_on;
  }
  return patch;
}

/**
 * The claim fields an update leaves on a row. Explicit values win; a row that
 * is not claimed has no claimed day. Clearing and reconciling never touch it.
 */
export function nextClaim(
  existing: { claim_status?: unknown; claimed_on?: unknown },
  patch: Pick<Partial<TransactionInput>, "claim_status" | "claimed_on">,
): { claim_status: ClaimStatus | null; claimed_on: string | null } {
  const status = patch.claim_status === undefined ? storedStatus(existing.claim_status) : patch.claim_status ?? null;
  if (status !== "claimed") return { claim_status: status, claimed_on: null };
  if (patch.claimed_on !== undefined) return { claim_status: status, claimed_on: patch.claimed_on ?? null };
  const keep = storedStatus(existing.claim_status) === "claimed" && typeof existing.claimed_on === "string" ? existing.claimed_on : null;
  return { claim_status: status, claimed_on: keep };
}

export type TransferClaim = { claim_status: ClaimStatus | null; claimed_on: string | null };

/**
 * The claim the other side of an ordinary transfer takes from a write: the
 * pair holds one claim, as it holds one memo. Undefined when the write does
 * not mention the claim, so the other side keeps the one it has. The linked
 * side of a split line is not a pair member here; it owns its claim.
 */
export function transferClaim(input: { claim_status?: unknown; claimed_on?: unknown }): TransferClaim | undefined {
  if (input.claim_status === undefined) return undefined;
  const status = storedStatus(input.claim_status);
  return { claim_status: status, claimed_on: status === "claimed" && typeof input.claimed_on === "string" ? input.claimed_on : null };
}

function storedStatus(value: unknown): ClaimStatus | null {
  return value === "to_claim" || value === "claimed" ? value : null;
}

/**
 * Upsert bindings: an insert or update that does not mention the claim keeps
 * the stored one (an import or a mirror write), so each column binds whether
 * it was given and then its value.
 */
export function claimParams(value: { claim_status?: unknown; claimed_on?: unknown }): [0 | 1, ClaimStatus | null, string | null] {
  if (value.claim_status === undefined) return [0, null, null];
  const status = storedStatus(value.claim_status);
  return [1, status, status === "claimed" && typeof value.claimed_on === "string" ? value.claimed_on : null];
}

export const CLAIM_INSERT_SQL = "?, ?";
export const CLAIM_CONFLICT_SQL =
  "claim_status = CASE WHEN ? = 1 THEN excluded.claim_status ELSE transactions.claim_status END, " +
  "claimed_on = CASE WHEN ? = 1 THEN excluded.claimed_on ELSE transactions.claimed_on END";
