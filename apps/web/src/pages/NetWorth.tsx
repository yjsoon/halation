import { api, useApi } from "../api/client";
import type { Interval } from "../api/types";
import { FilterRail } from "../components/FilterRail";
import { SteppedLine } from "../components/charts";
import { ReportTable } from "../components/ReportTable";
import { formatDate, formatPeriod, trailingMonthsRange } from "../lib/dates";
import { formatMoney } from "../lib/money";
import { useIsPhone } from "../lib/use-is-phone";
import { useFilters } from "../state/filters";
import { StatusPanel } from "../components/StatusPanel";
import { HeadlineFigure, signTone } from "../components/HeadlineFigure";

const TRAILING_YEAR = () => trailingMonthsRange(12);
const INTERVALS: Interval[] = ["week", "month"];

export function NetWorthPage() {
  const { filters, setFilters, reportQuery } = useFilters({ defaultRange: TRAILING_YEAR, intervals: INTERVALS });
  const query = { ...reportQuery, category_ids: undefined };
  const report = useApi(JSON.stringify(query), () => api.netWorth(query));
  const isPhone = useIsPhone();

  const periods = report.data?.periods ?? [];
  const latest = periods[periods.length - 1];
  const previous = periods[periods.length - 2];
  const delta = latest && previous ? latest.net_worth - previous.net_worth : null;
  const trackedAccounts = latest?.accounts.length ?? 0;

  const activeAccountIds = new Set(
    periods.flatMap((period) =>
      period.accounts.filter((account) => account.balance !== 0).map((account) => account.account_id),
    ),
  );
  const columnAccounts = (() => {
    const columns = new Map<string, { account_id: string; account_name: string }>();
    for (const period of [...periods].reverse()) {
      for (const account of period.accounts) {
        if (activeAccountIds.has(account.account_id) && !columns.has(account.account_id)) {
          columns.set(account.account_id, account);
        }
      }
    }
    return [...columns.values()];
  })();
  const balanceFor = (period: (typeof periods)[number], accountId: string) =>
    period.accounts.find((account) => account.account_id === accountId)?.balance;

  return (
    <div className="insights-page">
      <FilterRail
        filters={filters}
        setFilters={setFilters}
        intervals={INTERVALS}
        showCategories={false}
        busy={report.loading}
        collapsible={isPhone}
      />
      <div className="report-header">
        <h1>Net worth</h1>
        <div className="headline-row headline-row-paired">
          <HeadlineFigure
            label={latest ? `As at ${formatDate(latest.end_date)}` : "Current"}
            settleKey={latest?.net_worth ?? "none"}
            tone={latest?.net_worth ? signTone(latest.net_worth) : undefined}
            value={latest ? formatMoney(latest.net_worth) : "-"}
          />
          {delta !== null && (
            <HeadlineFigure label="Change on previous period" settleKey={delta} tone={delta ? signTone(delta) : undefined} value={formatMoney(delta, { sign: true })} />
          )}
          <HeadlineFigure label="Tracked accounts" settleKey={trackedAccounts} value={trackedAccounts || "-"} />
        </div>
      </div>

      {report.error && (
        <StatusPanel error title="Could not load net worth history.">
          {report.error}
        </StatusPanel>
      )}
      {report.loading && !report.data && (
        <StatusPanel title="Loading net worth history..." />
      )}

      {report.data && (
        <>
          {periods.length > 0 ? (
            <>
              <section className="report-section">
                <div className="section-heading">
                  <span className="section-title">Trend</span>
                  <span className="section-meta">{periods.length} closing {periods.length === 1 ? "snapshot" : "snapshots"}</span>
                </div>
                <SteppedLine periods={periods} />
              </section>
              <section className="report-section">
                <div className="section-heading">
                  <span className="section-title">Account balances</span>
                  <span className="section-meta">Newest periods first</span>
                </div>
                <p className="table-scroll-hint">Scroll table for all balances →</p>
                <ReportTable label="Account balance history" wide>
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        {isPhone && <><th className="num">Net worth</th><th className="num">Delta</th></>}
                        {columnAccounts.map((account) => (
                            <th key={account.account_id} className="num">
                              {account.account_name}
                            </th>
                          ))}
                        {!isPhone && <><th className="num">Net worth</th><th className="num">Delta</th></>}
                      </tr>
                    </thead>
                    <tbody>
                      {[...periods].reverse().map((period, index, reversed) => {
                        const prior = reversed[index + 1];
                        const change = prior ? period.net_worth - prior.net_worth : null;
                        const totals = <>
                          <td className="num strong">{formatMoney(period.net_worth)}</td>
                          <td className={!change ? "num muted" : change > 0 ? "num amount-positive" : "num amount-negative"}>
                            {change === null ? "-" : formatMoney(change, { sign: true })}
                          </td>
                        </>;
                        return (
                          <tr key={period.period}>
                            <td>{formatPeriod(period.period)}</td>
                            {isPhone && totals}
                            {columnAccounts.map((account) => {
                              const balance = balanceFor(period, account.account_id);
                              return (
                              <td
                                key={account.account_id}
                                className={balance != null && balance < 0 ? "num amount-negative" : "num"}
                              >
                                {balance == null ? "—" : formatMoney(balance)}
                              </td>
                              );
                            })}
                            {!isPhone && totals}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ReportTable>
              </section>
            </>
          ) : (
            <StatusPanel title="No account history in this range.">
              Widen the range or include more accounts to build a net worth series.
            </StatusPanel>
          )}
        </>
      )}
    </div>
  );
}
