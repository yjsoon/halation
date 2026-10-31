import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api, useApi } from "../api/client";
import type { CreditCard, RewardsReport } from "../api/types";
import { ExposureFace } from "../components/ExposureFace";
import { FlagTag } from "../components/FlagTag";
import { isFlagColour } from "../lib/flags";
import { FilterRail } from "../components/FilterRail";
import { MultiSelect } from "../components/MultiSelect";
import { formatDate, formatDateRange } from "../lib/dates";
import { formatAmount } from "../lib/money";
import { rewardCardAccountChoices } from "../lib/reward-card-accounts";
import { exposure, stillExposure } from "../lib/reward-exposure";
import { beyondCap, boardSummary, projectRow, roundedUpToCent, rowText, type RewardRowProjection, type RowText, type Tone } from "../lib/reward-row-projection";
import { activeMonth, dayMonth, periodDays, rowSize, type MonthlyQualification, type PeriodDays } from "../lib/reward-skyline";
import { useDismiss } from "../lib/use-dismiss";
import { useIsPhone } from "../lib/use-is-phone";
import { withViewTransition } from "../lib/view-transition";
import { applyFilterPatch, useFilters } from "../state/filters";
import { usePlan } from "../state/plan";
import "./rewards-board.css";
import { StatusPanel } from "../components/StatusPanel";

const ALL_TIME = () => ({});
const GROUPS = ["flag", "payee", "category", "memo"] as const;
const GROUP_LABEL: Record<(typeof GROUPS)[number], string> = { flag: "Flag", payee: "Payee", category: "Category", memo: "Memo" };

type Row = RewardsReport["cards"][number];

/** Range-attributed rows are labelled `from:asOf` (card-period rows carry the period's own label). */
const RANGE_PERIOD = /^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/;

function dollars(value: number): string {
  return formatAmount(Math.round(value * 1000));
}

export function RewardsPage() {
  const { planId } = usePlan();
  return <RewardsBoard key={planId} planId={planId} />;
}

type BoardPreferences = {
  featured: boolean;
  showHidden: boolean;
  hidden: string[];
  hiddenUntil: Record<string, string>;
  order: "manual" | "name" | "value" | "spend";
  cardOrder: string[];
  grouped: boolean;
  /** Grid: the 3:2 faces in columns. Stacked: Skyline rows sized by urgency, opening in place; from 1000px a sunrise window beside aligned columns. */
  layout: "grid" | "stacked";
  collapsedGroups: string[];
};
const DEFAULT_BOARD: BoardPreferences = { featured: false, showHidden: false, hidden: [], hiddenUntil: {}, order: "name", cardOrder: [], grouped: true, layout: "stacked", collapsedGroups: [] };
const ORDERS: ReadonlyArray<BoardPreferences["order"]> = ["manual", "name", "value", "spend"];
const ORDER_LABEL: Record<BoardPreferences["order"], string> = { manual: "Manual", name: "Name", value: "Reward value", spend: "Spend" };

function loadBoard(planId: string): BoardPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(`howmuch:rewards:${planId}`) ?? "null");
    if (!value || typeof value !== "object") return DEFAULT_BOARD;
    return { featured: value.featured === true, showHidden: value.showHidden === true,
      hidden: Array.isArray(value.hidden) ? value.hidden.filter((id: unknown) => typeof id === "string") : [],
      hiddenUntil: value.hiddenUntil && typeof value.hiddenUntil === "object" && !Array.isArray(value.hiddenUntil)
        ? Object.fromEntries(Object.entries(value.hiddenUntil).filter((entry): entry is [string, string] =>
          typeof entry[1] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry[1]))) : {},
      order: value.order === "manual" || value.order === "value" || value.order === "spend" ? value.order : "name",
      cardOrder: Array.isArray(value.cardOrder) ? value.cardOrder.filter((id: unknown) => typeof id === "string") : [],
      grouped: value.grouped !== false,
      layout: value.layout === "grid" ? "grid" : "stacked",
      collapsedGroups: Array.isArray(value.collapsedGroups) ? value.collapsedGroups.filter((name: unknown) => name === "Cashback" || name === "Miles") : [],
    };
  } catch { return DEFAULT_BOARD; }
}

