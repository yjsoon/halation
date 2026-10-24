import type { ReactElement } from "react";
import { claimState, withClaimTodo } from "../lib/follow-up";

/**
 * The Follow-up control in an expanded register row: two independent chips.
 * "To confirm" is the stored `needs_confirmation`; "To claim" adds or removes
 * `TODO` in the memo, the word the claims tool already looks for.
 */
export function FollowUpChips({
  id,
  needsConfirmation,
  memo,
  disabled,
  onNeedsConfirmationChange,
  onMemoChange,
}: {
  id: string;
  needsConfirmation: boolean;
  memo: string;
  disabled?: boolean;
  onNeedsConfirmationChange: (value: boolean) => void;
  onMemoChange?: (memo: string) => void;
}): ReactElement {
  const toClaim = claimState(memo) === "to-claim";
  return (
    <div className="follow-up" role="group" aria-labelledby={`${id}-follow-up-label`}>
      <span className="field-label" id={`${id}-follow-up-label`}>Follow-up</span>
      <button
        type="button"
        className="follow-up-chip follow-up-chip-confirm"
        aria-pressed={needsConfirmation}
        title="The amount is an estimate. Check it against the statement, then clear the row or turn this off."
        onClick={() => onNeedsConfirmationChange(!needsConfirmation)}
        disabled={disabled}
      >
        <span className="follow-up-glyph" aria-hidden="true">≈</span>
        To confirm
      </button>
      {onMemoChange ? (
        <button
          type="button"
          className="follow-up-chip follow-up-chip-claim"
          aria-pressed={toClaim}
          title="Adds TODO to the memo, which the claims tool picks up."
          onClick={() => onMemoChange(withClaimTodo(memo, !toClaim))}
          disabled={disabled}
        >
          <ClaimGlyph />
          To claim
        </button>
      ) : null}
    </div>
  );
}

export function ClaimGlyph(): ReactElement {
  return (
    <svg className="follow-up-glyph" width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
      <path d="M1.5 0.75h4.5l2.5 2.5v8h-7z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M3 5.5h4M3 7.75h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The ≈ before an estimated amount in an idle row. A button: activating it
 * confirms the amount as it stands.
 */
export function EstimateMark({
  onConfirm,
  busy,
}: {
  onConfirm?: () => void;
  busy?: boolean;
}): ReactElement {
  if (!onConfirm) {
    return <span className="estimate-mark" role="img" aria-label="Estimated amount, to confirm" title="Estimated amount, to confirm">≈</span>;
  }
  return (
    <button
      type="button"
      className="estimate-mark"
      aria-label="Estimated amount, to confirm. Confirm amount"
      title="Estimated amount. Click to confirm it."
      disabled={busy}
      onClick={(event) => { event.stopPropagation(); onConfirm(); }}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      ≈
    </button>
  );
}
