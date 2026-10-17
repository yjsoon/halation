import { api, useApi } from "../api/client";
import type { Interval } from "../api/types";
import { FilterRail } from "../components/FilterRail";
import { PairedColumns } from "../components/charts";
import { formatPeriod, ytdRange } from "../lib/dates";
import { formatAmount, formatMoney, formatSavingsRate } from "../lib/money";
import { useIsPhone } from "../lib/use-is-phone";
import { useFilters } from "../state/filters";
import { StatusPanel } from "../components/StatusPanel";
import { HeadlineFigure, signTone } from "../components/HeadlineFigure";

const INTERVALS: Interval[] = ["week", "month", "year"];

export function IncomePage() {
  const { filters, setFilters, reportQuery } = useFilters({ defaultRange: ytdRange, intervals: INTERVALS });
  const report = useApi(JSON.stringify(reportQuery), () => api.incomeVsSpending(reportQuery));
  const isPhone = useIsPhone();

  const periods = report.data?.periods ?? [];
  const totals = periods.reduce(
    (sums, period) => ({
      income: sums.income + period.income,
      spending: sums.spending + period.spending,
    }),
    { income: 0, spending: 0 },
  );
  const net = totals.income - totals.spending;
  const savingsRate = formatSavingsRate(net, totals.income);

  return (
    <>
      <FilterRail
        filters={filters}
        setFilters={setFilters}
        intervals={INTERVALS}
        busy={report.loading}
        collapsible={isPhone}
      />
      <div className="report-header">
        <h1>Income v spending</h1>
        <div className="headline-row headline-row-paired">
          <HeadlineFigure label="Income" settleKey={totals.income} tone="positive" value={formatAmount(totals.income)} />
          <HeadlineFigure label="Spending" settleKey={totals.spending} tone="negative" value={formatAmount(totals.spending)} />
          <HeadlineFigure label="Net" settleKey={net} tone={signTone(net)} value={formatMoney(net, { sign: true })} />
          <HeadlineFigure
            label="Savings rate"
            settleKey={savingsRate}
            tone={savingsRate === "—" ? undefined : signTone(net)}
            value={savingsRate}
          />
        </div>
      </div>

      {report.error && (
        <StatusPanel error title="Could not load the income report.">
          {report.error}
        </StatusPanel>
      )}
      {report.loading && !report.data && (
        <StatusPanel title="Loading income versus spending…" />
      )}

      {report.data && (
        <>
          {periods.length > 0 ? (
            <>
              <section className="report-section">
                <div className="section-heading">
                  <div>
                    <span className="section-title">Trend</span>
                    <span className="section-meta">{periods.length} {periods.length === 1 ? "period" : "periods"} in view</span>
                  </div>
                  <ul className="chart-legend" aria-label="Chart key">
                    <li><span className="chart-swatch chart-swatch-income" aria-hidden="true" />Income</li>
                    <li><span className="chart-swatch chart-swatch-spending" aria-hidden="true" />Spending</li>
                  </ul>
                </div>
                <PairedColumns periods={periods} />
              </section>
              <section className="report-section">
                <div className="section-heading">
                  <span className="section-title">History</span>
                  <span className="section-meta">Newest periods first</span>
                </div>
                <div className="table-wrap">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th className="num">Income</th>
                        <th className="num">Spending</th>
                        <th className="num">Net</th>
                        <th className="num">Cumulative net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...periods].reverse().map((period) => (
                        <tr key={period.period}>
                          <td>{formatPeriod(period.period)}</td>
                          <td className="num amount-positive">{formatAmount(period.income)}</td>
                          <td className="num amount-negative">{formatAmount(period.spending)}</td>
                          <td className={period.net >= 0 ? "num amount-positive" : "num amount-negative"}>
                            {formatMoney(period.net, { sign: true })}
                          </td>
                          <td className="num muted">{formatMoney(period.cumulative_net, { sign: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <StatusPanel title="No activity in this range.">
              Try widening the date range or clearing account filters.
            </StatusPanel>
          )}
        </>
      )}
    </>
  );
}
