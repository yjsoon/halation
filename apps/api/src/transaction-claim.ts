import type { ClaimStatus, TransactionInput } from "./types";

/**
 * "To claim" is a stored field: `claim_status` is `to_claim` for a receipt to
 * claim back and `claimed` once the claims tool has billed it, with the day in
 * `claimed_on`. Older clients wrote memo words instead (`TODO:`, `CLAIMED - day:`
 * and `TOCHECK` for an estimate); `normaliseFollowUpWords` turns those into the
 * fields so every writer lands on the same state.
 */
export const CLAIM_STATUSES: readonly ClaimStatus[] = ["to_claim", "claimed"];

/** The `type` filter values that list rows to claim and rows claimed. */
export const TO_CLAIM_TYPE = "to_claim";
export const CLAIMED_TYPE = "claimed";

export const CLAIM_DAY = /^\d{4}-\d{2}-\d{2}$/;

const TODO_WORD = /^\s*TODO(?=[:\s]|$):?\s*/i;
const CLAIMED_WORD = /^\s*CLAIMED\b(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*(?::|$)\s*/i;
const TOCHECK_WORD = /^\s*TOCHECK\b:?\s*/i;

export type FollowUpWords = {
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
export function followUpWords(memo: string | null): FollowUpWords {
  const result: FollowUpWords = { memo };
  let text = memo ?? "";
  for (;;) {
    const todo = TODO_WORD.exec(text);
    if (todo) {
      if (!result.claim_status) result.claim_status = "to_claim";
      text = text.slice(todo[0].length);
      continue;
    }
    const claimed = CLAIMED_WORD.exec(text);
    if (claimed) {
      if (!result.claim_status) {
        result.claim_status = "claimed";
        result.claimed_on = claimed[1] ?? null;
      }
      text = text.slice(claimed[0].length);
      continue;
    }
    const check = TOCHECK_WORD.exec(text);
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
  if (words.claim_status && next.claim_status === undefined) {
    next.claim_status = words.claim_status;
    if (words.claim_status === "claimed" && next.claimed_on === undefined) next.claimed_on = words.claimed_on ?? null;
  }
  if (words.needs_confirmation && next.needs_confirmation === undefined) next.needs_confirmation = true;
  return input;
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
