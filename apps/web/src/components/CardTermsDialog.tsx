import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { cycleDatesFor } from "../../../api/src/card-payments";
import { api, useApi } from "../api/client";
import type { Account, CardPaymentTerms, CardPaymentTermsInput } from "../api/types";
import { BANK_PRESETS, isCardAccount, presetFor, type BankPresetId } from "../lib/card-payments";
import { formatDayMonth, formatWeekdayDayMonth, todayIso } from "../lib/dates";
import { stableHash } from "../lib/hash";
import { formatMilliunitsField, parseMilliunitsKeeping } from "../lib/money";
import { usePlan } from "../state/plan";

type Draft = {
  accountId: string;
  enabled: boolean;
  preset: BankPresetId;
  statementDay: string;
  gap: string;
  rule: CardPaymentTerms["due_weekend_rule"];
  fundingAccountId: string;
  /** Why the draft dropped the saved paying account, if it did. */
  fundingDropped: "closed" | "deleted" | null;
  amountRule: CardPaymentTerms["default_amount_rule"];
  fixedAmount: string;
  payDaysBefore: string;
  leadDays: string;
  deliveryHour: string;
};

const DEFAULTS = { gap: 25, rule: "next" as const, payDaysBefore: 2, leadDays: 7, deliveryHour: 8 };

function draftFor(accountId: string, terms: CardPaymentTerms | undefined, accounts: Account[]): Draft {
  const savedFunding = terms?.default_funding_account_id ?? null;
  const savedAccount = savedFunding === null ? undefined : accounts.find((account) => account.id === savedFunding);
  const fundingUsable = Boolean(savedAccount && !savedAccount.closed && !savedAccount.deleted);
  const gap = terms?.due_gap_days ?? DEFAULTS.gap;
  const rule = terms?.due_weekend_rule ?? DEFAULTS.rule;
  return {
    accountId,
    enabled: terms?.enabled ?? true,
    preset: terms ? presetFor(gap, rule) : "dbs",
    statementDay: terms ? String(terms.statement_day) : "",
    gap: String(gap),
    rule,
    fundingAccountId: fundingUsable && savedFunding ? savedFunding : "",
    // The plan's account list leaves deleted accounts out, so a missing one was deleted.
    fundingDropped: savedFunding === null || fundingUsable ? null : savedAccount && savedAccount.closed && !savedAccount.deleted ? "closed" : "deleted",
    amountRule: terms?.default_amount_rule ?? "statement",
    fixedAmount: terms?.default_amount_milli ? formatMilliunitsField(terms.default_amount_milli) : "",
    payDaysBefore: String(terms?.pay_days_before_due ?? DEFAULTS.payDaysBefore),
    leadDays: String(terms?.lead_days ?? DEFAULTS.leadDays),
    deliveryHour: String(terms?.delivery_hour ?? DEFAULTS.deliveryHour),
  };
}

/**
 * A card's payment terms: statement day, due gap and weekend rule, and the
 * defaults the phone's one-tap Scheduled and the web's Schedule… start from.
 * The "Next" line uses the server's own cycle maths, so it matches what
 * Payments due will show.
 */
