// Follow-ups on a transaction: "To confirm" is the stored `needs_confirmation`
// field; "To claim" is the existing memo convention, where `TODO` in the memo
// marks a receipt to claim and the separate claims tool rewrites it to
// `CLAIMED`. The chip only adds or removes that word, so the claims tool keeps
// reading exactly what it reads today.

const CLAIM_TODO = /\bTODO\b/;
const CLAIMED = /\bCLAIMED\b/;
// The word, an optional colon and one following space: nothing else of the
// memo is touched, so line breaks, dashes and signs survive.
const STRIP_TODO = /\bTODO\b:?[ \t]?/;
const STRIP_CLAIMED = /\bCLAIMED\b:?[ \t]?/;

export type ClaimState = "to-claim" | "claimed" | null;

export function claimState(memo: string | null | undefined): ClaimState {
  if (!memo) return null;
  if (CLAIM_TODO.test(memo)) return "to-claim";
  if (CLAIMED.test(memo)) return "claimed";
  return null;
}

/** The memo with the claim word added (at the front) or removed. */
export function withClaimTodo(memo: string, on: boolean): string {
  const has = CLAIM_TODO.test(memo);
  if (on) {
    if (has) return memo;
    // A claimed row being claimed again goes back to TODO rather than both.
    if (CLAIMED.test(memo)) return memo.replace(CLAIMED, "TODO");
    return memo.trim() ? `TODO ${memo.trim()}` : "TODO";
  }
  return has ? memo.replace(new RegExp(STRIP_TODO.source, "g"), "").trim() : memo;
}

/** The memo split into its claim marker and the text a reader cares about. */
export function memoForDisplay(memo: string | null | undefined): { claim: ClaimState; text: string } {
  const claim = claimState(memo);
  if (!memo || !claim) return { claim, text: memo ?? "" };
  return { claim, text: memo.replace(claim === "to-claim" ? STRIP_TODO : STRIP_CLAIMED, "").trim() };
}

/** Short label for a row's payee in a toast. */
export function confirmedMessage(payee: string | null | undefined): string {
  return `${payee?.trim() || "Transaction"} confirmed.`;
}
