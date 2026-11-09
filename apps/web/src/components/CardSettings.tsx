import { useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { cycleDatesFor } from "../../../api/src/card-payments";
import { rewardsToday } from "../../../api/src/rewards/engine/date-utils";
import { ruleChangeDates } from "../../../api/src/rewards/versions";
import { api, useApi } from "../api/client";
import type { Account, CardRuleVersion, CreditCard } from "../api/types";
import type { RewardFlagColour } from "../lib/flags";
import { formatDate, formatDayMonth, formatWeekdayDayMonth, todayIso } from "../lib/dates";
import { colourNamesByAccount, parseRewardFlagNames, REWARD_NAME_COLOURS } from "../lib/reward-flag-names";
import { usePlan } from "../state/plan";
import { FlagTag } from "./FlagTag";

type Scope = "current" | "next" | "everywhere";
type RuleDraft = { rewardValue: string; maximumSpend: string };

/**
 * One card's settings, in three parts that save separately: the ledger
 * account, its payment reminders, and its rewards rules. Only rewards rules
 * keep a history, so only they ask when a change applies.
 */
export function CardSettings({ planId, account, card, termsGeneration, onEditTerms, onSaved, onClose, onSavingChange, firstFieldRef }: {
  planId: string;
  account: Account;
  card: CreditCard | undefined;
  termsGeneration: number;
  onEditTerms: () => void;
  onSaved: (message: string, card?: CreditCard) => void;
  onClose: () => void;
  onSavingChange: (saving: boolean) => void;
  firstFieldRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <section id="card-settings" className="card-settings" aria-label={`Card settings for ${account.name}`}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
      <AccountBand account={account} firstFieldRef={firstFieldRef} onSaved={onSaved} onSavingChange={onSavingChange} />
      <TermsBand planId={planId} account={account} generation={termsGeneration} onEdit={onEditTerms} />
      {card
        ? <RewardsBand planId={planId} card={card} onSaved={onSaved} onClose={onClose} onSavingChange={onSavingChange} />
        : (
          <div className="card-settings-band">
            <Heading title="Rewards" note="Not set up." />
            <div className="card-settings-body">
              <p className="card-settings-note">No rewards rules on this account.</p>
              <Link className="register-add-link register-secondary-action" to={`/rewards/new?account=${encodeURIComponent(account.id)}`}>Set up rewards</Link>
            </div>
          </div>
        )}
    </section>
  );
}

function Heading({ title, note }: { title: string; note: string }) {
  return (
    <div className="card-settings-heading">
      <h2>{title}</h2>
      <p>{note}</p>
    </div>
  );
}

function AccountBand({ account, firstFieldRef, onSaved, onSavingChange }: {
  account: Account;
  firstFieldRef: RefObject<HTMLInputElement | null>;
  onSaved: (message: string) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const { renameAccount } = usePlan();
  const [name, setName] = useState(account.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const save = async () => {
    if (!trimmed) { setError("Enter a name for this account."); return; }
    setSaving(true);
    onSavingChange(true);
    setError(null);
    try {
      await renameAccount(account.id, trimmed);
      onSaved("Account name saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the account name.");
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  };
  return (
    <form className="card-settings-band" onSubmit={(event) => { event.preventDefault(); if (!saving && trimmed !== account.name) void save(); }}>
      <Heading title="Account" note="Saves now. No history." />
      <div className="card-settings-body">
        <div className="card-settings-row">
          <label className="card-settings-field card-settings-name">
            <span>Name</span>
            <input ref={firstFieldRef} value={name} disabled={saving}
              aria-describedby={error ? "card-settings-name-error" : undefined}
              aria-invalid={Boolean(error)}
              onChange={(event) => { setName(event.target.value); setError(null); }} />
          </label>
          <button type="submit" className="register-add-link register-secondary-action" disabled={saving || trimmed === account.name}>
            {saving ? "Saving…" : "Save name"}
          </button>
        </div>
        {error && <p id="card-settings-name-error" className="error" role="alert">{error}</p>}
      </div>
    </form>
  );
}

function TermsBand({ planId, account, generation, onEdit }: {
  planId: string;
  account: Account;
  generation: number;
  onEdit: () => void;
}) {
  const terms = useApi(`${planId}:card-settings-terms:${generation}`, () => api.cardPaymentTerms(planId));
  const mine = terms.data?.card_payment_terms.find((entry) => entry.account_id === account.id);
  let summary = "Loading…";
  if (terms.error) summary = "Could not load payment reminders.";
  else if (terms.data && !mine) summary = "Not set up.";
  else if (mine && !mine.enabled) summary = `Statement on day ${mine.statement_day}. Reminders off.`;
  else if (mine) {
    const cycles = cycleDatesFor(mine, todayIso());
    // The cycle still open for payment, or the coming one once its due date has passed.
    const next = cycles.current.due_date >= todayIso() ? cycles.current : cycles.next;
    summary = `Statement on day ${mine.statement_day}. Next due ${formatWeekdayDayMonth(next.due_date)}, for the ${formatDayMonth(next.statement_date)} statement.`;
  }
  return (
    <div className="card-settings-band">
      <Heading title="Payment reminders" note="Saves now. No history." />
      <div className="card-settings-body card-settings-row">
        <p className="card-settings-summary">{summary}</p>
        {!account.closed && <button type="button" className="register-add-link register-secondary-action" onClick={onEdit}>Edit</button>}
      </div>
    </div>
  );
}

function RewardsBand({ planId, card, onSaved, onClose, onSavingChange }: {
  planId: string;
  card: CreditCard;
  onSaved: (message: string, card?: CreditCard) => void;
  onClose: () => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [originalNames] = useState(() => colourNamesByAccount([card]).get(card.ynabAccountId)!);
  const [names, setNames] = useState(originalNames);
  const flags = [...(card.subcategories ?? [])].sort((a, b) => a.priority - b.priority);
  const [originalRules] = useState(() => ({
    earningRate: numberText(card.earningRate),
    maximumSpend: numberText(card.maximumSpend),
    flags: Object.fromEntries(flags.map((flag) => [flag.id, { rewardValue: numberText(flag.rewardValue), maximumSpend: numberText(flag.maximumSpend) }])) as Record<string, RuleDraft>,
  }));
  const [rules, setRules] = useState(originalRules);
  const [scope, setScope] = useState<Scope>("current");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dates = ruleChangeDates(card, rewardsToday());
  const unit = card.type === "cashback" ? "%" : "miles/$";
  const changedNames = REWARD_NAME_COLOURS.filter((colour) => (names[colour] ?? "").trim() !== (originalNames[colour] ?? ""));
  const changedRules = rules.earningRate !== originalRules.earningRate
    || rules.maximumSpend !== originalRules.maximumSpend
    || flags.some((flag) => JSON.stringify(rules.flags[flag.id]) !== JSON.stringify(originalRules.flags[flag.id]));
  const dirty = changedNames.length > 0 || changedRules;

  const save = async () => {
    setSaving(true);
    onSavingChange(true);
    setError(null);
    try {
      const earningRate = optionalNumber(rules.earningRate, "Earning rate");
      const maximumSpend = optionalNumber(rules.maximumSpend, "Card maximum spend");
      const flagRules = new Map(flags.map((flag) => [flag.id, {
        rewardValue: requiredNumber(rules.flags[flag.id]!.rewardValue, `${flagLabel(flag.flagColor, names)} reward value`),
        maximumSpend: optionalNumber(rules.flags[flag.id]!.maximumSpend, `${flagLabel(flag.flagColor, names)} maximum spend`),
      }]));
      // Merge into the latest card, so a save elsewhere since this panel
      // opened is kept for every field this panel did not change.
      const current = (await api.rewardsTrackerSnapshot(planId)).cards.find((entry) => entry.id === card.id);
      if (!current) throw new Error("This reward card no longer exists. Reload the page to continue.");
      const blank = changedNames.find((colour) => !names[colour]?.trim() && current.subcategories?.some((flag) => flag.flagColor === colour));
      if (blank) throw new Error(`Enter a name for ${flagLabel(blank, {})}.`);
      const now = new Date().toISOString();
      const patch: Partial<CreditCard> = {
        flagNames: parseRewardFlagNames({ ...current.flagNames, ...Object.fromEntries(changedNames.map((colour) => [colour, names[colour] ?? ""])) }),
        subcategories: current.subcategories?.map((flag) => {
          const edited = flagRules.get(flag.id);
          const original = originalRules.flags[flag.id];
          const next = { ...flag };
          if (changedNames.includes(flag.flagColor)) next.name = names[flag.flagColor]!.trim();
          if (edited && original && rules.flags[flag.id]!.rewardValue !== original.rewardValue) next.rewardValue = edited.rewardValue;
          if (edited && original && rules.flags[flag.id]!.maximumSpend !== original.maximumSpend) next.maximumSpend = edited.maximumSpend;
          return JSON.stringify(next) === JSON.stringify(flag) ? flag : { ...next, updatedAt: now };
        }),
        ...(rules.earningRate !== originalRules.earningRate ? { earningRate } : {}),
        ...(rules.maximumSpend !== originalRules.maximumSpend ? { maximumSpend } : {}),
      };
      const appliesFrom = scope === "everywhere" ? "everywhere" : scope === "next" ? dates.next : dates.current;
      const updated = await api.updateRewardCard(planId, card.id, patch, appliesFrom);
      onSaved(scope === "everywhere"
        ? "Rewards rules saved for every period."
        : `Rewards rules saved from ${formatDate(appliesFrom)}. Earlier periods keep their rules.`, updated);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the rewards rules.");
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  };

  const scopes: Array<{ value: Scope; label: string }> = [
    { value: "current", label: `This period, from ${formatDayMonth(dates.current)}` },
    { value: "next", label: `Next period, from ${formatDayMonth(dates.next)}` },
    { value: "everywhere", label: "Correct everywhere" },
  ];
  return (
    <form className="card-settings-band" aria-label="Rewards rules"
      onSubmit={(event) => { event.preventDefault(); if (!saving && dirty) void save(); }}>
      <Heading title="Rewards" note="Changes by card period. Earlier periods keep their rules." />
      <div className="card-settings-body">
        <div className="card-category-names-grid">
          {REWARD_NAME_COLOURS.map((colour) => {
            const label = colourLabel(colour);
            return <label key={colour} className="card-category-name-field">
              <span>{colour !== "unflagged" && <FlagTag colour={colour} />}{label}</span>
              <input aria-label={`${label} category name`} value={names[colour] ?? ""} placeholder={label} disabled={saving}
                onChange={(event) => { setNames((previous) => ({ ...previous, [colour]: event.target.value })); setError(null); }} />
            </label>;
          })}
        </div>
        <div className="card-settings-rules" role="group" aria-label="Rates and caps">
          <span className="card-settings-rules-head">Applies to</span>
          <span className="card-settings-rules-head">Reward value ({unit})</span>
          <span className="card-settings-rules-head">Maximum spend</span>
          <span className="card-settings-rules-name">Whole card (earning rate)</span>
          <input aria-label="Earning rate" inputMode="decimal" value={rules.earningRate} disabled={saving}
            onChange={(event) => { setRules((previous) => ({ ...previous, earningRate: event.target.value })); setError(null); }} />
          <input aria-label="Card maximum spend" inputMode="decimal" placeholder="No cap" value={rules.maximumSpend} disabled={saving}
            onChange={(event) => { setRules((previous) => ({ ...previous, maximumSpend: event.target.value })); setError(null); }} />
          {flags.map((flag) => {
            const label = flagLabel(flag.flagColor, names);
            return [
              <span key={`${flag.id}-name`} className="card-settings-rules-name">
                {flag.flagColor !== "unflagged" && <FlagTag colour={flag.flagColor} />}{label}
              </span>,
              <input key={`${flag.id}-value`} aria-label={`${label} reward value`} inputMode="decimal" disabled={saving}
                value={rules.flags[flag.id]!.rewardValue}
                onChange={(event) => { const value = event.target.value; setRules((previous) => ({ ...previous, flags: { ...previous.flags, [flag.id]: { ...previous.flags[flag.id]!, rewardValue: value } } })); setError(null); }} />,
              <input key={`${flag.id}-max`} aria-label={`${label} maximum spend`} inputMode="decimal" placeholder="No cap" disabled={saving}
                value={rules.flags[flag.id]!.maximumSpend}
                onChange={(event) => { const value = event.target.value; setRules((previous) => ({ ...previous, flags: { ...previous.flags, [flag.id]: { ...previous.flags[flag.id]!, maximumSpend: value } } })); setError(null); }} />,
            ];
          })}
        </div>
        <fieldset className="card-settings-scope" disabled={saving}>
          <legend>Applies from</legend>
          {scopes.map((option) => (
            <label key={option.value} className={scope === option.value ? "card-settings-scope-option card-settings-scope-selected" : "card-settings-scope-option"}>
              <input type="radio" name="card-settings-scope" value={option.value} checked={scope === option.value} onChange={() => setScope(option.value)} />
              {option.label}
            </label>
          ))}
        </fieldset>
        <p className="card-settings-note">
          {scope === "everywhere"
            ? "Every period, including closed ones, uses these changes. For mistakes."
            : `Periods before ${formatDate(scope === "next" ? dates.next : dates.current)} keep their rules. No transactions change.`}
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="card-category-names-footer">
          <Link to={`/rewards/${encodeURIComponent(card.id)}`}>Tiers, promotions and other rules</Link>
          <div className="card-category-names-actions">
            <button type="button" className="register-add-link register-secondary-action" disabled={saving} onClick={onClose}>Cancel</button>
            <button type="submit" className="register-add-link" disabled={saving || !dirty}>{saving ? "Saving…" : "Save rewards"}</button>
          </div>
        </div>
        <EarlierRules card={card} unit={unit} />
      </div>
    </form>
  );
}

function EarlierRules({ card, unit }: { card: CreditCard; unit: string }) {
  const history = card.ruleHistory ?? [];
  if (!history.length) return null;
  return (
    <details className="card-settings-history">
      <summary>Earlier rules ({history.length})</summary>
      <ul>
        {history.map((entry, index) => (
          <li key={entry.until}>
            <span>{index === 0 ? "Before" : `${formatDate(history[index - 1]!.until)} to`} {formatDate(dayBefore(entry.until, index === 0))}:</span>
            {" "}{ruleSummary(entry, unit)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ruleSummary(entry: CardRuleVersion, unit: string): string {
  const names = entry.rules.flagNames ?? {};
  const parts: string[] = [];
  if (typeof entry.rules.earningRate === "number") parts.push(`Earning rate ${entry.rules.earningRate} ${unit}`);
  for (const flag of entry.rules.subcategories ?? []) {
    const cap = typeof flag.maximumSpend === "number" && flag.maximumSpend > 0 ? `, up to ${flag.maximumSpend}` : "";
    parts.push(`${names[flag.flagColor] || flag.name} ${flag.rewardValue}${cap}`);
  }
  return parts.join(" · ") || "No rates set.";
}

function dayBefore(date: string, exclusive: boolean): string {
  if (exclusive) return date;
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function colourLabel(colour: RewardFlagColour): string {
  return colour === "unflagged" ? "None" : colour[0]!.toUpperCase() + colour.slice(1);
}

function flagLabel(colour: RewardFlagColour, names: Partial<Record<RewardFlagColour, string>>): string {
  return names[colour]?.trim() || colourLabel(colour);
}

function numberText(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function optionalNumber(text: string, label: string): number | null {
  if (!text.trim()) return null;
  return requiredNumber(text, label);
}

function requiredNumber(text: string, label: string): number {
  const value = Number(text.trim());
  if (!text.trim() || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a number of 0 or more.`);
  return value;
}
