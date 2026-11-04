import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, useApi } from "../api/client";
import type { QuickEntrySplitLine, Transaction } from "../api/types";
import { CategorySelect } from "../components/CategorySelect";
import { splitCategoryGroups } from "../lib/categories";
import { formatDate, todayIso, yesterdayIso } from "../lib/dates";
import { formatMoney, parseMilliunits } from "../lib/money";
import { resolvePostingAccountId } from "../lib/register-compose";
import { usePlan } from "../state/plan";
import { StatusPanel } from "../components/StatusPanel";

type Direction = "spend" | "income" | "transfer";

type SplitLineDraft = {
  key: string;
  categoryId: string;
  amount: string;
  memo: string;
};

function newSplitLine(): SplitLineDraft {
  return { key: crypto.randomUUID(), categoryId: "", amount: "", memo: "" };
}

export function QuickEntryPage() {
  const { planId, accounts, categoryGroups, reload } = usePlan();
  const payees = useApi(planId, () => api.payees(planId));
  const [params] = useSearchParams();
  const requestedAccountId = params.get("account") ?? "";

  const openAccounts = useMemo(() => accounts.filter((account) => !account.closed), [accounts]);
  const orderedGroups = useMemo(() => splitCategoryGroups(categoryGroups), [categoryGroups]);

  const [direction, setDirection] = useState<Direction>("spend");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isSplit, setIsSplit] = useState(false);
  const [splitLines, setSplitLines] = useState<SplitLineDraft[]>([]);
  const [memo, setMemo] = useState("");
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
    if (saved) savedRef.current?.scrollIntoView({ block: "nearest" });
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
  const selectedAccountName =
    openAccounts.find((account) => account.id === selectedAccount)?.name ?? "No open account";
  const transferTargets = useMemo(
    () => openAccounts.filter((account) => account.id !== selectedAccount && account.transfer_payee_id),
    [openAccounts, selectedAccount],
  );
  const selectedTarget = transferTargets.find((account) => account.id === toAccountId) ?? transferTargets[0];

  const amountMilliunits = parseMilliunits(amount);
  const splitRemainderMilliunits = isSplit
    ? (amountMilliunits ?? 0) - splitLines.reduce((sum, line) => sum + (parseMilliunits(line.amount) ?? 0), 0)
    : 0;

  const canSave = Boolean(
    selectedAccount &&
      amountMilliunits !== null &&
      amountMilliunits > 0 &&
      !saving &&
      (isTransfer
        ? Boolean(selectedTarget)
        : Boolean(payeeName.trim()) &&
          (!isSplit ||
            (splitLines.length >= 2 &&
              splitRemainderMilliunits === 0 &&
              splitLines.every((line) => (parseMilliunits(line.amount) ?? 0) > 0)))),
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
    }
  };

  const toggleSplit = () => {
    clearStatus();
    const next = !isSplit;
    setIsSplit(next);
    if (next) {
      setSplitLines((lines) => (lines.length >= 2 ? lines : [newSplitLine(), newSplitLine()]));
      setCategoryId("");
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
      const signedAmount = (direction === "income" ? 1 : -1) * (parseMilliunits(amount) ?? 0);
      const subtransactions: QuickEntrySplitLine[] | undefined =
        !isTransfer && isSplit
          ? splitLines.map((line) => ({
              amount_milli: (direction === "income" ? 1 : -1) * (parseMilliunits(line.amount) ?? 0),
              category_id: line.categoryId || null,
              memo: line.memo.trim() || null,
            }))
          : undefined;
      const transaction = await api.quickEntry({
        client_id: clientIdRef.current,
        account_id: selectedAccount,
        date,
        amount_milli: signedAmount,
        payee_id: isTransfer ? (selectedTarget?.transfer_payee_id ?? null) : null,
        payee_name: isTransfer ? null : payeeName.trim(),
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
      setIsSplit(false);
      setSplitLines([]);
      clientIdRef.current = crypto.randomUUID();
      amountRef.current?.focus({ preventScroll: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="quick-entry">
      <header className="quick-entry-head">
        <Link to="/transactions?range=all&accounts=all" className="back-link">
          ‹ Ledger
        </Link>
        <span className="quick-entry-title">Quick entry</span>
      </header>

      <div className="quick-entry-meta">
        <div>
          <span className="figure-label">Posting account</span>
          <div className="quick-entry-meta-value">{selectedAccountName}</div>
        </div>
        <div>
          <span className="figure-label">Posting date</span>
          <div className="quick-entry-meta-value">{date}</div>
        </div>
      </div>

      {!openAccounts.length ? (
        <StatusPanel error title="No open accounts available.">
          <Link to="/accounts/new?then=add">Add an account</Link> before using quick entry.
        </StatusPanel>
      ) : (
        <form onSubmit={submit} className="quick-entry-form">
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
            <span className="field-label">Amount</span>
            <input
              type="number"
              name="amount"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(event) => {
                clearStatus();
                setAmount(event.target.value);
              }}
              className={direction === "income" ? "amount-input amount-input-income" : "amount-input amount-input-spend"}
              ref={amountRef}
              autoFocus
              required
            />
            <span className="field-note">
              {direction === "spend"
                ? "Saved as spending."
                : direction === "income"
                  ? "Saved as income."
                  : "Moves money between two accounts; both sides are recorded."}
            </span>
          </label>

          {!isTransfer && (
            <label className="field">
              <span className="field-label">Payee</span>
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
                required
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

          <label className="field">
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
            <label className="field">
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
            <label className="field">
              <span className="field-label">Category (optional)</span>
              <CategorySelect
                value={categoryId}
                onChange={(value) => {
                  clearStatus();
                  setCategoryId(value);
                }}
                groups={orderedGroups}
              />
            </label>
          )}

          {!isTransfer && (
            <div className="split-controls">
              <button type="button" className="split-toggle" onClick={toggleSplit}>
                {isSplit ? "Remove split" : "Split into multiple categories"}
              </button>
              {isSplit && (
                <span className={splitRemainderMilliunits === 0 ? "split-remainder split-remainder-ok" : "split-remainder"}>
                  {splitRemainderMilliunits === 0
                    ? "Lines match the total."
                    : `${formatMoney(splitRemainderMilliunits, { sign: true })} left to assign.`}
                </span>
              )}
            </div>
          )}

          {!isTransfer && isSplit && (
            <div className="split-lines">
              {splitLines.map((line, index) => (
                <div key={line.key} className="split-line">
                  <CategorySelect
                    aria-label={`Split line ${index + 1} category`}
                    value={line.categoryId}
                    onChange={(value) => updateSplitLine(line.key, { categoryId: value })}
                    groups={orderedGroups}
                  />
                  <input
                    type="text"
                    placeholder="Line memo"
                    aria-label={`Split line ${index + 1} memo`}
                    value={line.memo}
                    onChange={(event) => updateSplitLine(line.key, { memo: event.target.value })}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    aria-label={`Split line ${index + 1} amount`}
                    value={line.amount}
                    onChange={(event) => updateSplitLine(line.key, { amount: event.target.value })}
                  />
                  <button
                    type="button"
                    className="split-line-remove"
                    aria-label={`Remove split line ${index + 1}`}
                    onClick={() => {
                      clearStatus();
                      setSplitLines((lines) => lines.filter((candidate) => candidate.key !== line.key));
                    }}
                    disabled={splitLines.length <= 2}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="split-toggle"
                onClick={() => {
                  clearStatus();
                  setSplitLines((lines) => [...lines, newSplitLine()]);
                }}
              >
                Add line
              </button>
            </div>
          )}

          <div className="field-row field-row-compact">
            <label className="field">
              <span className="field-label">Date</span>
              <div className="date-row">
                <input
                  type="date"
                  name="date"
                  value={date}
                  onChange={(event) => {
                    clearStatus();
                    setDate(event.target.value);
                  }}
                />
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
                    Yest.
                  </button>
                </div>
              </div>
            </label>
            <label className="field">
              <span className="field-label">Memo (optional)</span>
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

          <p className="field-note">
            Entries post straight to the selected account and refresh the reports after the next load.
          </p>

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
  );
}