export function CardTermsDialog({ accountId, onClose, onSaved }: {
  /** The card to edit; null asks which card to set up. */
  accountId: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { planId, accounts } = usePlan();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const existing = useApi(`${planId}:card-terms-dialog`, () => api.cardPaymentTerms(planId));
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const cards = useMemo(() => accounts.filter((account) => isCardAccount(account) && (!account.closed || account.id === accountId)).sort((a, b) => a.name.localeCompare(b.name)), [accounts, accountId]);
  const termsByAccount = useMemo(() => new Map((existing.data?.card_payment_terms ?? []).map((terms) => [terms.account_id, terms])), [existing.data]);
  const title = accountId ? `Payment reminders for ${accounts.find((account) => account.id === accountId)?.name ?? "this card"}` : "Set up payment reminders";

  return (
    <dialog
      ref={dialogRef}
      className="account-organiser card-terms-dialog"
      aria-labelledby="card-terms-title"
      aria-describedby="card-terms-description"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
    >
      <div className="account-organiser-surface">
        <header className="account-organiser-header">
          <div>
            <span className="page-eyebrow">Card payment terms</span>
            <h2 id="card-terms-title">{title}</h2>
            <p id="card-terms-description">Halation works out each statement and due date from these terms. Your iPhone sends the reminders; Payments due on Scheduled shows the same dates.</p>
          </div>
          <button type="button" className="account-organiser-close" onClick={() => dialogRef.current?.close()} aria-label="Close payment terms">×</button>
        </header>
        {existing.loading && !existing.data && <p className="card-terms-loading">Loading payment terms…</p>}
        {existing.error && <p className="transaction-editor-error card-terms-loading" role="alert">Could not load payment terms. {existing.error}</p>}
        {existing.data && (
          <TermsForm
            key={accountId ?? "new"}
            planId={planId}
            initialAccountId={accountId ?? cards.find((card) => !termsByAccount.has(card.id))?.id ?? ""}
            lockAccount={accountId !== null}
            cards={cards}
            accounts={accounts}
            termsByAccount={termsByAccount}
            onCancel={() => dialogRef.current?.close()}
            onSaved={(message) => { onSaved(message); dialogRef.current?.close(); }}
          />
        )}
      </div>
    </dialog>
  );
}

function TermsForm({ planId, initialAccountId, lockAccount, cards, accounts, termsByAccount, onCancel, onSaved }: {
  planId: string;
  initialAccountId: string;
  lockAccount: boolean;
  cards: Account[];
  accounts: Account[];
  termsByAccount: Map<string, CardPaymentTerms>;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(initialAccountId, termsByAccount.get(initialAccountId), accounts));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [operationSeed] = useState(() => crypto.randomUUID());
  const existing = termsByAccount.get(draft.accountId);
  const cardName = accounts.find((account) => account.id === draft.accountId)?.name ?? "this card";
  const fundingAccounts = accounts.filter((account) => !account.deleted && !account.closed && account.id !== draft.accountId);
  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  const statementDay = wholeNumber(draft.statementDay, 1, 31);
  const gap = wholeNumber(draft.gap, 1, 60);
  const payDaysBefore = wholeNumber(draft.payDaysBefore, 0, 10);
  const preview = statementDay !== null && gap !== null && payDaysBefore !== null
    ? cycleDatesFor({ statement_day: statementDay, due_gap_days: gap, due_weekend_rule: draft.rule, pay_days_before_due: payDaysBefore }, todayIso())
    : null;
  // The cycle still open for payment, or the coming one once its due date has passed.
  const upcoming = preview ? (preview.current.due_date >= todayIso() ? preview.current : preview.next) : null;

  const choosePreset = (preset: BankPresetId) => {
    const found = BANK_PRESETS.find((entry) => entry.id === preset);
    patch(found ? { preset, gap: String(found.gap), rule: found.rule } : { preset });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const leadDays = wholeNumber(draft.leadDays, 0, 30);
    const deliveryHour = wholeNumber(draft.deliveryHour, 0, 23);
    const fixed = draft.amountRule === "fixed" ? parseMilliunitsKeeping(draft.fixedAmount, termsByAccount.get(draft.accountId)?.default_amount_milli) : null;
    if (!draft.accountId) { setError("Choose the card these terms are for."); return; }
    if (statementDay === null) { setError("Enter a statement day from 1 to 31."); return; }
    if (gap === null) { setError("Enter the days from statement to due date, from 1 to 60."); return; }
    if (payDaysBefore === null) { setError("Pay on must be 0 to 10 working days before the due date."); return; }
    if (leadDays === null) { setError("Remind me must be 0 to 30 days before the due date."); return; }
    if (deliveryHour === null) { setError("Choose a reminder time."); return; }
    if (draft.amountRule === "fixed" && (fixed === null || fixed <= 0)) { setError("Enter the fixed amount you usually pay, above zero."); return; }
    const input: CardPaymentTermsInput = {
      statement_day: statementDay,
      due_gap_days: gap,
      due_weekend_rule: draft.rule,
      default_funding_account_id: draft.fundingAccountId || null,
      default_amount_rule: draft.amountRule,
      default_amount_milli: draft.amountRule === "fixed" ? fixed : null,
      pay_days_before_due: payDaysBefore,
      lead_days: leadDays,
      delivery_hour: deliveryHour,
      enabled: draft.enabled,
      // PUT replaces the row: keep the minimum-payment rule the card already has.
      ...(existing ? { minimum_floor_milli: existing.minimum_floor_milli, minimum_rate_bp: existing.minimum_rate_bp } : {}),
    };
    setSaving(true);
    setError(null);
    try {
      await api.putCardPaymentTerms(planId, draft.accountId, input, `card-terms-${operationSeed}-${stableHash(`${draft.accountId}:${JSON.stringify(input)}`)}`);
      onSaved(upcoming
        ? `Payment terms saved for ${cardName}. Next due ${formatWeekdayDayMonth(upcoming.due_date)}, for the ${formatDayMonth(upcoming.statement_date)} statement.`
        : `Payment terms saved for ${cardName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.deleteCardPaymentTerms(planId, draft.accountId, `card-terms-delete-${operationSeed}`);
      onSaved(`Payment reminders removed for ${cardName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  if (cards.length === 0) {
    return <div className="account-organiser-content"><p className="account-organiser-empty">Add a credit card or line of credit account first. Payment terms only apply to those.</p></div>;
  }

  return (
    <form className="card-terms-form" onSubmit={(event) => void submit(event)}>
      <div className="account-organiser-content">
        <section className="account-organiser-section" aria-labelledby="card-terms-cycle-heading">
          <div className="account-organiser-section-heading"><div><h3 id="card-terms-cycle-heading">Statement and due date</h3><p>Copy these from a recent statement. Presets fill the usual gap for that bank.</p></div></div>
          {!lockAccount && (
            <label className="field"><span className="field-label">Card</span>
              <select value={draft.accountId} onChange={(event) => setDraft(draftFor(event.target.value, termsByAccount.get(event.target.value), accounts))} required>
                <option value="">Choose card</option>
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name}{termsByAccount.has(card.id) ? " (set up)" : ""}</option>)}
              </select>
            </label>
          )}
          <label className="transaction-editor-checkbox"><input type="checkbox" checked={draft.enabled} onChange={(event) => patch({ enabled: event.target.checked })} /> Remind me about this card</label>
          <div className="field-row">
            <label className="field"><span className="field-label">Bank preset</span>
              <select value={draft.preset} onChange={(event) => choosePreset(event.target.value as BankPresetId)}>
                {BANK_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field"><span className="field-label">Statement day</span>
              <input type="number" inputMode="numeric" min={1} max={31} value={draft.statementDay} onChange={(event) => patch({ statementDay: event.target.value })} placeholder="1 to 31" required />
              <span className="field-note">Day of the month on the statement. 31 means the last day.</span>
            </label>
          </div>
          <div className="field-row">
            <label className="field"><span className="field-label">Days to due date</span>
              <input type="number" inputMode="numeric" min={1} max={60} value={draft.gap} onChange={(event) => patch({ gap: event.target.value, preset: presetFor(Number(event.target.value), draft.rule) })} required />
              <span className="field-note">Calendar days from statement to due date.</span>
            </label>
            <label className="field"><span className="field-label">Due on a weekend</span>
              <select value={draft.rule} onChange={(event) => { const rule = event.target.value as Draft["rule"]; patch({ rule, preset: presetFor(Number(draft.gap), rule) }); }}>
                <option value="next">Next working day</option>
                <option value="previous">Previous working day</option>
              </select>
            </label>
          </div>
          <p className="card-terms-preview" role="status" aria-live="polite">
            {upcoming ? <>Next due <strong>{formatWeekdayDayMonth(upcoming.due_date)}</strong>, for the <strong>{formatDayMonth(upcoming.statement_date)}</strong> statement. Pay by {formatWeekdayDayMonth(upcoming.last_safe_pay_date)}.</> : "Enter a statement day to see the next dates."}
          </p>
        </section>

        <section className="account-organiser-section" aria-labelledby="card-terms-pay-heading">
          <div className="account-organiser-section-heading"><div><h3 id="card-terms-pay-heading">Paying it</h3><p>Schedule… starts from these. You can change any of them before saving a payment.</p></div></div>
          <div className="field-row">
            <label className="field"><span className="field-label">Pay from</span>
              <select value={draft.fundingAccountId} onChange={(event) => patch({ fundingAccountId: event.target.value, fundingDropped: null })}>
                <option value="">{draft.fundingDropped ? "Choose an account" : "Choose each time"}</option>
                {fundingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              {draft.fundingDropped && <span className="field-note card-terms-field-warning">The account these terms paid from is {draft.fundingDropped}. Choose another, or leave it to choose each time.</span>}
            </label>
            <label className="field"><span className="field-label">Usually pay</span>
              <select value={draft.amountRule} onChange={(event) => patch({ amountRule: event.target.value as Draft["amountRule"] })}>
                <option value="statement">Statement balance</option>
                <option value="minimum">Minimum payment</option>
                <option value="fixed">A fixed amount</option>
              </select>
            </label>
          </div>
          {draft.amountRule === "fixed" && (
            <label className="field"><span className="field-label">Fixed amount</span>
              <input type="text" inputMode="decimal" value={draft.fixedAmount} onChange={(event) => patch({ fixedAmount: event.target.value })} placeholder="500.00" required />
            </label>
          )}
          <label className="field"><span className="field-label">Pay on</span>
            <span className="card-terms-inline"><input type="number" inputMode="numeric" min={0} max={10} value={draft.payDaysBefore} onChange={(event) => patch({ payDaysBefore: event.target.value })} required /> working days before the due date</span>
            <span className="field-note">Transfers from another bank can take up to three working days.</span>
          </label>
        </section>

        <section className="account-organiser-section" aria-labelledby="card-terms-remind-heading">
          <div className="account-organiser-section-heading"><div><h3 id="card-terms-remind-heading">Reminders on your iPhone</h3><p>The website does not send notifications.</p></div></div>
          <div className="field-row">
            <label className="field"><span className="field-label">Remind me</span>
              <span className="card-terms-inline"><input type="number" inputMode="numeric" min={0} max={30} value={draft.leadDays} onChange={(event) => patch({ leadDays: event.target.value })} required /> days before the due date</span>
            </label>
            <label className="field"><span className="field-label">At</span>
              <select value={draft.deliveryHour} onChange={(event) => patch({ deliveryHour: event.target.value })}>
                {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={String(hour)}>{String(hour).padStart(2, "0")}:00</option>)}
              </select>
            </label>
          </div>
        </section>
        {error && <p className="transaction-editor-error" role="alert">{error}</p>}
        {confirmRemove && existing && (
          <div className="card-terms-remove-confirm" role="group" aria-label="Confirm removal">
            <p>Remove payment reminders for {cardName}? Scheduled payments stay as they are.</p>
            <button type="button" className="organiser-secondary-button" onClick={() => setConfirmRemove(false)} disabled={saving}>Keep</button>
            <button type="button" className="organiser-danger-button" onClick={() => void remove()} disabled={saving}>{saving ? "Removing…" : "Remove reminders"}</button>
          </div>
        )}
      </div>
      <footer className="account-organiser-footer card-terms-footer">
        {existing && !confirmRemove && <button type="button" className="organiser-danger-link" onClick={() => setConfirmRemove(true)} disabled={saving}>Remove reminders</button>}
        <button type="button" className="text-button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="save-button" disabled={saving}>{saving ? "Saving…" : "Save terms"}</button>
      </footer>
    </form>
  );
}

function wholeNumber(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : null;
}
