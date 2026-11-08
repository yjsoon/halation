import { useState, type RefObject } from "react";
import { api } from "../api/client";
import type { CreditCard } from "../api/types";
import type { RewardFlagColour } from "../lib/flags";
import { colourNamesByAccount, parseRewardFlagNames, REWARD_NAME_COLOURS } from "../lib/reward-flag-names";
import { FlagTag } from "./FlagTag";

/** Card-specific reward labels, not ledger budget categories. */
export function CardCategoryNames({ planId, card, onSaved, onClose, onSavingChange, firstFieldRef }: {
  planId: string;
  card: CreditCard;
  onSaved: (card: CreditCard) => void;
  onClose: () => void;
  onSavingChange: (saving: boolean) => void;
  firstFieldRef: RefObject<HTMLInputElement | null>;
}) {
  const [originalNames] = useState(() => colourNamesByAccount([card]).get(card.ynabAccountId)!);
  const [names, setNames] = useState(originalNames);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidColour, setInvalidColour] = useState<RewardFlagColour | null>(null);
  const changed = REWARD_NAME_COLOURS.filter((colour) => (names[colour] ?? "").trim() !== (originalNames[colour] ?? ""));

  const save = async () => {
    setSaving(true);
    onSavingChange(true);
    setError(null);
    setInvalidColour(null);
    try {
      // Merge only changed labels into the latest card, preserving intervening
      // rule changes and edits to names left untouched in this panel.
      const snapshot = await api.rewardsTrackerSnapshot(planId);
      const current = snapshot.cards.find((entry) => entry.id === card.id);
      if (!current) throw new Error("This reward card no longer exists. Reload the page to continue.");
      const blank = changed.find((colour) => !names[colour]?.trim() && current.subcategories?.some((flag) => flag.flagColor === colour));
      if (blank) {
        setInvalidColour(blank);
        throw new Error("Enter a name for this reward category.");
      }
      const flagNames = parseRewardFlagNames({
        ...current.flagNames,
        ...Object.fromEntries(changed.map((colour) => [colour, names[colour] ?? ""])),
      });
      const updated = await api.updateRewardCard(planId, card.id, {
        flagNames,
        ...(current.subcategories?.some((flag) => changed.includes(flag.flagColor)) ? {
          subcategories: current.subcategories.map((flag) => changed.includes(flag.flagColor)
            ? { ...flag, name: names[flag.flagColor]!.trim(), updatedAt: new Date().toISOString() }
            : flag),
        } : {}),
      });
      onSaved(updated);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the category name.");
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  };

  return (
    <form
      id="card-category-names"
      className="card-category-names"
      aria-label="Card category names"
      onSubmit={(event) => { event.preventDefault(); if (!saving && changed.length) void save(); }}
      onKeyDown={(event) => { if (event.key === "Escape" && !saving) { event.preventDefault(); onClose(); } }}
    >
      <div className="card-category-names-grid">
        {REWARD_NAME_COLOURS.map((colour, index) => {
          const label = colour === "unflagged" ? "None" : colour[0]!.toUpperCase() + colour.slice(1);
          return <label key={colour} className="card-category-name-field">
            <span>{colour !== "unflagged" && <FlagTag colour={colour} />}{label}</span>
            <input
              ref={index === 0 ? firstFieldRef : undefined}
              aria-label={`${label} category name`}
              value={names[colour] ?? ""}
              placeholder={label}
              disabled={saving}
              onChange={(event) => { setNames((previous) => ({ ...previous, [colour]: event.target.value })); setError(null); setInvalidColour(null); }}
              aria-describedby={error ? "card-category-name-error" : undefined}
              aria-invalid={invalidColour === colour}
            />
          </label>;
        })}
      </div>
      {error && <p id="card-category-name-error" className="error" role="alert">{error}</p>}
      <div className="card-category-names-footer">
        <p>Only this card’s reward labels change.</p>
        <div className="card-category-names-actions">
          <button type="button" className="register-add-link register-secondary-action" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="register-add-link" disabled={saving || !changed.length}>{saving ? "Saving…" : "Save names"}</button>
        </div>
      </div>
    </form>
  );
}
