import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusPanel } from "../components/StatusPanel";
import { ACCOUNT_KIND_GROUPS, newAccountRequest, storesLiability, type NewAccountKind } from "../lib/new-account";
import { usePlan } from "../state/plan";

export function NewAccountPage() {
  const { accounts, createAccount } = usePlan();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NewAccountKind>("checking");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "New account · Halation";
  }, []);

  const request = newAccountRequest({ name, kind, balance });
  const liability = storesLiability(kind);
  const balanceInvalid = !request.ok && request.error === "balance";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!request.ok || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createAccount(request.body);
      navigate(`/transactions?accounts=${encodeURIComponent(created.id)}&range=all`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  }

  return (
    <>
      <header className="report-header">
        <div>
          <h1>New account</h1>
          {accounts.length === 0 && (
            <p className="new-account-intro">Add the account you spend from most. You can add the rest later.</p>
          )}
        </div>
      </header>

      {error && <StatusPanel error role="alert" title="Could not create the account.">{error}</StatusPanel>}

      <form className="new-account-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Everyday account"
            maxLength={100}
            autoComplete="off"
            autoFocus
            required
            disabled={saving}
          />
        </label>
        <label className="field">
          <span className="field-label">Type</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as NewAccountKind)} disabled={saving}>
            {ACCOUNT_KIND_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.kinds.map((option) => (
                  <option key={option.kind} value={option.kind}>{option.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{liability ? "Amount owed" : "Current balance"}</span>
          <input
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={balanceInvalid || undefined}
            aria-describedby="new-account-balance-note"
            disabled={saving}
          />
          <span id="new-account-balance-note" className={balanceInvalid ? "field-note field-note-error" : "field-note"}>
            {balanceInvalid
              ? "Enter an amount with no more than three decimal places."
              : liability
                ? "Enter what you owe today."
                : "Today’s balance. Use a minus sign if you’re overdrawn."}
          </span>
        </label>
        <button type="submit" className="save-button" disabled={!request.ok || saving}>
          {saving ? "Creating…" : "Create account"}
        </button>
      </form>
    </>
  );
}
