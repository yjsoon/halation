import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, useApi } from "../api/client";
import type { QuickEntrySplitLine, Transaction } from "../api/types";
import { CategorySelect } from "../components/CategorySelect";
import { DirectionToggle } from "../components/DirectionToggle";
import { splitCategoryGroups } from "../lib/categories";
import { formatDate, todayIso, yesterdayIso } from "../lib/dates";
import { amountPlaceholder, amountStep, currentCurrencyFormat, formatMoney, parseMilliunits } from "../lib/money";
import { resolvePostingAccountId, type QuickEntryCopy } from "../lib/register-compose";
import { usePlan } from "../state/plan";
import { usePayeeDefaults } from "../state/use-payee-defaults";
import { StatusPanel } from "../components/StatusPanel";

type Direction = "spend" | "income" | "transfer";

type SplitLineDraft = {
  key: string;
  categoryId: string;
  amount: string;
  direction: "spend" | "income";
  payeeName: string;
  memo: string;
};

function newSplitLine(direction: Direction): SplitLineDraft {
  return { key: crypto.randomUUID(), categoryId: "", amount: "", direction: direction === "income" ? "income" : "spend", payeeName: "", memo: "" };
}

export function QuickEntryPage() {
  const { planId, accounts, categoryGroups, reload } = usePlan();
  const payees = useApi(planId, () => api.payees(planId));
  const [params] = useSearchParams();
  const requestedAccountId = params.get("account") ?? "";
  // Duplicate for today on a phone arrives with its copy in router state.
  const location = useLocation();
  const navigate = useNavigate();
  const [copy] = useState(() => (location.state as { copy?: QuickEntryCopy } | null)?.copy);
  useEffect(() => {
    if (copy) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, []);

  const openAccounts = useMemo(() => accounts.filter((account) => !account.closed), [accounts]);
  const orderedGroups = useMemo(() => splitCategoryGroups(categoryGroups), [categoryGroups]);

  const [direction, setDirection] = useState<Direction>(copy?.direction ?? "spend");
  const [amount, setAmount] = useState(copy?.amount ?? "");
  const [accountId, setAccountId] = useState(copy?.accountId ?? "");
  const [toAccountId, setToAccountId] = useState(copy?.toAccountId ?? "");
  const [payeeName, setPayeeName] = useState(copy?.payeeName ?? "");
  const [categoryId, setCategoryId] = useState(copy?.categoryId ?? "");
  const [isSplit, setIsSplit] = useState(false);
  const [splitLines, setSplitLines] = useState<SplitLineDraft[]>([]);
  const [memo, setMemo] = useState(copy?.memo ?? "");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  // Generated per entry attempt so retries of a failed submit stay idempotent.
  const clientIdRef = useRef(crypto.randomUUID());
  const amountRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef<HTMLDivElement>(null);
  // The amount takes focus again for the next entry; keep the confirmation,
  // which sits just above it, on screen rather than scrolled away.
  useEffect(() => {
    if (saved) {
      amountRef.current?.focus({ preventScroll: true });
      savedRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [saved]);

  useEffect(() => {
    document.title = "Quick entry · Halation";
  }, []);

  const isTransfer = direction === "transfer";
  const selectedAccount = resolvePostingAccountId(
    openAccounts.map((account) => account.id),
    requestedAccountId,
    accountId,
  );
  const transferTargets = useMemo(
    () => openAccounts.filter((account) => account.id !== selectedAccount && account.transfer_payee_id),
    [openAccounts, selectedAccount],
  );
  const selectedTarget = transferTargets.find((account) => account.id === toAccountId) ?? transferTargets[0];

  // The payee's usual category fills the field until the user sets or
  // clears it themselves.
  const categoryChosenRef = useRef(Boolean(copy));
  usePayeeDefaults(planId, payees.data ?? [], isTransfer ? "" : payeeName, selectedAccount, (defaults) => {
    if (!categoryChosenRef.current) setCategoryId(defaults.category_id ?? "");
  });

  const amountMilliunits = parseMilliunits(amount);
  const entrySign = direction === "income" ? 1 : -1;
  const splitTotal = splitLines.reduce((sum, line) => sum + (parseMilliunits(line.amount) ?? 0) * (line.direction === "income" ? 1 : -1), 0);
  const splitRemainderMilliunits = (amountMilliunits ?? 0) - splitTotal * entrySign;
  const validSplit = splitLines.length >= 2 && splitLines.every((line) => (parseMilliunits(line.amount) ?? 0) > 0)
    && splitRemainderMilliunits === 0;

  const canSave = Boolean(
    selectedAccount &&
      date &&
      !saving &&
      amount.trim() !== "" && amountMilliunits !== null &&
      (isSplit ? amountMilliunits >= 0 && validSplit : amountMilliunits > 0) &&
      (!isTransfer || Boolean(selectedTarget)),
  );

  const clearStatus = () => {
    setError(null);
    setSaved(null);
  };

  const switchDirection = (next: Direction) => {
    clearStatus();
    setDirection(next);
    if (next === "transfer") {
      setIsSplit(false);
    } else if (direction !== "transfer" && next !== direction) {
      // Spend to Income turns the whole entry round, so each line turns with it
      // and a line that ran against the entry still runs against it.
      setSplitLines((lines) => lines.map((line) => ({ ...line, direction: line.direction === "income" ? "spend" : "income" })));
    }
  };

  const toggleSplit = () => {
    clearStatus();
    const next = !isSplit;
    setIsSplit(next);
    if (next) {
      setSplitLines([newSplitLine(direction), newSplitLine(direction)]);
      setCategoryId("");
    } else {
      setSplitLines([]);
    }
  };

  const updateSplitLine = (key: string, patch: Partial<SplitLineDraft>) => {
    clearStatus();
    setSplitLines((lines) => lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const signedAmount = entrySign * (amountMilliunits ?? 0);
      const subtransactions: QuickEntrySplitLine[] | undefined =
        !isTransfer && isSplit
          ? splitLines.map((line) => ({
              amount_milli: parseMilliunits(line.amount)! * (line.direction === "income" ? 1 : -1),
              category_id: line.categoryId || null,
              payee_name: line.payeeName.trim() || null,
              memo: line.memo.trim() || null,
            }))
          : undefined;
      const transaction = await api.quickEntry({
        client_id: clientIdRef.current,
        account_id: selectedAccount,
        date,
        amount_milli: signedAmount,
        payee_id: isTransfer ? (selectedTarget?.transfer_payee_id ?? null) : null,
        payee_name: isTransfer ? null : payeeName.trim() || null,
        category_id: isTransfer || isSplit ? null : categoryId || null,
        memo: memo.trim() || null,
        flag_color: null,
        subtransactions,
      });
      setSaved(
        isTransfer
          ? `Transfer to ${selectedTarget?.name ?? "account"} saved.`
          : `${transaction.payee_name ?? "Entry"} saved.`,
      );
      setRecent((entries) => [transaction, ...entries].slice(0, 5));
      // Account balances live in the plan; without this the ledger shows the old ones.
      reload();
      setAmount("");
      setPayeeName("");
      setMemo("");
      setCategoryId("");
      categoryChosenRef.current = false;
      setIsSplit(false);
      setSplitLines([]);
      clientIdRef.current = crypto.randomUUID();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="quick-entry">
      <header className="quick-entry-head">
        <span className="quick-entry-brand">Halation</span>
        <Link to="/transactions?range=all&accounts=all" className="back-link">
          ‹ Ledger
        </Link>
      </header>

      <div className="quick-entry-intro">
        <h1 className="quick-entry-title">Quick entry</h1>
        <p>Clarity for a longer view.</p>
      </div>
      <div className="signin-landscape quick-entry-landscape" aria-hidden="true" />

      <div className="quick-entry-workspace">
      {!openAccounts.length ? (
        <StatusPanel error title="No open accounts available.">
          <Link to="/accounts/new?then=add">Add an account</Link> before using quick entry.
        </StatusPanel>
      ) : (
        <form onSubmit={submit} className={isSplit ? "quick-entry-form quick-entry-form-split" : "quick-entry-form"}>
          {/* Above the amount, which takes focus again after a save: on a phone
              the keyboard would hide a confirmation placed by the button. */}
          {saved && !error && (
            <div ref={savedRef}>
              <StatusPanel className="status-panel-success compact-panel" title="Saved." role="status">
                {saved}
              </StatusPanel>
            </div>
          )}
          <div className="segmented direction-toggle" role="group" aria-label="Direction">
            <button
              type="button"
              aria-pressed={direction === "spend"}
              className={direction === "spend" ? "segment segment-active" : "segment"}
              onClick={() => switchDirection("spend")}
            >
              Spend
            </button>
            <button
              type="button"
              aria-pressed={direction === "income"}
              className={direction === "income" ? "segment segment-active" : "segment"}
              onClick={() => switchDirection("income")}
            >
              Income
            </button>
            <button
              type="button"
              aria-pressed={direction === "transfer"}
              className={direction === "transfer" ? "segment segment-active" : "segment"}
              onClick={() => switchDirection("transfer")}
            >
              Transfer
            </button>
          </div>

          <label className="field amount-field">
            <span className="field-label">Amount <span className="quick-entry-currency">{currentCurrencyFormat()?.iso_code}</span></span>
            <input
              type="number"
              name="amount"
              inputMode="decimal"
              step={amountStep()}
              min="0"
              placeholder={amountPlaceholder()}
              value={amount}
              onChange={(event) => {
                clearStatus();
                setAmount(event.target.value);
              }}
              className={`amount-input amount-input-${direction}`}
              ref={amountRef}
              autoFocus
              required
            />
            {isTransfer && <span className="field-note">Both sides of the transfer are recorded.</span>}
          </label>

          {!isTransfer && (
            <label className="field">
              <span className="field-label">Payee <small>optional</small></span>
              <input
                type="text"
                name="payee"
                list="payee-options"
                value={payeeName}
                onChange={(event) => {
                  clearStatus();
                  setPayeeName(event.target.value);
                }}
                placeholder="Merchant"
                maxLength={200}
                autoComplete="off"
              />
              <datalist id="payee-options">
                {(payees.data ?? [])
                  .filter((payee) => !payee.deleted && !payee.transfer_account_id)
                  .map((payee) => (
                    <option key={payee.id} value={payee.name} />
                  ))}
              </datalist>
            </label>
          )}

          <label className="field quick-entry-detail">
            <span className="field-label">{isTransfer ? "From account" : "Account"}</span>
            <select
              name="account"
              value={selectedAccount}
              onChange={(event) => {
                clearStatus();
                setAccountId(event.target.value);
              }}
            >
              {openAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          {isTransfer && (
            <label className="field quick-entry-detail">
              <span className="field-label">To account</span>
              {transferTargets.length ? (
                <select
                  name="to-account"
                  value={selectedTarget?.id ?? ""}
                  onChange={(event) => {
                    clearStatus();
                    setToAccountId(event.target.value);
                  }}
                >
                  {transferTargets.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="field-note">No other open account to transfer to.</span>
              )}
            </label>
          )}

          {!isTransfer && !isSplit && (
            <label className="field quick-entry-detail">
              <span className="field-label">Category <small>optional</small></span>
              <CategorySelect
                value={categoryId}
                onChange={(value) => {
                  clearStatus();
                  categoryChosenRef.current = true;
                  setCategoryId(value);
                }}
                groups={orderedGroups}
              />
            </label>
          )}

          {!isTransfer && (
            <div className="split-controls">
              {isSplit && <span className="field-label">Split categories</span>}
              <button type="button" className="split-toggle" onClick={toggleSplit}>
                {isSplit ? "Use one category" : "+ Split categories"}
              </button>
            </div>
          )}

          {!isTransfer && isSplit && (
            <div className="split-lines">
              {splitLines.map((line, index) => (
                <div key={line.key} className={splitLines.length > 2 ? "split-line split-line-removable" : "split-line"} role="group" aria-label={`Allocation ${index + 1}`}>
                  <label className="split-line-category">
                    <span>Category</span>
                    <CategorySelect
                      aria-label={`Split line ${index + 1} category`}
                      value={line.categoryId}
                      onChange={(value) => updateSplitLine(line.key, { categoryId: value })}
                      groups={orderedGroups}
                    />
                  </label>
                  <label className="split-line-amount">
                    <span>Amount</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={amountStep()}
                      step={amountStep()}
                      required
                      placeholder={amountPlaceholder()}
                      aria-label={`Split line ${index + 1} amount`}
                      value={line.amount}
                      onChange={(event) => updateSplitLine(line.key, { amount: event.target.value })}
                    />
                  </label>
                  <DirectionToggle
                    className="split-line-direction"
                    label={`Split line ${index + 1} direction`}
                    value={line.direction}
                    onChange={(direction) => updateSplitLine(line.key, { direction })}
                  />
                  <details className="split-line-memo">
                    <summary>Payee / memo</summary>
                    <label className="field">
                      <span className="field-label">Payee <small>optional</small></span>
                      <input
                        type="text"
                        list="payee-options"
                        placeholder="Merchant"
                        aria-label={`Split line ${index + 1} payee`}
                        value={line.payeeName}
                        maxLength={200}
                        autoComplete="off"
                        onChange={(event) => updateSplitLine(line.key, { payeeName: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Memo <small>optional</small></span>
                      <input
                        type="text"
                        placeholder="Note"
                        aria-label={`Split line ${index + 1} memo`}
                        value={line.memo}
                        onChange={(event) => updateSplitLine(line.key, { memo: event.target.value })}
                      />
                    </label>
                  </details>
                  {splitLines.length > 2 && <button
                    type="button"
                    className="split-line-remove"
                    aria-label={`Remove split line ${index + 1}`}
                    title="Remove line"
                    onClick={() => {
                      clearStatus();
                      setSplitLines((lines) => lines.filter((candidate) => candidate.key !== line.key));
                    }}
                  >
                    Remove line
                  </button>}
                </div>
              ))}
              <button
                type="button"
                className="split-toggle"
                onClick={() => {
                  clearStatus();
                  setSplitLines((lines) => [...lines, newSplitLine(direction)]);
                }}
              >
                + Add line
              </button>
              <p role="status" className={validSplit ? "split-remainder split-remainder-ok" : "split-remainder"}>
                {validSplit
                  ? "✓ Lines match the total."
                  : splitRemainderMilliunits !== 0 ? `${formatMoney(splitRemainderMilliunits, { sign: true })} left to assign.` : null}
              </p>
            </div>
          )}

          <div className="field-row field-row-compact">
            <label className="field quick-entry-detail quick-entry-date">
              <span className="field-label">Date</span>
              <div className="date-row">
                <input
                  type="date"
                  name="date"
                  value={date}
                  required
                  onChange={(event) => {
                    clearStatus();
                    setDate(event.target.value);
                  }}
                />
                {!date && <span className="field-note" role="alert">Choose a date.</span>}
                <div className="segmented date-presets" role="group" aria-label="Date shortcuts">
                  <button
                    type="button"
                    aria-pressed={date === todayIso()}
                    className={date === todayIso() ? "segment segment-active" : "segment"}
                    onClick={() => {
                      clearStatus();
                      setDate(todayIso());
                    }}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    aria-pressed={date === yesterdayIso()}
                    className={date === yesterdayIso() ? "segment segment-active" : "segment"}
                    onClick={() => {
                      clearStatus();
                      setDate(yesterdayIso());
                    }}
                  >
                    Yesterday
                  </button>
                </div>
              </div>
            </label>
            <label className="field quick-entry-detail quick-entry-memo">
              <span className="field-label">Memo <small>optional</small></span>
              <input
                type="text"
                name="memo"
                value={memo}
                onChange={(event) => {
                  clearStatus();
                  setMemo(event.target.value);
                }}
                placeholder="Note"
                maxLength={500}
              />
            </label>
          </div>

          {error && (
            <StatusPanel error className="compact-panel" title="Could not save this entry.">
              {error}
            </StatusPanel>
          )}
          <button type="submit" className="save-button" disabled={!canSave}>
            {saving
              ? "Saving..."
              : direction === "spend"
                ? "Save spend"
                : direction === "income"
                  ? "Save income"
                  : "Save transfer"}
          </button>
          <p className="quick-entry-save-note">Saves directly to your ledger.</p>
        </form>
      )}

      {recent.length > 0 && (
        <section className="recent-entries" aria-label="Saved this session">
          <h2 className="recent-heading">Saved this session</h2>
          <ul>
            {recent.map((entry) => (
              <li key={entry.id}>
                <span className="recent-payee">{entry.payee_name ?? "Entry"}</span>
                <span className="recent-meta">{formatDate(entry.date)}</span>
                <span className={entry.amount < 0 ? "recent-amount amount-negative" : "recent-amount amount-positive"}>
                  {formatMoney(entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </main>
  );
}