function RewardsBoard({ planId }: { planId: string }) {
  const location = useLocation();
  const { accounts } = usePlan();
  const { filters, setFilters, reportQuery } = useFilters({ defaultRange: ALL_TIME });
  // The mode is its own param: Historical range with no `from` (the All preset)
  // means all history, not card periods.
  const [params, setParams] = useSearchParams();
  const range = Boolean(filters.from) || params.get("mode") === "range";
  const setMode = (mode: "current" | "range", dates: { from?: string; to?: string }) => setParams((previous) => {
    const next = applyFilterPatch(previous, dates);
    if (mode === "range") next.set("mode", "range");
    else next.delete("mode");
    return next;
  }, { replace: true });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const query = { ...reportQuery, to: !filters.from && filters.to && filters.to > today ? today : reportQuery.to, category_ids: undefined, interval: undefined, mode: range ? "range" : undefined };
  useEffect(() => {
    if (!filters.from && filters.to && filters.to > today) setFilters({ to: today });
  }, [filters.from, filters.to, today, setFilters]);
  const [preferences, setPreferences] = useState(() => loadBoard(planId));
  const [selected, setSelected] = useState<string[]>([]);
  const [batchField, setBatchField] = useState<"featured" | "type" | "earningRate">("featured");
  const [batchValue, setBatchValue] = useState("true");
  const [batchBusy, setBatchBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const selectToggleRef = useRef<HTMLButtonElement>(null);
  const [justUpdated, setJustUpdated] = useState<string[]>([]);
  // Functional, so a patch queued behind a running board transition merges into
  // the latest preferences rather than the ones captured at its render.
  const updatePreferences = (patch: Partial<BoardPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(`howmuch:rewards:${planId}`, JSON.stringify(next)); } catch { /* Session-only when storage is unavailable. */ }
      return next;
    });
  };
  const arrange = (patch: Partial<BoardPreferences>) => withViewTransition("board", () => updatePreferences(patch));
  const [refresh, setRefresh] = useState(0);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [milesText, setMilesText] = useState<string | null>(null);
  const report = useApi(`${JSON.stringify(query)}:${refresh}`, () => api.rewards(query));
  // Stale-while-revalidate, local to this page: a day step, valuation save or
  // batch apply keeps the last good report on screen (dimmed) until the next
  // one lands, instead of unmounting the board. An error still clears it.
  const lastGood = useRef<RewardsReport | null>(null);
  if (report.data) lastGood.current = report.data;
  const shown = report.error ? null : (report.data ?? lastGood.current);
  const refreshing = report.loading && shown != null;
  const storedCards = shown?.cards ?? [];
  // Keep IDs outside the current account/featured/hidden filters so moving a
  // visible card cannot discard another card's saved position.
  const cardOrder = [...new Set([...preferences.cardOrder, ...[...storedCards]
    .sort((a, b) => a.card.name.localeCompare(b.card.name)).map((row) => row.card.id)])];
  const positions = new Map(cardOrder.map((id, index) => [id, index]));
  const isHidden = (id: string) => preferences.hidden.includes(id) || (preferences.hiddenUntil[id] ?? "") > today;
  const visibleCards = storedCards.filter((row) => (!preferences.featured || row.card.featured)
    && (preferences.showHidden || !isHidden(row.card.id)))
    .sort((a, b) => preferences.order === "manual" ? positions.get(a.card.id)! - positions.get(b.card.id)!
      : preferences.order === "value" ? b.calculation.reward_earned_dollars - a.calculation.reward_earned_dollars
      : preferences.order === "spend" ? b.calculation.total_spend - a.calculation.total_spend : a.card.name.localeCompare(b.card.name));
  const groups = preferences.grouped ? [
    { name: "Cashback", rows: visibleCards.filter((row) => row.card.type === "cashback") },
    { name: "Miles", rows: visibleCards.filter((row) => row.card.type === "miles") },
  ] : [{ name: "Cards", rows: visibleCards }];
  const emptyImported = shown && storedCards.length === 0 && filters.accountIds.length === 0;
  const emptyForAccounts = shown && storedCards.length === 0 && filters.accountIds.length > 0;
  // Add card offers only open spending accounts; with none, it is a dead end.
  const hasCardAccount = rewardCardAccountChoices(accounts, []).length > 0;
  const addCardHref = { pathname: "/rewards/new", search: location.search };
  const milesValue = milesText ?? (shown ? String(shown.miles_valuation) : "");
  const hiddenCount = storedCards.filter((row) => isHidden(row.card.id)).length;
  const featuredCount = storedCards.filter((row) => row.card.featured).length;
  const projections = new Map(storedCards.map((row) => [row.card.id, projectRow(row, shown?.as_of, range, today)]));
  const summary = shown ? boardSummary(shown, [...projections.values()]) : null;
  const scopeLabel = filters.accountIds.length === 0 ? "All accounts"
    : filters.accountIds.length === 1 ? (accounts.find((account) => account.id === filters.accountIds[0])?.name ?? "1 account")
    : `${filters.accountIds.length} accounts`;
  const moveCard = (id: string, neighborId: string) => {
    const next = [...cardOrder];
    const index = next.indexOf(id);
    const neighbor = next.indexOf(neighborId);
    [next[index], next[neighbor]] = [next[neighbor]!, next[index]!];
    updatePreferences({ cardOrder: next });
  };
  const toggleHidden = (id: string) => {
    if (!isHidden(id)) {
      updatePreferences({ hidden: [...preferences.hidden, id] });
      return;
    }
    const hiddenUntil = { ...preferences.hiddenUntil };
    delete hiddenUntil[id];
    updatePreferences({ hidden: preferences.hidden.filter((entry) => entry !== id), hiddenUntil });
  };

  const saveMilesValuation = async () => {
    const trimmed = milesText?.trim() ?? "";
    if (!trimmed || !shown) return;
    const milesValuation = Number(trimmed);
    if (!Number.isFinite(milesValuation) || milesValuation < 0) {
      setSettingsError("Miles valuation must be a nonnegative number.");
      return;
    }
    if (milesValuation === shown.miles_valuation) return;
    setSettingsError(null);
    try {
      await api.updateRewardSettings(planId, { milesValuation });
      setMilesText(String(milesValuation));
      setRefresh((value) => value + 1);
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const applyBatch = async () => {
    const patch: Partial<CreditCard> = batchField === "featured" ? { featured: batchValue === "true" }
      : batchField === "type" ? { type: batchValue === "miles" ? "miles" : "cashback" } : { earningRate: Number(batchValue) };
    if (batchField === "earningRate" && (!batchValue.trim() || !Number.isFinite(patch.earningRate) || patch.earningRate! < 0)) {
      setSettingsError("Batch rate must be a nonnegative number."); return;
    }
    setBatchBusy(true); setSettingsError(null);
    const remaining = [...selected];
    try {
      for (const id of selected) {
        await api.updateRewardCard(planId, id, patch);
        remaining.splice(remaining.indexOf(id), 1);
      }
    } catch (cause) {
      const updated = selected.length - remaining.length;
      setSettingsError(`${updated} ${updated === 1 ? "card" : "cards"} updated. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setSelected(remaining); setBatchBusy(false); setRefresh((value) => value + 1);
      setJustUpdated(selected.filter((id) => !remaining.includes(id)));
    }
  };
  useEffect(() => {
    if (!justUpdated.length) return;
    const timer = window.setTimeout(() => setJustUpdated([]), 900);
    return () => window.clearTimeout(timer);
  }, [justUpdated]);
  const requestedAsOf = query.to ?? report.data?.as_of ?? today;
  const asOf = requestedAsOf > today ? today : requestedAsOf;
  const shiftAsOf = (days: number) => {
    const date = new Date(`${asOf}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    const next = date.toISOString().slice(0, 10);
    if (next <= today) setFilters({ from: undefined, to: next });
  };
  const selectVisible = () => setSelected(groups
    .filter((group) => !preferences.grouped || !preferences.collapsedGroups.includes(group.name))
    .flatMap((group) => group.rows.map((row) => row.card.id)));

  return (
    <div className="rw-page" data-selecting={selecting || undefined}>
      <header className="rw-hero">
        <div className="rw-hero-text">
          <h1>Rewards</h1>
          <p className="rw-hero-scope">{range ? formatDateRange(filters.from, filters.to) : `Card periods as of ${formatDate(asOf)}`} · {scopeLabel}</p>
          {storedCards.length > 0 && (
            <p className="rw-hero-status">Showing {visibleCards.length} of {storedCards.length} cards · totals include hidden and non-featured cards</p>
          )}
          {summary && summary.statusCounts.length > 0 && <p className="rw-hero-summary">{summary.statusCounts.join(" · ")}</p>}
        </div>
        <div className="rw-hero-figures">
          <Figure primary label="Value earned" value={dollars(shown?.totals.reward_dollars ?? 0)} />
          <Figure label="Qualifying spend" value={dollars(shown?.totals.spend ?? 0)} />
          {(shown?.totals.miles ?? 0) > 0 && <Figure label="Miles" value={Math.round(shown!.totals.miles).toLocaleString("en-GB")} />}
          {(shown?.totals.cashback ?? 0) > 0 && <Figure label="Cashback" value={dollars(shown!.totals.cashback)} />}
        </div>
        {shown && (
          <label className="rw-valuation">Miles valued at
            <input
              type="text"
              inputMode="decimal"
              value={milesValue}
              aria-label="Miles valuation"
              aria-describedby="rw-valuation-note"
              onChange={(event) => setMilesText(event.target.value)}
              onBlur={() => void saveMilesValuation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setMilesText(null);
              }}
            />
            each
            <span id="rw-valuation-note" className="sr-only">Currency units assigned to each mile.</span>
          </label>
        )}
        <Link to={addCardHref} className="add-button rw-add">Add card</Link>
      </header>

      <section className="rw-toolbar" aria-label="Rewards board controls">
        <div className="segmented" role="group" aria-label="Period mode">
          <button type="button" aria-pressed={!range} className={!range ? "segment segment-active" : "segment"}
            onClick={() => setMode("current", { from: undefined, to: undefined })}>Card periods</button>
          <button type="button" aria-pressed={range} className={range ? "segment segment-active" : "segment"}
            onClick={() => setMode("range", { from: `${asOf.slice(0, 7)}-01`, to: asOf })}>Historical range</button>
        </div>
        {!range && <>
          <div className="rw-stepper" role="group" aria-label="As of date" data-past={asOf < today || undefined}>
            <button type="button" className="rw-step" aria-label="Previous day" onClick={() => shiftAsOf(-1)}>‹</button>
            <label className="rw-date">
              <span className="sr-only">As of</span>
              <span className="rw-date-face" aria-hidden="true">{formatDate(asOf)}</span>
              <input type="date" value={asOf} max={today}
                onClick={(event) => { try { event.currentTarget.showPicker?.(); } catch { /* Typing still works. */ } }}
                onChange={(event) => event.target.value && setFilters({ from: undefined, to: event.target.value > today ? today : event.target.value })} />
            </label>
            <button type="button" className="rw-step" aria-label="Next day" disabled={asOf >= today} onClick={() => shiftAsOf(1)}>›</button>
          </div>
          <button type="button" className="rw-tool-button" disabled={asOf >= today} onClick={() => setFilters({ from: undefined, to: undefined })}>Today</button>
          <MultiSelect label="Accounts" options={accounts.map((account) => ({ id: account.id, label: account.name }))}
            selected={filters.accountIds} onChange={(accountIds) => setFilters({ accountIds })} />
        </>}
        <div className="segmented" role="group" aria-label="Cards">
          <button type="button" aria-pressed={!preferences.featured} className={!preferences.featured ? "segment segment-active" : "segment"}
            onClick={() => arrange({ featured: false })}>All cards <span className="rw-count">{storedCards.length}</span></button>
          <button type="button" aria-pressed={preferences.featured} className={preferences.featured ? "segment segment-active" : "segment"}
            onClick={() => arrange({ featured: true })}>Featured <span className="rw-count">{featuredCount}</span></button>
        </div>
        <div className="rw-toolbar-end">
          <ArrangeMenu preferences={preferences} hiddenCount={hiddenCount} onChange={arrange} />
          <button type="button" ref={selectToggleRef} className="rw-tool-button" aria-pressed={selecting}
            onClick={() => { if (selecting) setSelected([]); setSelecting(!selecting); }}>{selecting ? "Done" : "Select"}</button>
        </div>
      </section>
      <p className="field-note rw-mode-note">{range ? "Rewards attributed to the selected dates; qualification shows the latest card period." : "Each card uses its own billing or reward period. Today uses the server’s Singapore date."} Capped cards stay visible until you hide them.</p>
      {range &&
      <FilterRail
        filters={filters}
        setFilters={setFilters}
        showCategories={false}
        groups={[...GROUPS]}
        busy={report.loading}
      />
      }

      {report.error && (
        <StatusPanel error role="alert" title="Could not load rewards.">
          {report.error}
        </StatusPanel>
      )}

      {settingsError && (
        <StatusPanel error role="alert" title="Could not update rewards settings.">
          {settingsError}
        </StatusPanel>
      )}

      {report.loading && !shown && (
        <StatusPanel title="Loading rewards…" />
      )}

      {emptyImported && !hasCardAccount && (
        <StatusPanel title="Add an account first">
          Reward cards score spending on an open spending account. <Link to="/accounts/new">Create an account</Link>,
            or import a Rewards Tracker export from <Link to="/import/rewards">Settings → Rewards import</Link>.
        </StatusPanel>
      )}

      {emptyImported && hasCardAccount && (
        <StatusPanel title="No reward cards in this range.">
          Import a Rewards Tracker export from <Link to="/import/rewards">Settings → Rewards import</Link>,
            or choose <Link to={addCardHref}>Add card</Link> to score one of your Halation cards.
        </StatusPanel>
      )}

      {emptyForAccounts && (
        <div className="status-panel rw-empty" role="status">
          <p className="status-title">None of the selected accounts has a reward card.</p>
          <button type="button" className="rw-tool-button" onClick={() => setFilters({ accountIds: [] })}>Show all accounts</button>
        </div>
      )}

      {storedCards.length > 0 && (
        <div className="rw-board" data-refreshing={refreshing || undefined} aria-busy={refreshing}>
          {!visibleCards.length && (
            <div className="status-panel rw-empty" role="status">
              {preferences.featured && featuredCount === 0 ? <>
                <p className="status-title">No featured cards.</p>
                <button type="button" className="rw-tool-button" onClick={() => arrange({ featured: false })}>Show all cards</button>
              </> : <>
                <p className="status-title">All cards are hidden.</p>
                <p className="status-detail">Hidden cards still count in the totals above.</p>
                <button type="button" className="rw-tool-button" onClick={() => arrange({ showHidden: true })}>Show hidden cards</button>
              </>}
            </div>
          )}
          {groups.filter((group) => group.rows.length > 0).map((group) => {
            const collapsed = preferences.grouped && preferences.collapsedGroups.includes(group.name);
            return (
              <section key={group.name} className="rw-group" aria-label={group.name}>
                <h2 className="rw-group-head">{preferences.grouped
                  ? <button type="button" className="rw-group-toggle" aria-expanded={!collapsed} aria-controls={`rewards-group-${group.name}`}
                      onClick={() => arrange({ collapsedGroups: collapsed
                        ? preferences.collapsedGroups.filter((name) => name !== group.name) : [...preferences.collapsedGroups, group.name] })}>
                      <span className="rw-group-name">{group.name}</span>
                      <span className="rw-group-count">{group.rows.length}</span>
                      <span className="rw-group-sum">{groupSubtotal(group.rows)}</span>
                      <span className="rw-chevron" aria-hidden="true">▾</span>
                    </button>
                  : <span className="rw-group-name">{group.name}</span>}</h2>
                <div id={`rewards-group-${group.name}`} className="rw-grid" data-layout={preferences.layout} hidden={collapsed}>
                  {group.rows.map((row, index) => (
                    <RewardCard
                      key={row.card.id}
                      row={row}
                      projection={projections.get(row.card.id)!}
                      memoryKey={`${planId}|${row.card.id}`}
                      index={index}
                      search={location.search}
                      asOf={shown?.as_of}
                      today={today}
                      selecting={selecting}
                      selected={selected.includes(row.card.id)}
                      busy={batchBusy}
                      justUpdated={justUpdated.includes(row.card.id)}
                      onSelect={(on) => setSelected(on ? [...selected, row.card.id] : selected.filter((id) => id !== row.card.id))}
                      hidden={isHidden(row.card.id)}
                      permanentlyHidden={preferences.hidden.includes(row.card.id)}
                      hiddenUntil={preferences.hiddenUntil[row.card.id]}
                      expiry={nextCardPeriodDate(row)}
                      stacked={preferences.layout === "stacked"}
                      manual={preferences.order === "manual"}
                      first={index === 0}
                      last={index === group.rows.length - 1}
                      onMove={(direction) => withViewTransition("board", () => moveCard(row.card.id, group.rows[index + direction]!.card.id))}
                      onToggleHidden={() => withViewTransition("board", () => toggleHidden(row.card.id))}
                      onHideUntil={(date) => arrange({ hiddenUntil: { ...preferences.hiddenUntil, [row.card.id]: date } })}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {hiddenCount > 0 && !preferences.showHidden && visibleCards.length > 0 &&
            <button type="button" className="rw-hidden-footer" onClick={() => arrange({ showHidden: true })}>{hiddenCount} hidden · Show</button>}
          {(selecting || selected.length > 0) && (
            <div className="rw-bulk" role="region" aria-label="Batch card edits">
              <span className="rw-bulk-count" aria-live="polite">{selected.length} selected</span>
              <button type="button" disabled={batchBusy} onClick={selectVisible}>Select visible</button>
              <button type="button" disabled={batchBusy} onClick={() => setSelected([])}>Clear selection</button>
              <span className="rw-bulk-rule" aria-hidden="true" />
              <span className="rw-bulk-verb" aria-hidden="true">Set</span>
              <select aria-label="Batch field" value={batchField} disabled={batchBusy} onChange={(event) => {
                const field = event.target.value as typeof batchField; setBatchField(field); setBatchValue(field === "featured" ? "true" : field === "type" ? "cashback" : "");
              }}><option value="featured">Featured status</option><option value="type">Reward type</option><option value="earningRate">Base earning rate</option></select>
              <span className="rw-bulk-verb" aria-hidden="true">to</span>
              {batchField === "earningRate" ? <input aria-label="Batch value" inputMode="decimal" value={batchValue} onChange={(event) => setBatchValue(event.target.value)} />
                : <select aria-label="Batch value" value={batchValue} onChange={(event) => setBatchValue(event.target.value)}>
                  {batchField === "featured" ? <><option value="true">Featured</option><option value="false">Not featured</option></> : <><option value="cashback">Cashback</option><option value="miles">Miles</option></>}
                </select>}
              <button type="button" className="rw-bulk-apply" disabled={!selected.length || batchBusy} onClick={() => void applyBatch()}>{batchBusy ? "Applying…" : "Apply to selected"}</button>
              <button type="button" onClick={() => {
                // The bar goes with selection mode; hand focus to the toolbar's
                // Select button rather than letting it fall to <body>.
                selectToggleRef.current?.focus();
                setSelected([]);
                setSelecting(false);
              }}>Done</button>
            </div>
          )}
        </div>
      )}

      {shown && (storedCards.length > 0 || shown.groups.length > 0) && (
        <section className="report-section rw-breakdown" aria-labelledby="rewards-groups-heading">
          <div className="section-heading">
            <div>
              <span className="section-title" id="rewards-groups-heading">By {GROUP_LABEL[filters.groupBy].toLowerCase()}</span>
              <span className="section-meta">{shown.groups.length} {shown.groups.length === 1 ? "group" : "groups"}</span>
            </div>
            {!range && (
              <div className="segmented" role="group" aria-label="Report grouping">
                {GROUPS.map((group) => (
                  <button key={group} type="button" aria-pressed={filters.groupBy === group}
                    className={filters.groupBy === group ? "segment segment-active" : "segment"}
                    onClick={() => setFilters({ groupBy: group })}>{GROUP_LABEL[group]}</button>
                ))}
              </div>
            )}
          </div>
          <table className="ledger-table report-table">
            <thead>
              <tr>
                <th>Group</th>
                <th className="num">Spend</th>
                <th className="num">Reward</th>
                <th className="num">Txns</th>
              </tr>
            </thead>
            <tbody>
              {shown.groups.map((row) => (
                <tr key={row.key}>
                  <td>
                    <span className="rewards-group-label">
                      <FlagTag colour={row.flag_color} name={row.label} />
                      {row.flag_color ? null : row.label}
                    </span>
                  </td>
                  <td className="num">{dollars(row.spend)}</td>
                  <td className="num">{dollars(row.reward_dollars)}</td>
                  <td className="num">{row.transaction_count}</td>
                </tr>
              ))}
              {shown.groups.length === 0 && (
                <tr><td colSpan={4} className="rw-breakdown-empty">No qualifying transactions</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function nextCardPeriodDate(row: RewardsReport["cards"][number]): string | undefined {
  const end = row.calculation.periods?.reduce((latest, period) => period.end > latest ? period.end : latest, "");
  if (!end) return undefined;
  const date = new Date(`${end}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function Figure({ label, value, primary = false }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className={primary ? "rw-figure rw-figure-primary" : "rw-figure"}>
      <span className="rw-figure-label">{label}</span>
      <span key={value} className="rw-figure-value figure-settle" data-zero={/[1-9]/.test(value) ? undefined : true}>{value}</span>
    </div>
  );
}

function groupSubtotal(rows: readonly Row[]): string {
  const value = rows.reduce((sum, row) => sum + row.calculation.reward_earned_dollars, 0);
  const miles = rows.reduce((sum, row) => row.calculation.reward_type === "miles" ? sum + row.calculation.reward_earned : sum, 0);
  return miles > 0 ? `${formatReward(miles, "miles")} · ${dollars(value)}` : dollars(value);
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function tierLabel(tiers: Row["card"]["spendingTiers"], id: string, type: "cashback" | "miles"): string {
  const sorted = [...(tiers ?? [])].sort((a, b) => a.spendThreshold - b.spendThreshold);
  const index = sorted.findIndex((tier) => tier.id === id);
  const tier = sorted[index];
  if (!tier) return id;
  const rate = tier.earningRate != null ? ` · ${tier.earningRate}${type === "cashback" ? "%" : " miles/unit"}` : "";
  return `Tier ${index + 1} · from ${dollars(tier.spendThreshold)}${rate}`;
}

type RewardCardProps = {
  row: Row;
  projection: RewardRowProjection;
  /** Plan and card: the session memory that keeps a card's rise from replaying. */
  memoryKey: string;
  index: number;
  search: string;
  asOf?: string;
  today: string;
  selecting: boolean;
  selected: boolean;
  busy: boolean;
  justUpdated: boolean;
  onSelect: (on: boolean) => void;
  hidden: boolean;
  permanentlyHidden: boolean;
  hiddenUntil?: string;
  expiry?: string;
  stacked: boolean;
  manual: boolean;
  first: boolean;
  last: boolean;
  onMove: (direction: -1 | 1) => void;
  onToggleHidden: () => void;
  onHideUntil: (date: string) => void;
};

function RewardCard(p: RewardCardProps) {
  const { row, index, selecting, selected } = p;
  const [open, setOpen] = useState(false);
  // View-transition names must be idents; ids can start with a digit. Used only while html[data-vt="board"].
  const vt = `rw-${row.card.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const until = !p.permanentlyHidden && (p.hiddenUntil ?? "") > p.today ? p.hiddenUntil : undefined;
  const picture = exposure(p.projection);
  const controls = selecting
    ? <label className="rw-card-select">
        <input type="checkbox" disabled={p.busy} checked={selected} onChange={(event) => p.onSelect(event.target.checked)} />
        <span className="sr-only">Select {row.card.name}</span>
      </label>
    : <div className="rw-card-actions">
        {p.manual && <div role="group" aria-label={`Order ${row.card.name}`} className="rw-order">
          <button type="button" className="rw-icon-button" aria-label={`Move ${row.card.name} up`} disabled={p.first} onClick={() => p.onMove(-1)}>‹</button>
          <button type="button" className="rw-icon-button" aria-label={`Move ${row.card.name} down`} disabled={p.last} onClick={() => p.onMove(1)}>›</button>
        </div>}
        <CardMenu row={row} search={p.search} hidden={p.hidden} expiry={p.expiry} today={p.today}
          onToggleHidden={p.onToggleHidden} onHideUntil={p.onHideUntil} />
      </div>;
  return (
    <article className="rw-card" data-type={row.card.type} data-tone={p.projection.tone} data-stage={picture?.stage ?? "range"}
      data-size={p.stacked ? rowSize(picture?.stage) : undefined} data-open={(p.stacked && open) || undefined}
      data-mono={picture?.stage === "failed" || undefined} data-selected={selected || undefined}
      data-hidden={p.hidden || undefined} data-just-updated={p.justUpdated || undefined}
      style={{ "--rw-h": picture?.pose.h ?? 1, "--rw-v": picture?.pose.v ?? 0, "--i": Math.min(index, 12), "--vt-name": vt } as CSSProperties}>
      {p.stacked
        ? <SkylineRow row={row} search={p.search} asOf={p.asOf} hiddenUntil={until} projection={p.projection} index={index} memoryKey={p.memoryKey}
            open={open} onToggle={() => setOpen(!open)} range={p.projection.action.kind === "range"} actions={controls} />
        : <>
            <RewardTile row={row} search={p.search} asOf={p.asOf} hiddenUntil={until} projection={p.projection} index={index} memoryKey={p.memoryKey} />
            {controls}
          </>}
    </article>
  );
}

function CardMenu({ row, search, hidden, expiry, today, onToggleHidden, onHideUntil }: {
  row: Row;
  search: string;
  hidden: boolean;
  expiry?: string;
  today: string;
  onToggleHidden: () => void;
  onHideUntil: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismiss(open, () => setOpen(false), root, trigger);
  const returns = expiry && expiry > today ? expiry : undefined;
  return (
    <div className="rw-menu" ref={root}>
      <button ref={trigger} type="button" className="rw-icon-button" aria-label={`Actions for ${row.card.name}`}
        aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <ul className="rw-menu-list" id={`${id}-list`}>
          <li><Link to={{ pathname: `/rewards/${row.card.id}`, search }}>Edit card</Link></li>
          <li><Link to={`/transactions?accounts=${encodeURIComponent(row.account_id)}&range=all`}>View transactions</Link></li>
          <li>
            <button type="button" aria-describedby={`${id}-device`} onClick={() => { setOpen(false); trigger.current?.focus(); onToggleHidden(); }}>{hidden ? "Unhide" : "Hide"}</button>
            <span className="rw-menu-note" id={`${id}-device`}>On this device</span>
          </li>
          {!hidden && (
            <li>
              <button type="button" aria-label={`Hide ${row.card.name} until next period`} aria-describedby={`${id}-returns`}
                disabled={!expiry || expiry <= today}
                title={expiry && expiry > today ? `Returns ${expiry} (Singapore)` : "No upcoming period boundary in this report"}
                onClick={() => { if (!expiry) return; setOpen(false); trigger.current?.focus(); onHideUntil(expiry); }}>Hide until next period</button>
              <span className="rw-menu-note" id={`${id}-returns`}>{returns ? `Returns ${formatDate(returns)}` : "No upcoming period boundary in this report"}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function ArrangeMenu({ preferences, hiddenCount, onChange }: {
  preferences: BoardPreferences;
  hiddenCount: number;
  onChange: (patch: Partial<BoardPreferences>) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismiss(open, () => setOpen(false), root, trigger);
  return (
    <div className="rw-popover-wrap" ref={root}>
      <button ref={trigger} type="button" className="rw-tool-button rw-arrange" aria-expanded={open}
        aria-controls={open ? `${id}-arrange` : undefined} onClick={() => setOpen(!open)}>
        Arrange · {ORDER_LABEL[preferences.order]}
        {preferences.showHidden && <><span className="rw-dot" aria-hidden="true" /><span className="sr-only">, showing hidden cards</span></>}
        <span className="caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="rw-popover" id={`${id}-arrange`}>
          <fieldset className="rw-fieldset">
            <legend>Order</legend>
            {ORDERS.map((order) => (
              <label key={order} className="rw-option">
                <input type="radio" name={`${id}-order`} value={order} checked={preferences.order === order} onChange={() => onChange({ order })} />
                {ORDER_LABEL[order]}
              </label>
            ))}
          </fieldset>
          <div className="rw-popover-rule" aria-hidden="true" />
          <fieldset className="rw-fieldset rw-layout-choice">
            <legend>Layout</legend>
            {(["stacked", "grid"] as const).map((layout) => (
              <label key={layout} className="rw-option">
                <input type="radio" name={`${id}-layout`} value={layout} checked={preferences.layout === layout} onChange={() => onChange({ layout })} />
                {layout === "stacked" ? "Stacked" : "Grid"}
              </label>
            ))}
          </fieldset>
          <div className="rw-popover-rule" aria-hidden="true" />
          <label className="rw-option">
            <input type="checkbox" checked={preferences.grouped} onChange={(event) => onChange({ grouped: event.target.checked })} /> Group by type
          </label>
          <label className="rw-option">
            <input type="checkbox" checked={preferences.showHidden} onChange={(event) => onChange({ showHidden: event.target.checked })} /> Show hidden ({hiddenCount})
          </label>
          <div className="rw-popover-rule" aria-hidden="true" />
          <Link className="rw-popover-link" to="/import/rewards">Import or export…</Link>
        </div>
      )}
    </div>
  );
}

function ExposureMeter({ primary, tone, label, figure, value, ariaLabel }: {
  primary: boolean;
  tone: Tone;
  label: string;
  figure: string;
  value: number;
  ariaLabel: string;
}) {
  const fill = clampUnit(value);
  const percent = Math.round(fill * 100);
  return (
    <div className={primary ? "rw-meter rw-meter-primary" : "rw-meter"} data-tone={tone} style={{ "--rw-m": fill } as CSSProperties}>
      <div className="rw-meter-legend"><span>{label}</span><span>{figure}</span></div>
      <div className="rw-meter-track" role="progressbar" aria-label={ariaLabel} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={percent} aria-valuetext={`${figure}, ${percent} per cent`}>
        <span className="rw-meter-fill" />
        {primary && <span className="rw-meter-bead" />}
      </div>
    </div>
  );
}

function Statement({ text }: { text: RowText }) {
  return (
    <>
      <p className="rw-headline">
        {text.amount != null && <b className="rw-amount">{text.amount}</b>}
        <span className="rw-action">{text.actionLabel}</span>
        {text.deadline && <span className="rw-deadline" data-urgent={text.isUrgent || undefined}>{text.deadline}</span>}
      </p>
      <p className="rw-basis">{text.basisLine}</p>
    </>
  );
}

function Exceptions({ lines }: { lines: readonly string[] }) {
  if (!lines.length) return null;
  return <ul className="rw-exceptions">{lines.map((line) => <li key={line}>{line}</li>)}</ul>;
}

function FlagList({ calc }: { calc: Row["calculation"] }) {
  if (!calc.flags.length) return null;
  return (
    <ul className="rw-flags">
      {calc.flags.map((flag) => {
        const cap = flag.maximumSpend ?? 0;
        const counted = flag.countedSpend ?? flag.totalSpend;
        const use = cap > 0 ? clampUnit(counted / cap) : 0;
        return (
          <li key={flag.subcategoryId} className="rw-flag" data-warn={use >= 0.9 || undefined} style={{ "--use": use } as CSSProperties}>
            {isFlagColour(flag.flagColor)
              ? <FlagTag colour={flag.flagColor} name={flag.name} />
              : <span>{flag.name}</span>}
            <span>{flag.rewardRate != null ? `${flag.rewardRate}${calc.reward_type === "cashback" ? "%" : " miles/unit"}` : ""}</span>
            <span className="num">{formatReward(flag.rewardEarned, calc.reward_type)}</span>
            {cap > 0 && <span className="rw-flag-cap">{dollars(counted)} / {dollars(cap)} cap</span>}
          </li>
        );
      })}
    </ul>
  );
}

// Signature stays compatible with lib/rewards-tile.test.ts: ({ row, search, asOf }) still works.
export function RewardTile({ row, search, asOf, hiddenUntil, projection, range, index = 0, memoryKey }: {
  row: Row;
  search: string;
  asOf?: string;
  hiddenUntil?: string;
  projection?: RewardRowProjection;
  range?: boolean;
  index?: number;
  memoryKey?: string;
}) {
  const calc = row.calculation;
  const id = useId();
  const phone = useIsPhone();
  const p = projection ?? projectRow(row, asOf, range ?? RANGE_PERIOD.test(calc.period));
  const text = rowText(p);
  const picture = exposure(p) ?? stillExposure(p.rewardType === "miles");
  const caps = [row.card.issuer, row.card.type === "miles" ? "Miles" : "Cashback", !phone && row.card.featured ? "Featured" : null]
    .filter(Boolean).join(" · ");
  const badge = hiddenUntil && (
    <span className={phone ? "rw-badge rw-badge-pin" : "rw-badge"} title={`Hidden until ${hiddenUntil} (Singapore)`}>
      Back {formatDate(hiddenUntil)}<span className="sr-only"> Hidden until {hiddenUntil} (Singapore)</span>
    </span>
  );
  return (
    <>
      <Link to={{ pathname: `/rewards/${row.card.id}`, search }} className="rw-tile" aria-labelledby={`${id}-name`} aria-describedby={`${id}-value`}>
        <ExposureFace exposure={picture} variant={phone ? "strip" : "face"} index={index} memoryKey={memoryKey}>
          {phone ? (
            <>
              <h3 className="rw-face-name" id={`${id}-name`} data-rw="name">{row.card.name}</h3>
              {badge}
              <div className="rw-strip-foot" data-rw="foot"><Statement text={text} /><Exceptions lines={text.exceptionLines} /></div>
            </>
          ) : (
            <>
              <p className="rw-face-top"><span>{caps}</span>{badge}</p>
              <h3 className="rw-face-name" id={`${id}-name`}>{row.card.name}</h3>
              <p className="rw-face-foot">
                <span className="rw-face-account">{row.account_name}</span>
                <span className="rw-face-earned">{formatReward(calc.reward_earned, calc.reward_type)}</span>
              </p>
            </>
          )}
        </ExposureFace>
        <span id={`${id}-value`} className="sr-only">{text.accessibilityValue}</span>
        {!phone && (
          <div className="rw-slip">
            <Statement text={text} />
            <Exceptions lines={text.exceptionLines} />
            <FlagList calc={calc} />
          </div>
        )}
      </Link>
      <details className="rw-more">
        <summary>Targets, periods and tiers</summary>
        <DisclosureBody row={row} projection={p} asOf={asOf} flags={phone} />
      </details>
    </>
  );
}

/** The meters, totals, periods, qualifications and tier: the grid's "Targets, periods and tiers", and the open Skyline slip's "More". */
function DisclosureBody({ row, projection: p, asOf, flags }: { row: Row; projection: RewardRowProjection; asOf?: string; flags: boolean }) {
  const calc = row.calculation;
  // Historical amounts are range-attributed, while qualification belongs to the
  // cutoff period. An earlier promotion may sort after that calendar period.
  const fullPeriod = calc.periods?.filter((period) => asOf && period.start <= asOf && period.end >= asOf).at(-1)?.calculation;
  const min = calc.minimum_spend;
  const max = calc.maximum_spend ?? 0;
  const minimumLeads = p.action.kind === "minimum" || p.action.kind === "monthlyMinimum";
  const capDone = p.action.kind === "capReached" && p.action.terminal;
  return (
    <>
      {min != null && min > 0 && (
        <ExposureMeter
          primary={minimumLeads || max <= 0}
          tone={calc.minimum_spend_met ? "earning" : "needs"}
          label={fullPeriod ? (calc.minimum_spend_met ? "Full-period minimum met" : "Full-period minimum") : (calc.minimum_spend_met ? "Minimum met" : "Minimum spend")}
          figure={`${dollars(fullPeriod?.total_spend ?? calc.total_spend)} / ${dollars(min)}`}
          value={(calc.minimum_spend_progress ?? 0) / 100}
          ariaLabel="Minimum spend progress"
        />
      )}
      {max > 0 && (
        <ExposureMeter
          primary={!minimumLeads}
          tone={capDone ? "complete" : "earning"}
          label={calc.maximum_spend_exceeded ? "Cap reached" : "Bonus cap"}
          figure={`${dollars(Math.min(calc.counted_spend, max))} / ${dollars(max)}`}
          value={calc.counted_spend / max}
          ariaLabel="Bonus cap used"
        />
      )}
      {calc.has_next_spending_tier && calc.next_spending_tier_threshold != null && <p className="rw-line">Next tier at {dollars(calc.next_spending_tier_threshold)}</p>}
      {calc.should_stop_using && <p className="rw-line rw-line-strong">Consider another card</p>}
      <dl className="rw-stats">
        <div>
          <dt>Spend</dt>
          <dd>{dollars(calc.total_spend)}</dd>
        </div>
        <div>
          <dt>Eligible</dt>
          <dd>{dollars(calc.eligible_spend)}</dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd>{dollars(calc.reward_earned_dollars)}</dd>
        </div>
      </dl>
      {flags && <FlagList calc={calc} />}
      <p>Period: {calc.periods?.map((period) => `${formatDate(period.start)} – ${formatDate(period.end)}`).join("; ") || calc.period}</p>
      {calc.qualification_status && <p>Monthly qualification: {calc.qualification_status.replaceAll("_", " ")}</p>}
      {calc.monthly_qualifications?.length ? (
        <ol className="rw-months">
          {calc.monthly_qualifications.map((month) => (
            <li key={month.start} data-status={month.status}>
              {formatDate(month.start)} – {formatDate(month.end)}: {dollars(month.spend)} / {dollars(month.minimumSpend)} · {month.status}
            </li>
          ))}
        </ol>
      ) : null}
      {calc.active_spending_tier_id != null && <p>Active tier: {tierLabel(row.card.spendingTiers, calc.active_spending_tier_id, calc.reward_type)}</p>}
    </>
  );
}

const WIDE_QUERY = "(min-width: 1000px)";
function subscribeWide(onChange: () => void): () => void {
  const query = window.matchMedia?.(WIDE_QUERY);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}
/** From 1000px a stacked row is a sunrise window beside aligned columns; narrower it is the Skyline strip. */
function useIsWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia?.(WIDE_QUERY).matches ?? false, () => false);
}

function earnedWords(calc: Row["calculation"]): string {
  return calc.reward_type === "miles" ? `${Math.round(calc.reward_earned).toLocaleString("en-GB")} miles` : dollars(calc.reward_earned);
}

/** The period as a rail of days: filled to today, a tick per day, a mark on the day the minimum was met. */
function DayRail({ period }: { period: PeriodDays }) {
  const rail = useRef<HTMLDivElement>(null);
  const [cover, setCover] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });
  // The today label hides the nearer end's date when they would touch (measured: visibility keeps the boxes).
  useLayoutEffect(() => {
    const node = rail.current;
    if (!node) return;
    const measure = () => {
      const box = (selector: string) => node.querySelector(selector)?.getBoundingClientRect();
      const now = box(".rw-rail-now"), start = box(".rw-rail-start"), end = box(".rw-rail-end");
      if (!now || !start || !end) return;
      const next = { start: now.left < start.right + 8, end: now.right > end.left - 8 };
      setCover((previous) => (previous.start === next.start && previous.end === next.end ? previous : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [period.day, period.total]);
  const at = (day: number) => (period.total <= 1 ? 1 : (day - 1) / (period.total - 1));
  const today = at(period.day);
  const met = period.metDay != null ? at(period.metDay) : null;
  const edge = (share: number) => (share < 0.16 ? "start" : share > 0.84 ? "end" : undefined);
  return (
    <div className="rw-rail" ref={rail} data-cover-start={cover.start || undefined} data-cover-end={cover.end || undefined}
      style={{ "--today": today, "--met": met ?? 0, "--days": Math.max(1, period.total - 1) } as CSSProperties}>
      {met != null && period.metOn && <span className="rw-rail-met-label" data-edge={edge(met)}>min met · {dayMonth(period.metOn)}</span>}
      <span className="rw-rail-line" aria-hidden="true">
        {period.total <= 62 && <span className="rw-rail-ticks" />}
        <span className="rw-rail-fill" />
        {met != null && <span className="rw-rail-met" />}
        <span className="rw-rail-today" />
      </span>
      <span className="rw-rail-labels">
        <span className="rw-rail-start">{dayMonth(period.start)}</span>
        <span className="rw-rail-now" data-edge={edge(today)}>today · {period.day}</span>
        <span className="rw-rail-end">{dayMonth(period.end)}</span>
      </span>
    </div>
  );
}

/** The figures as columns that sit at the same x on every row of a wide stacked board. */
function LedgerColumns({ calc, period, month, range, asOf }: {
  calc: Row["calculation"];
  period: PeriodDays | null;
  month: MonthlyQualification | null;
  range: boolean;
  asOf?: string;
}) {
  const min = calc.minimum_spend ?? 0;
  const monthly = month?.minimumSpend ?? calc.monthly_minimum_spend ?? 0;
  const cap = calc.maximum_spend ?? 0;
  const ended = Boolean(asOf && calc.periods?.length && calc.periods.every((entry) => entry.end < asOf));
  return (
    <dl className="rw-columns">
      <div><dt>Spent</dt><dd>{dollars(calc.total_spend)}</dd></div>
      <div><dt>Minimum</dt><dd data-none={(min <= 0 && monthly <= 0) || undefined}>{min > 0 ? dollars(min)
        : monthly > 0 ? <>{dollars(monthly)}<small>/mo</small></> : "none"}</dd></div>
      <div><dt>Bonus cap</dt><dd data-none={cap <= 0 || undefined}>{cap > 0 ? dollars(cap) : "none"}</dd></div>
      <div><dt>Earned</dt><dd>{calc.reward_type === "miles"
        ? <>{Math.round(calc.reward_earned).toLocaleString("en-GB")} <small>mi</small></> : dollars(calc.reward_earned)}</dd></div>
      <div className="rw-col-period">
        <dt>Period</dt>
        {period
          ? <dd>{period.day} <small>of {period.total} days</small>
              <span className="rw-mini-rail" aria-hidden="true" style={{ "--today": period.total <= 1 ? 1 : (period.day - 1) / (period.total - 1) } as CSSProperties} /></dd>
          : <dd data-none>{range ? "range" : ended ? "ended" : "none"}</dd>}
      </div>
    </dl>
  );
}

/** The minimum, monthly minimum, next tier and cap of one card period's own calculation. */
function Targets({ calc, metOn, month }: { calc: Row["calculation"]; metOn: string | null; month: MonthlyQualification | null }) {
  const min = calc.minimum_spend ?? 0;
  const cap = calc.maximum_spend ?? 0;
  const spend = calc.total_spend;
  const categoryCaps = calc.flags.some((flag) => (flag.maximumSpend ?? 0) > 0);
  const items: Array<{ key: string; state: "met" | "open" | "pending" | "none"; label: string; amount?: string; note: ReactNode; urgent?: boolean }> = [];
  if (min > 0) {
    items.push(calc.minimum_spend_met
      ? { key: "min", state: "met", label: "Minimum", amount: dollars(min), note: metOn ? `met ${dayMonth(metOn)}` : "met" }
      // Spend can reach the minimum while a monthly qualification (or an unmet tier) still holds it back.
      : spend >= min
        ? { key: "min", state: "pending", label: "Minimum", amount: dollars(min), note: calc.qualification_status === "failed"
            ? "reached, a month was missed" : calc.qualification_status === "pending" ? "reached, needs this month's minimum" : "reached" }
        : { key: "min", state: "open", label: "Minimum", amount: dollars(min), note: `${dollars(roundedUpToCent(min - spend))} to go`, urgent: true });
  }
  if (month) {
    const met = month.spend >= month.minimumSpend;
    items.push({ key: "month", state: met ? "met" : "open", label: "This month", amount: dollars(month.minimumSpend),
      note: met ? "met" : `${dollars(roundedUpToCent(month.minimumSpend - month.spend))} to go`, urgent: !met });
  }
  const threshold = calc.next_spending_tier_threshold;
  if (calc.has_next_spending_tier && threshold != null && threshold > spend) {
    items.push({ key: "tier", state: "open", label: "Next tier", amount: dollars(threshold), note: `${dollars(roundedUpToCent(threshold - spend))} to go` });
  }
  if (cap > 0) {
    const beyond = beyondCap(spend, cap);
    items.push(calc.maximum_spend_exceeded
      ? { key: "cap", state: "met", label: "Cap", amount: dollars(cap), note: beyond > 0 ? `reached, ${dollars(beyond)} beyond` : "reached" }
      : { key: "cap", state: "open", label: "Cap", amount: dollars(cap), note: `${dollars(Math.max(0, cap - calc.counted_spend))} left` });
  } else {
    items.push({ key: "cap", state: "none", label: "Cap", note: categoryCaps ? "none on the card, categories cap" : "none, keeps earning" });
  }
  return (
    <>
      <ul className="rw-targets">
        {items.map((item) => (
          <li key={item.key} data-state={item.state}>
            <span className="rw-target-mark" aria-hidden="true" />
            <span className="rw-target-label">{item.label}</span>
            {item.amount && <span className="rw-target-amount">{item.amount}</span>}
            <span className="rw-target-note" data-urgent={item.urgent || undefined}>{item.note}</span>
          </li>
        ))}
      </ul>
      {calc.should_stop_using && <p className="rw-line rw-line-strong">Consider another card</p>}
    </>
  );
}

function Categories({ calc }: { calc: Row["calculation"] }) {
  const scale = Math.max(0, ...calc.flags.map((flag) => Math.max(flag.totalSpend, flag.maximumSpend ?? 0)));
  const share = (value: number) => (scale > 0 ? clampUnit(value / scale) : 0);
  const rate = (value?: number) => (value == null ? "" : calc.reward_type === "cashback" ? `${value}%` : `${value} mi/$`);
  return (
    <ul className="rw-cats">
      {calc.flags.map((flag) => {
        const cap = flag.maximumSpend ?? 0;
        const spend = flag.totalSpend;
        const beyond = beyondCap(spend, cap);
        const over = beyond > 0;
        const earned = formatReward(flag.rewardEarned, calc.reward_type);
        const note = cap <= 0 ? `no cap · ${earned} earned`
          : over ? <>{dollars(cap)} cap · <b>{dollars(beyond)}</b> beyond cap · {earned} earned</>
          : `${dollars(Math.min(flag.countedSpend ?? spend, cap))} of ${dollars(cap)} cap · ${earned} earned`;
        return (
          <li key={flag.subcategoryId} className="rw-cat" data-over={over || undefined}
            style={{ "--fill": share(cap > 0 ? Math.min(spend, cap) : spend), "--over": over ? share(beyond) : 0, "--cap": cap > 0 ? share(cap) : 0 } as CSSProperties}>
            <span className="rw-cat-name">
              {isFlagColour(flag.flagColor) && <span className="rw-cat-dot" style={{ background: `var(--flag-${flag.flagColor})` }} aria-hidden="true" />}
              {flag.name}
            </span>
            <span className="rw-cat-figs">
              <span className="rw-cat-spend">{dollars(spend)}</span>
              <span className="rw-cat-bar" aria-hidden="true"><span className="rw-cat-fill" />{over && <span className="rw-cat-over" />}{cap > 0 && <span className="rw-cat-tick" />}</span>
              <span className="rw-cat-rate">{rate(flag.rewardRate)}</span>
            </span>
            <span className="rw-cat-note">{note}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A stacked board row: a strip sized by urgency (gate tall, climb standard, noon slim), or from 1000px a
 *  sunrise window beside aligned columns. Its toggle opens the slip in place, under the row, in the same card. */
export function SkylineRow({ row, search, asOf, hiddenUntil, projection: p, index, memoryKey, open, onToggle, range, actions }: {
  row: Row;
  search: string;
  asOf?: string;
  hiddenUntil?: string;
  projection: RewardRowProjection;
  index: number;
  memoryKey: string;
  open: boolean;
  onToggle: () => void;
  /** A Historical range row: its spend and earnings are summed over the range, its targets belong to the cutoff period. */
  range: boolean;
  /** The card's actions, placed between the row and the slip so Tab reaches them before the slip. */
  actions: ReactNode;
}) {
  const calc = row.calculation;
  const id = useId();
  const wide = useIsWide();
  const text = rowText(p);
  const ex = exposure(p);
  const picture = ex ?? stillExposure(p.rewardType === "miles");
  const size = rowSize(ex?.stage);
  const pace = size === "gate" ? text.pacePerDay : null;
  const period = range ? null : periodDays(calc, asOf);
  // Targets and categories read one card period's own calculation: in a range, the cutoff period's (as
  // DisclosureBody's fullPeriod), never the range sums against that period's minimum and caps.
  const cutoff = range ? calc.periods?.filter((entry) => asOf && entry.start <= asOf && asOf <= entry.end).at(-1) : undefined;
  const own = range ? cutoff?.calculation : calc;
  const month = own ? activeMonth(own, asOf) : null;
  const metOn = range ? (own?.minimum_spend_met ? own.minimum_met_on ?? null : null) : period?.metOn ?? null;
  const [rangeFrom, rangeTo] = range && RANGE_PERIOD.test(calc.period) ? calc.period.split(":") : [undefined, undefined];
  const ownMeta = (target: Row["calculation"]) =>
    `${dollars(target.total_spend)} spent · ${formatReward(target.reward_earned, target.reward_type)} earned`;
  const beyond = p.action.kind === "capReached" ? p.action.beyond : 0;
  const tail = size !== "noon" ? null : p.action.kind === "range" ? `${dollars(calc.total_spend)} spent` : `${earnedWords(calc)} earned`;
  const badge = hiddenUntil && (
    <span className="rw-badge rw-badge-pin" title={`Hidden until ${hiddenUntil} (Singapore)`}>
      Back {formatDate(hiddenUntil)}<span className="sr-only"> Hidden until {hiddenUntil} (Singapore)</span>
    </span>
  );
  const headline = (
    <div className="rw-headline">
      <span className="rw-lead">
        {text.amount != null && <b className="rw-amount">{text.amount}</b>}
        <span className="rw-action">{text.actionLabel}</span>
        {!wide && tail && <span className="rw-tail"> · {tail}</span>}
        {wide && beyond > 0 && <span className="rw-beyond">{dollars(beyond)} beyond cap</span>}
      </span>
      {wide && <Exceptions lines={text.exceptionLines} />}
      {text.deadline && <span className="rw-deadline" data-urgent={text.isUrgent || undefined}>{text.deadline}</span>}
    </div>
  );
  const paceLine = pace && <p className="rw-pace">about <b>{pace}</b> a day to make it</p>;
  return (
    <>
      <div className="rw-row">
        <Link to={{ pathname: `/rewards/${row.card.id}`, search }} className="rw-tile" aria-labelledby={`${id}-name`} aria-describedby={`${id}-value`}>
          <ExposureFace exposure={picture} variant="strip" index={index} memoryKey={memoryKey}>
            <h3 className="rw-face-name" id={`${id}-name`} data-rw="name">{row.card.name}</h3>
            {badge}
            {wide
              ? <p className="rw-window-foot" data-rw="foot"><span>{row.account_name}</span></p>
              : <div className="rw-strip-foot" data-rw="foot">
                  {headline}
                  {paceLine}
                  {size !== "noon" && <p className="rw-basis">{text.basisLine}</p>}
                  <Exceptions lines={text.exceptionLines} />
                </div>}
          </ExposureFace>
          {wide && (
            <div className="rw-ledger">
              {headline}
              {paceLine}
              <LedgerColumns calc={calc} period={period} month={month} range={range} asOf={asOf} />
            </div>
          )}
          <span id={`${id}-value`} className="sr-only">{text.accessibilityValue}</span>
        </Link>
        <button type="button" className="rw-open-toggle" aria-expanded={open} aria-controls={`${id}-open`}
          aria-label={`Details for ${row.card.name}`} onClick={onToggle}>
          <span className="rw-open-chevron" aria-hidden="true" />
        </button>
      </div>
      {actions}
      <div className="rw-open" id={`${id}-open`} role="region" aria-label={`${row.card.name} details`} data-open={open || undefined} inert={!open}>
        <div className="rw-open-body"><div className="rw-open-grid">
          <section className="rw-open-period" aria-labelledby={`${id}-period`}>
            <h4 id={`${id}-period`}>Period</h4>
            {period ? <>
              <p className="rw-open-dates"><span>{dayMonth(period.start)} to {dayMonth(period.end)}</span><span className="rw-open-day">day {period.day} of {period.total}</span></p>
              <DayRail period={period} />
            </> : range ? <>
              <p className="rw-open-dates"><span>{rangeFrom && rangeTo ? `${dayMonth(rangeFrom)} to ${dayMonth(rangeTo)}` : calc.period}</span><span className="rw-open-day">historical range</span></p>
              {cutoff && <p className="rw-open-meta">Latest card period {dayMonth(cutoff.start)} to {dayMonth(cutoff.end)}</p>}
            </> : <p className="rw-open-dates">{calc.periods?.map((entry) => `${formatDate(entry.start)} to ${formatDate(entry.end)}`).join("; ") || calc.period}</p>}
          </section>
          <Link className="rw-open-link" to={`/transactions?accounts=${encodeURIComponent(row.account_id)}&range=all`}>
            View transactions<span className="rw-open-link-chevron" aria-hidden="true" />
          </Link>
          <section className="rw-open-targets" aria-labelledby={`${id}-targets`}>
            <h4 id={`${id}-targets`}>Targets</h4>
            {range && cutoff && <p className="rw-open-meta">For the latest card period, {dayMonth(cutoff.start)} to {dayMonth(cutoff.end)}</p>}
            {own ? <Targets calc={own} metOn={metOn} month={month} /> : <p className="rw-open-meta">No card period holds {asOf ? dayMonth(asOf) : "this day"}</p>}
          </section>
          <section className="rw-open-cats" aria-labelledby={`${id}-cats`}>
            <h4 id={`${id}-cats`}>Categories</h4>
            {!own ? <p className="rw-open-meta">Range · {ownMeta(calc)}</p>
              : own.flags.length
              ? <>
                  <p className="rw-open-meta">{own.flags.length} {range ? "in the latest card period" : "this period"} · {ownMeta(own)}</p>
                  <Categories calc={own} />
                </>
              : <p className="rw-open-meta">No category rates on this card · {ownMeta(own)}{range ? " in the latest card period" : ""}</p>}
          </section>
          <details className="rw-open-more">
            <summary>Totals, qualifications and tiers</summary>
            <DisclosureBody row={row} projection={p} asOf={asOf} flags={false} />
          </details>
        </div></div>
      </div>
    </>
  );
}

function formatReward(amount: number, type: "cashback" | "miles" | undefined): string {
  if (type === "miles") return `${Math.round(amount).toLocaleString("en-GB")} mi`;
  return dollars(amount);
}
