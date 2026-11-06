import { useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { api, ApiError, useApi } from "../api/client";
import type { PlanSettings } from "../api/types";
import {
  buildPlanSeed,
  CURRENCY_CHOICES,
  DATE_FORMAT_CHOICES,
  DATE_FORMAT_LABELS,
  type DateFormatChoice,
} from "../lib/locale-plan-seed";
import { usePlan } from "../state/plan";
import { savePrefs } from "../state/prefs";
import { LOOKS, setTheme, useTheme, type Mode } from "../lib/theme";
import { StatusPanel } from "../components/StatusPanel";

const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: "system", label: "Match system" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const MIN_PASSWORD_LENGTH = 15;

const TOOLS = [
  {
    to: "/tools/reward-terms",
    name: "Reward terms",
    detail: "Use your own AI provider key to draft and review card reward rules.",
  },
  {
    to: "/tools/statement-formatter",
    name: "Statement formatter",
    detail: "Extract statement images into editable CSV rows with your own provider key.",
  },
  {
    to: "/api-tokens",
    name: "API tokens",
    detail: "Mint and revoke personal tokens for the /v1 API.",
  },
  {
    to: "/import/rewards",
    name: "Rewards import",
    detail: "One-off import of a Rewards Tracker for YNAB settings export.",
  },
];

export function SettingsPage() {
  const theme = useTheme();
  const { planId } = usePlan();
  // Formats as last saved here; they win over the first read so the form
  // reflects a save without a refetch (a refetch would unmount the section and
  // lose its confirmation message).
  const [saved, setSaved] = useState<PlanSettings | null>(null);
  // The role comes from the session check and the formats from the plan, so
  // the owner-only section reflects what the server will actually accept.
  const account = useApi(`settings-account:${planId}`, async () => {
    const [status, settings] = await Promise.all([api.authStatus(), api.settings(planId)]);
    const role = status.roles?.[planId];
    return { isOwner: role === "owner", canExport: role === "owner" || role === "editor", settings };
  });
  // Fetched on its own so a failed plan read cannot hide the disclosure.
  const categoriser = useApi("settings-categoriser", async () => (await api.authStatus()).categoriser_enabled);

  return (
    <div className="settings-page">
      <header className="report-header">
        <div>
          <h1>Settings</h1>
        </div>
      </header>

      <p className="diagnostic-note">
        Your password, plan formats, appearance, tokens and imports live here so the daily ledger stays uncluttered.
      </p>

      <nav className="settings-index" aria-label="Settings sections">
        <a href="#settings-password-heading">Password</a>
        {account.data?.isOwner && <a href="#settings-formats-heading">Formats</a>}
        {account.data?.canExport && <a href="#settings-export-heading">Export</a>}
        {typeof categoriser.data === "boolean" && <a href="#settings-categoriser-heading">Categories</a>}
        <a href="#settings-appearance-heading">Appearance</a>
        <a href="#settings-tools-heading">Tools</a>
      </nav>

      <ChangePasswordSection />

      {account.loading && !account.data && <p className="diagnostic-note" role="status">Loading account details…</p>}
      {account.error && !account.data && (
        <StatusPanel error role="alert">
          Could not load your account details, so plan formats are hidden. Reload to try again. ({account.error})
        </StatusPanel>
      )}
      {account.data?.isOwner && (
        <PlanFormatsSection settings={saved ?? account.data.settings} onSaved={setSaved} />
      )}
      {account.data?.canExport && <ExportSection />}
      {typeof categoriser.data === "boolean" && <CategoriserSection enabled={categoriser.data} />}

      <section className="report-section" aria-labelledby="settings-appearance-heading">
        <div className="section-heading">
          <h2 className="section-title" id="settings-appearance-heading" tabIndex={-1}>Appearance</h2>
          <span className="section-meta">Saved on this device</span>
        </div>
        <div className="theme-picker" role="radiogroup" aria-labelledby="settings-appearance-heading">
          {LOOKS.map((look) => (
            <label key={look.id} className="theme-option" data-look={look.id}>
              <input
                type="radio"
                name="halation-look"
                value={look.id}
                checked={theme.look === look.id}
                onChange={() => setTheme({ look: look.id })}
              />
              <span className="theme-swatch" aria-hidden="true">
                <span className="theme-swatch-chrome" />
                <span className="theme-swatch-paper" />
              </span>
              <span className="theme-option-name">
                {look.name}
                {look.id === "dusk-ridge" && <small> · default</small>}
                {theme.look === look.id && <small className="theme-selected">Selected</small>}
              </span>
              <span className="theme-option-note">{look.note}</span>
            </label>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Colour mode">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              aria-pressed={theme.mode === mode.id}
              className={theme.mode === mode.id ? "segment segment-active" : "segment"}
              onClick={() => setTheme({ mode: mode.id })}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </section>

      <section className="report-section" aria-labelledby="settings-tools-heading">
        <div className="section-heading">
          <h2 className="section-title" id="settings-tools-heading" tabIndex={-1}>Tools</h2>
        </div>
        <ul className="settings-tool-list">
          {TOOLS.map((tool) => (
            <li key={tool.to}>
              <NavLink to={tool.to} className="settings-tool-link">
                <strong>{tool.name}</strong>
                <span>{tool.detail}</span>
                <span className="settings-tool-arrow" aria-hidden="true">›</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function messageOf(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 429) return "Too many attempts. Try again in 15 minutes.";
  return cause instanceof Error ? cause.message : String(cause);
}

function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setDone(false);
    if (Array.from(next.trim()).length < MIN_PASSWORD_LENGTH) {
      setError(`The new password needs at least ${MIN_PASSWORD_LENGTH} characters, not counting spaces at the start or end.`);
      return;
    }
    if (next !== confirm) {
      setError("The new password and its confirmation do not match.");
      return;
    }
    if (next === current) {
      setError("The new password must differ from the current one.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rotated = await api.changePassword(current, next);
      // This session was replaced server-side; keep the stored expiry in step with the new cookie.
      savePrefs({ sessionExpiresAt: rotated.session_expires_at ?? undefined });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="report-section" aria-labelledby="settings-password-heading">
      <div className="section-heading settings-heading">
        <div>
          <h2 className="section-title" id="settings-password-heading" tabIndex={-1}>Change password</h2>
          <span className="section-meta">
            Use at least {MIN_PASSWORD_LENGTH} characters. Every other browser and device signed in as you is signed out; this one stays signed in. Personal API tokens keep working;
            revoke them on the <NavLink to="/api-tokens">API tokens</NavLink> page if you need to.
          </span>
        </div>
      </div>
      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field-label">Current password</span>
          <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required />
        </label>
        <label className="field">
          <span className="field-label">New password</span>
          <input type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
        </label>
        <label className="field">
          <span className="field-label">Confirm new password</span>
          <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required />
        </label>
        <button type="submit" className="save-button settings-form-button" disabled={busy || !current || !next || !confirm}>
          {busy ? "Changing…" : "Change password"}
        </button>
      </form>
      {error && <StatusPanel error role="alert">{error}</StatusPanel>}
      {done && <StatusPanel className="status-panel-success" role="status">Password changed. This device stays signed in; every other session has been signed out.</StatusPanel>}
    </section>
  );
}

function PlanFormatsSection({ settings, onSaved }: { settings: PlanSettings; onSaved: (settings: PlanSettings) => void }) {
  const { planId, reload } = usePlan();
  const savedCurrency = settings.currency_format?.iso_code ?? "";
  const savedDate = settings.date_format?.format ?? "";
  const [currency, setCurrency] = useState(savedCurrency);
  const [dateFormat, setDateFormat] = useState(savedDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // A plan imported from elsewhere may use a value the form does not offer;
  // keep it selectable so the select shows the truth.
  const currencies = CURRENCY_CHOICES.includes(savedCurrency) || !savedCurrency ? CURRENCY_CHOICES : [savedCurrency, ...CURRENCY_CHOICES];
  const dateFormats: readonly string[] = DATE_FORMAT_CHOICES.includes(savedDate as DateFormatChoice) || !savedDate
    ? DATE_FORMAT_CHOICES
    : [savedDate, ...DATE_FORMAT_CHOICES];
  const changed = currency !== savedCurrency || dateFormat !== savedDate;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      // Only what changed is sent, so an untouched custom format stays as it is.
      const seed = buildPlanSeed(currency, dateFormat as DateFormatChoice);
      const updated = await api.updatePlanFormats(planId, {
        ...(currency !== savedCurrency ? { currency_format: seed.currency_format } : {}),
        ...(dateFormat !== savedDate ? { date_format: seed.date_format } : {}),
      } as Parameters<typeof api.updatePlanFormats>[1]);
      setDone(true);
      onSaved(updated);
      reload();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="report-section" aria-labelledby="settings-formats-heading">
      <div className="section-heading settings-heading">
        <div>
          <h2 className="section-title" id="settings-formats-heading" tabIndex={-1}>Currency and date format</h2>
          <span className="section-meta">
            Changing the currency only changes the symbol and decimal places shown. Nothing is converted: $100 becomes £100.
            For a currency such as JPY the cents are hidden, not lost.
          </span>
        </div>
      </div>
      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field-label">Currency</span>
          <select value={currency} onChange={(event) => { setCurrency(event.target.value); setDone(false); }}>
            {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Date format</span>
          <select value={dateFormat} onChange={(event) => { setDateFormat(event.target.value); setDone(false); }}>
            {dateFormats.map((format) => <option key={format} value={format}>{DATE_FORMAT_LABELS[format as DateFormatChoice] ?? format}</option>)}
          </select>
        </label>
        <button type="submit" className="save-button settings-form-button" disabled={busy || !changed}>
          {busy ? "Saving…" : "Save formats"}
        </button>
      </form>
      {error && <StatusPanel error role="alert">{error}</StatusPanel>}
      {done && <StatusPanel className="status-panel-success" role="status">Formats saved. Amounts and dates here now use the new settings. The iOS app shows the new currency after its next refresh and always shows dates as 24 May 2026.</StatusPanel>}
    </section>
  );
}

/** Says whether this server sends transactions to TypeSafe, and what it sends. */
function CategoriserSection({ enabled }: { enabled: boolean }) {
  return (
    <section className="report-section" aria-labelledby="settings-categoriser-heading" data-testid="settings-categoriser">
      <div className="section-heading settings-heading">
        <div>
          <h2 className="section-title" id="settings-categoriser-heading" tabIndex={-1}>Automatic categories</h2>
          <span className="section-meta">
            {enabled
              ? "This server sends each new transaction that has a payee but no category to TypeSafe, an outside AI service, "
                + "to pick one. It sends the payee, memo, amount, date and account name, your category and group names, and "
                + "similar past transactions with their payees, memos, amounts, dates and categories. A confident pick is saved without review. Suggest categories "
                + "on the Transactions page sends the same details for the rows you select."
              : "This server does not send transactions to any outside service to pick categories."}
          </span>
        </div>
      </div>
    </section>
  );
}

function ExportSection() {
  const { planId } = usePlan();
  const [busy, setBusy] = useState<"archive" | "transactions-csv" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const download = async (kind: "archive" | "transactions-csv") => {
    setBusy(kind);
    setError(null);
    setSaved(null);
    try {
      const file = await api.exportPlan(planId, kind);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaved(file.filename);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="report-section" aria-labelledby="settings-export-heading">
      <div className="section-heading settings-heading">
        <div>
          <h2 className="section-title" id="settings-export-heading" tabIndex={-1}>Export everything</h2>
          <span className="section-meta">
            The archive holds every account, transaction, split, schedule, category and payee, the plan formats, your account
            organisation and the Rewards cards. Its ledger can be imported into an empty plan. The CSV lists every transaction for a
            spreadsheet, one row per split line. Passwords and API tokens are never included.
          </span>
          <span className="section-meta">
            Your ledger lives only in this server's own database, and Halation keeps no other copy. To delete everything,
            delete that database: on Cloudflare, the D1 database and the Worker in your account.
          </span>
        </div>
      </div>
      <div className="settings-form">
        <button type="button" className="save-button settings-form-button" disabled={busy !== null} onClick={() => void download("archive")}>
          {busy === "archive" ? "Preparing…" : "Download archive (JSON)"}
        </button>
        <button type="button" className="save-button settings-form-button" disabled={busy !== null} onClick={() => void download("transactions-csv")}>
          {busy === "transactions-csv" ? "Preparing…" : "Download transactions (CSV)"}
        </button>
      </div>
      {error && <StatusPanel error role="alert">{error}</StatusPanel>}
      {saved && <StatusPanel className="status-panel-success" role="status">Saved {saved}.</StatusPanel>}
    </section>
  );
}
