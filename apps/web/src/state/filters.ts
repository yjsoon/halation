import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Interval } from "../api/types";
import type { ReportQuery } from "../api/client";
import { monthRange, reportRange, todayIso } from "../lib/dates";
import { usePlan } from "./plan";
import { loadPrefs, savePrefs } from "./prefs";

export interface Filters {
  from?: string;
  to?: string;
  accountIds: string[];
  categoryIds: string[];
  interval: Interval;
  groupBy: "flag" | "payee" | "category" | "memo";
}

interface FilterOptions {
  /** Range shown when the URL carries no explicit dates. Defaults to the current month. */
  defaultRange?: () => { from?: string; to?: string };
  /** Report defaults and open-ended ranges stop today; explicit future dates remain valid. */
  throughToday?: boolean;
  /** Only reports share remembered account scope; other pages use the URL alone. */
  rememberAccounts?: boolean;
  /**
   * Intervals this report offers. A remembered or linked interval outside the
   * list (Year chosen on Income, then Money age opened) falls back to month, so
   * the query, the highlighted segment and the summary always agree.
   */
  intervals?: Interval[] | ((range: { from?: string; to?: string }) => Interval[]);
}

const INTERVALS: Interval[] = ["day", "week", "month", "year"];

function parseList(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

export function filtersFromSearch(
  params: URLSearchParams,
  options: {
    defaultRange: () => { from?: string; to?: string };
    throughToday?: boolean;
    rememberAccounts?: boolean;
    prefs?: ReturnType<typeof loadPrefs>;
    intervals?: FilterOptions["intervals"];
    /** Open accounts. A remembered account outside it (closed or deleted since) is dropped. */
    openAccountIds?: ReadonlySet<string>;
  },
): Filters {
  const prefs = options.prefs ?? {};
  const explicitFrom = params.get("from") ?? undefined;
  const explicitTo = params.get("to") ?? undefined;
  const requestedRange =
    explicitFrom || explicitTo
      ? { from: explicitFrom, to: explicitTo }
      : params.get("range") === "all"
        ? {}
        : options.defaultRange();
  const range = options.throughToday && !explicitTo ? reportRange(requestedRange) : requestedRange;

  const accountsParam = params.get("accounts");
  const open = options.openAccountIds;
  const remembered = (options.rememberAccounts ? prefs.accountIds ?? [] : []).filter((id) => !open || open.has(id));
  const accountIds =
    accountsParam === null ? remembered : accountsParam === "all" ? [] : parseList(accountsParam);

  const requested = (params.get("interval") ?? prefs.interval) as Interval | null;
  const supported = typeof options.intervals === "function" ? options.intervals(range) : options.intervals ?? INTERVALS;
  const interval = requested && supported.includes(requested)
    ? requested
    : supported.includes("month") ? "month" : supported[0];

  return {
    from: range.from,
    to: range.to,
    accountIds,
    categoryIds: parseList(params.get("categories")),
    interval: interval && INTERVALS.includes(interval) ? interval : "month",
    groupBy: parseGroupBy(params.get("group")),
  };
}

export function applyFilterPatch(previous: URLSearchParams, patch: Partial<Filters>, options?: { throughToday?: boolean }): URLSearchParams {
  const next = new URLSearchParams(previous);
  if ("from" in patch) {
    writeParam(next, "from", patch.from);
  }
  if ("to" in patch) {
    // An open report range is resolved against today's date when read, so a
    // bookmark or another report does not freeze this visit's cut-off.
    writeParam(next, "to", options?.throughToday && patch.to === todayIso() ? undefined : patch.to);
  }
  if ("from" in patch || "to" in patch) {
    // Both cleared means an explicit "all time", not "use the default".
    writeParam(next, "range", next.get("from") || next.get("to") ? undefined : "all");
    // Income's line scope belongs to the drilled period, not a new register range.
    if (next.get("flow") === "activity") next.delete("flow");
  }
  if ("accountIds" in patch && patch.accountIds !== undefined) {
    writeParam(next, "accounts", patch.accountIds.join(",") || "all");
  }
  if ("categoryIds" in patch && patch.categoryIds !== undefined) {
    writeParam(next, "categories", patch.categoryIds.join(",") || undefined);
    // Report flow modes have no filter control, so clearing categories also
    // clears the implicit flow restriction (including Clear filters).
    if (patch.categoryIds.length === 0) next.delete("flow");
  }
  if (patch.interval) {
    writeParam(next, "interval", patch.interval);
  }
  if ("groupBy" in patch && patch.groupBy) {
    writeParam(next, "group", patch.groupBy === "flag" ? undefined : patch.groupBy);
  }
  return next;
}

export function useFilters(options?: FilterOptions): {
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  reportQuery: ReportQuery;
} {
  const [params, setParams] = useSearchParams();
  const { planId, accounts } = usePlan();
  const defaultRange = options?.defaultRange ?? monthRange;
  const intervals = options?.intervals;
  const throughToday = options?.throughToday;
  const rememberAccounts = options?.rememberAccounts;
  const openAccountIds = useMemo(
    () => new Set(accounts.filter((account) => !account.closed).map((account) => account.id)),
    [accounts],
  );

  const filters = useMemo<Filters>(
    () => filtersFromSearch(params, { defaultRange, throughToday, rememberAccounts, prefs: loadPrefs(), intervals, openAccountIds }),
    [params, defaultRange, throughToday, rememberAccounts, intervals, openAccountIds],
  );

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      if (rememberAccounts && "accountIds" in patch && patch.accountIds !== undefined) {
        savePrefs({ accountIds: patch.accountIds });
      }
      if (patch.interval) {
        savePrefs({ interval: patch.interval });
      }
      setParams((previous) => applyFilterPatch(previous, patch, { throughToday }), { replace: true });
    },
    [setParams, rememberAccounts, throughToday],
  );

  const reportQuery = useMemo<ReportQuery>(
    () => ({
      plan_id: planId,
      from: filters.from,
      to: filters.to,
      account_ids: filters.accountIds.join(",") || undefined,
      category_ids: filters.categoryIds.join(",") || undefined,
      interval: filters.interval,
      group: filters.groupBy === "flag" ? undefined : filters.groupBy,
    }),
    [filters, planId],
  );

  return { filters, setFilters, reportQuery };
}

function writeParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}

function parseGroupBy(value: string | null): Filters["groupBy"] {
  if (value === "payee" || value === "category" || value === "memo" || value === "flag") return value;
  return "flag";
}

/** Builds a /transactions link that carries the current range plus a category drill-down. */
export function transactionsLink(filters: Filters, categoryId?: string): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (!filters.from && !filters.to) params.set("range", "all");
  params.set("accounts", filters.accountIds.join(",") || "all");
  if (categoryId) {
    params.set("categories", categoryId);
    params.set("flow", "outflow");
  } else if (filters.categoryIds.length) params.set("categories", filters.categoryIds.join(","));
  return `/transactions?${params.toString()}`;
}
