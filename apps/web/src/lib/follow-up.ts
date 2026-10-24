// Follow-ups on a transaction, both stored fields: "To confirm" is
// `needs_confirmation`; "To claim" is `claim_status` (`to_claim`, then
// `claimed` once the claims tool, yjsoon/this-claimer, has billed it).
//
// Older clients wrote memo words instead: `TODO:` for a claim, `CLAIMED -
// YYYY-MM-DD:` once claimed and `TOCHECK` for an estimate. The API turns those
// into the fields on every write. A row stored before that still shows its
// claim from the memo here, and editing it moves the word into the field.

// The API's rule: a word counts when it is in capitals or is followed by a
// colon in any case, so prose such as "Todo list app" stays text. CLAIMED takes
// only the claims tool's shapes ("CLAIMED - 2026-01-02: x", "CLAIMED: x").
const TODO_WORD = /^\s*(TODO)(?=[:\s]|$)(:?)\s*/i;
const CLAIMED_WORD = /^\s*(CLAIMED)\b(?:\s*-\s*\d{4}-\d{2}-\d{2})?\s*(:|$)\s*/i;

function marker(pattern: RegExp, text: string): RegExpExecArray | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return match[1] === match[1]!.toUpperCase() || match[2] === ":" ? match : null;
}

export type ClaimStatus = "to_claim" | "claimed";
export type ClaimState = "to-claim" | "claimed" | null;

const TOCHECK_WORD = /^\s*(TOCHECK)\b(:?)\s*/i;

/**
 * The legacy words at the start of a memo, read as the API reads them, and the
 * memo without them. `withToCheck` also reads `TOCHECK` (an estimate); the
 * register leaves that word in view, as it has no mark that could clear it.
 */
export function legacyWords(memo: string | null | undefined, withToCheck = true): { claim: ClaimStatus | null; toCheck: boolean; text: string } {
  let text = memo ?? "";
  let claim: ClaimStatus | null = null;
  let toCheck = false;
  for (;;) {
    const todo = marker(TODO_WORD, text);
    if (todo) {
      claim ??= "to_claim";
      text = text.slice(todo[0].length);
      continue;
    }
    const claimed = marker(CLAIMED_WORD, text);
    if (claimed) {
      claim ??= "claimed";
      text = text.slice(claimed[0].length);
      continue;
    }
    const check = withToCheck ? marker(TOCHECK_WORD, text) : null;
    if (check) {
      toCheck = true;
      text = text.slice(check[0].length);
      continue;
    }
    break;
  }
  return claim || toCheck ? { claim, toCheck, text: text.trim() } : { claim, toCheck, text: memo ?? "" };
}

/** A legacy claim word at the start of a memo, and the memo without it. */
export function legacyClaim(memo: string | null | undefined): { claim: ClaimStatus | null; text: string } {
  const { claim, text } = legacyWords(memo, false);
  return { claim, text };
}

function stateOf(status: ClaimStatus | null): ClaimState {
  return status === "to_claim" ? "to-claim" : status === "claimed" ? "claimed" : null;
}

/**
 * The claim a row shows, and the memo text to show beside it. The stored field
 * wins; a row with none falls back to a legacy word in its memo.
 */
export function memoForDisplay(
  memo: string | null | undefined,
  claimStatus?: ClaimStatus | null,
): { claim: ClaimState; text: string } {
  const legacy = legacyClaim(memo);
  if (claimStatus) return { claim: stateOf(claimStatus), text: legacy.text };
  return { claim: stateOf(legacy.claim), text: legacy.text };
}

/** Short label for a row's payee in a toast. */
export function confirmedMessage(payee: string | null | undefined): string {
  return `${payee?.trim() || "Transaction"} confirmed.`;
}
