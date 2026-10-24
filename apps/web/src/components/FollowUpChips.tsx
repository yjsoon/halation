import type { ReactElement } from "react";
import type { ClaimStatus } from "../lib/follow-up";

/**
 * The Follow-up control in an expanded register row: two independent chips.
 * "To confirm" is the stored `needs_confirmation`; "To claim" is the stored
 * `claim_status` the claims tool reads. A claimed row shows when it was
 * claimed; pressing To claim on it files it to claim again.
 */
export function FollowUpChips({
  id,
  needsConfirmation,
  claimStatus,
  claimedOn,
  disabled,
  onNeedsConfirmationChange,
  onClaimStatusChange,
}: {
  id: string;
  needsConfirmation: boolean;
  claimStatus: ClaimStatus | null;
  claimedOn?: string | null;
  disabled?: boolean;
  onNeedsConfirmationChange: (value: boolean) => void;
  onClaimStatusChange?: (status: ClaimStatus | null) => void;
}): ReactElement {
  const toClaim = claimStatus === "to_claim";
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
      {onClaimStatusChange ? (
        <button
          type="button"
          className="follow-up-chip follow-up-chip-claim"
          aria-pressed={toClaim}
          title={claimStatus === "claimed"
            ? "Already claimed. Press to claim it again."
            : "A spend to claim back. The claims tool lists it until it is claimed."}
          onClick={() => onClaimStatusChange(toClaim ? null : "to_claim")}
          disabled={disabled}
        >
          <ClaimGlyph />
          To claim
        </button>
      ) : null}
      {onClaimStatusChange && claimStatus === "claimed" ? (
        <span className="follow-up-claimed">{claimedLabel(claimedOn)}</span>
      ) : null}
    </div>
  );
}

/** "Claimed 24 Oct 2026", or "Claimed" when the day is not known. */
export function claimedLabel(day: string | null | undefined): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Claimed";
  const date = new Date(`${day}T00:00:00Z`);
  return `Claimed ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
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
      aria-label="Confirm estimated amount"
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
