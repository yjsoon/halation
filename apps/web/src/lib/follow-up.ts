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
const CLAIMED_WORD = /^\s*(CLAIMED)\b(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*(:|$)\s*/i;

function marker(pattern: RegExp, text: string, colonGroup = 2): RegExpExecArray | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return match[1] === match[1]!.toUpperCase() || match[colonGroup] === ":" ? match : null;
}

export type ClaimStatus = "to_claim" | "claimed";
export type ClaimState = "to-claim" | "claimed" | null;

const TOCHECK_WORD = /^\s*(TOCHECK)\b(:?)\s*/i;

/**
 * The legacy words at the start of a memo, read as the API reads them, and the
 * memo without them. `withToCheck` also reads `TOCHECK` (an estimate);
 * without it the word is read past but kept in the text, as the register has
 * no mark that could clear it.
 */
export function legacyWords(
  memo: string | null | undefined,
  withToCheck = true,
): { claim: ClaimStatus | null; claimedOn: string | null; toCheck: boolean; text: string } {
  let text = memo ?? "";
  let claim: ClaimStatus | null = null;
  let claimedOn: string | null = null;
  let toCheck = false;
  let found = false;
  let kept = "";
  for (;;) {
    const todo = marker(TODO_WORD, text);
    if (todo) {
      claim ??= "to_claim";
      found = true;
      text = text.slice(todo[0].length);
      continue;
    }
    const claimed = marker(CLAIMED_WORD, text, 3);
    if (claimed) {
      if (!claim) {
        claim = "claimed";
        claimedOn = claimed[2] ?? null;
      }
      found = true;
      text = text.slice(claimed[0].length);
      continue;
    }
    const check = marker(TOCHECK_WORD, text);
    if (check) {
      if (withToCheck) {
        toCheck = true;
        found = true;
      } else {
        kept += `${check[0].trim()} `;
      }
      text = text.slice(check[0].length);
      continue;
    }
    break;
  }
  return { claim, claimedOn, toCheck, text: found ? `${kept}${text}`.trim() : memo ?? "" };
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

/** The claim a saved row holds: the stored field, else a legacy memo word. */
export function savedClaim(txn: {
  readonly memo?: string | null;
  readonly claim_status?: ClaimStatus | null;
  readonly claimed_on?: string | null;
}): { status: ClaimStatus | null; claimedOn: string | null } {
  if (txn.claim_status) return { status: txn.claim_status, claimedOn: txn.claimed_on ?? null };
  const legacy = legacyWords(txn.memo, false);
  return { status: legacy.claim, claimedOn: legacy.claimedOn };
}

/** Short label for a row's payee in a toast. */
export function confirmedMessage(payee: string | null | undefined): string {
  return `${payee?.trim() || "Transaction"} confirmed.`;
}
