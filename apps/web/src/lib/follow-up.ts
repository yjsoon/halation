// Follow-ups on a transaction: "To confirm" is the stored `needs_confirmation`
// field; "To claim" is the existing memo convention read by the separate
// claims tool (yjsoon/this-claimer). These patterns mirror that tool exactly,
// so the tag shows only on rows it will pick up:
// - a memo starting with `TODO` and then `:` or whitespace is a claim, any case;
// - the tool rewrites it to `CLAIMED - YYYY-MM-DD: <description>`.

const CLAIM_TODO = /^TODO[:\s]/i;
const STRIP_TODO = /^TODO[:\s]\s*/i;
const CLAIMED = /^\s*CLAIMED\b/i;
const STRIP_CLAIMED = /^\s*CLAIMED\b(?:\s*-\s*\d{4}-\d{2}-\d{2})?\s*:?\s*/i;

export type ClaimState = "to-claim" | "claimed" | null;

export function claimState(memo: string | null | undefined): ClaimState {
  if (!memo) return null;
  if (CLAIM_TODO.test(memo)) return "to-claim";
  if (CLAIMED.test(memo)) return "claimed";
  return null;
}

/** The memo with the claim prefix added or removed. */
export function withClaimTodo(memo: string, on: boolean): string {
  const has = CLAIM_TODO.test(memo);
  if (on) {
    if (has) return memo;
    let text = memo.trim();
    if (CLAIM_TODO.test(text)) return text;
    // A claimed row claimed again starts over as TODO rather than both.
    if (CLAIMED.test(text)) text = text.replace(STRIP_CLAIMED, "").trim();
    // A bare "TODO" is not a claim to the claims tool; give it the colon.
    if (/^TODO$/i.test(text)) text = "";
    return text ? `TODO: ${text}` : "TODO:";
  }
  return has ? memo.replace(STRIP_TODO, "").trim() : memo;
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
