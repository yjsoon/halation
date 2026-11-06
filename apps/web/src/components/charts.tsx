import { useCallback, useState, type CSSProperties } from "react";
import { formatAmount, formatMoney, withPlanDecimal } from "../lib/money";
import { formatPeriod } from "../lib/dates";

const WIDTH = 960;
const HEIGHT = 240;
const PAD = { top: 12, right: 8, bottom: 24, left: 64 };

// Keep chart coordinates in CSS pixels so labels, dots and strokes do not shrink on narrow screens.
function useChartWidth() {
  const [width, setWidth] = useState(WIDTH);
  const ref = useCallback((svg: SVGSVGElement | null) => {
    if (!svg) return;
    const measure = () => setWidth(svg.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function niceTicks(min: number, max: number): number[] {
  if (min === max) {
    return [min];
  }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / 3)));
  const rounded = [1, 2, 5, 10].map((m) => m * step).find((s) => span / s <= 4) ?? step;
  const ticks: number[] = [];
  for (let tick = Math.ceil(min / rounded) * rounded; tick <= max; tick += rounded) {
    ticks.push(tick);
  }
  return ticks;
}

function shortMoney(milliunits: number, step: number): string {
  const value = milliunits / 1000;
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return withPlanDecimal(`${sign}${(abs / 1_000_000).toFixed(Math.max(1, Math.ceil(-Math.log10(step / 1_000_000_000))))}m`);
  if (abs >= 1_000) return withPlanDecimal(`${sign}${(abs / 1_000).toFixed(Math.max(abs >= 10_000 ? 0 : 1, Math.ceil(-Math.log10(step / 1_000_000))))}k`);
  return withPlanDecimal(`${sign}${abs.toFixed(Math.max(0, Math.ceil(-Math.log10(step / 1000))))}`);
}

interface Frame {
  x: (index: number, count: number) => number;
  y: (value: number) => number;
  ticks: number[];
  innerWidth: number;
  width: number;
}

function buildFrame(min: number, max: number, width: number, includeZero = true): Frame {
  const lo = includeZero ? Math.min(min, 0) : min;
  const hi = includeZero ? Math.max(max, 0) : max;
  const span = hi - lo || 1;
  const innerWidth = width - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  return {
    x: (index, count) => PAD.left + (innerWidth * (index + 0.5)) / Math.max(count, 1),
    y: (value) => PAD.top + innerHeight * (1 - (value - lo) / span),
    ticks: niceTicks(lo, hi),
    innerWidth,
    width,
  };
}

function Gridlines({ frame }: { frame: Frame }) {
  const step = frame.ticks.length > 1 ? frame.ticks[1] - frame.ticks[0] : Infinity;
  return (
    <g className="chart-grid">
      {frame.ticks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={frame.width - PAD.right} y1={frame.y(tick)} y2={frame.y(tick)} />
          <text x={PAD.left - 8} y={frame.y(tick)} dy="0.32em" textAnchor="end">
            {shortMoney(tick, step)}
          </text>
        </g>
      ))}
    </g>
  );
}

function XLabels({ labels, frame }: { labels: string[]; frame: Frame }) {
  const every = Math.ceil(labels.length / Math.max(2, Math.floor(frame.innerWidth / 68)));
  return (
    <g className="chart-axis">
      {labels.map((label, index) =>
        index % every === 0 ? (
          <text
            key={`${label}-${index}`}
            x={frame.x(index, labels.length)}
            y={HEIGHT - 6}
            textAnchor="middle"
          >
            {formatPeriod(label)}
          </text>
        ) : null,
      )}
    </g>
  );
}

export function PairedColumns({
  periods,
}: {
  periods: Array<{ period: string; income: number; spending: number }>;
}) {
  const { ref, width } = useChartWidth();
  if (!periods.length) {
    return <EmptyChart />;
  }
  const max = Math.max(...periods.map((p) => Math.max(p.income, p.spending)));
  const frame = buildFrame(0, max, width);
  const slot = frame.innerWidth / periods.length;
  const bar = Math.min(18, Math.max(3, slot * 0.28));

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${HEIGHT}`} className="chart" role="img" aria-label="Income versus spending by period">
      <Gridlines frame={frame} />
      <g className="chart-plot" key={plotKey(periods)}>
        {periods.map((period, index) => {
          const centre = frame.x(index, periods.length);
          return (
            <g key={period.period}>
              <rect
                className="bar-income"
                style={stagger(index)}
                x={centre - bar - 1}
                width={bar}
                y={frame.y(period.income)}
                height={Math.max(0, frame.y(0) - frame.y(period.income))}
              >
                <title>{`${formatPeriod(period.period)} income ${formatAmount(period.income)}`}</title>
              </rect>
              <rect
                className="bar-spending"
                style={stagger(index)}
                x={centre + 1}
                width={bar}
                y={frame.y(period.spending)}
                height={Math.max(0, frame.y(0) - frame.y(period.spending))}
              >
                <title>{`${formatPeriod(period.period)} spending ${formatAmount(period.spending)}`}</title>
              </rect>
            </g>
          );
        })}
      </g>
      <XLabels labels={periods.map((p) => p.period)} frame={frame} />
    </svg>
  );
}

export function SteppedLine({
  periods,
}: {
  periods: Array<{ period: string; net_worth: number }>;
}) {
  const { ref, width } = useChartWidth();
  if (!periods.length) {
    return <EmptyChart />;
  }
  const values = periods.map((p) => p.net_worth);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min || Math.abs(max) * 0.02) * 0.1, 1000);
  const lo = min - padding;
  const hi = max + padding;
  const excludesZero = lo > 0 || hi < 0;
  const frame = buildFrame(lo, hi, width, false);
  const points = periods.map((period, index) => ({
    x: frame.x(index, periods.length),
    y: frame.y(period.net_worth),
  }));

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    path += ` H ${points[index].x} V ${points[index].y}`;
  }

  return (
    <>
      <p className="chart-scale-note">{excludesZero ? "Zoomed value axis · zero not shown" : "Value axis includes zero"}</p>
      <svg ref={ref} viewBox={`0 0 ${width} ${HEIGHT}`} className="chart" role="img" aria-label="Net worth over time">
        <Gridlines frame={frame} />
        <g className="chart-plot" key={plotKey(periods)}>
          <path className="area-line" d={path} pathLength={1} />
          {periods.map((period, index) => (
            <circle key={period.period} className="dot" style={stagger(index)} cx={points[index].x} cy={points[index].y} r={2.5}>
              <title>{`${formatPeriod(period.period)} ${formatMoney(period.net_worth)}`}</title>
            </circle>
          ))}
        </g>
        <XLabels labels={periods.map((p) => p.period)} frame={frame} />
      </svg>
    </>
  );
}

export function DottedLine({
  periods,
}: {
  periods: Array<{ period: string; value: number | null }>;
}) {
  const { ref, width } = useChartWidth();
  const present = periods.filter((p) => p.value !== null) as Array<{ period: string; value: number }>;
  if (!present.length) {
    return <EmptyChart />;
  }
  const values = present.map((p) => p.value);
  const hi = Math.max(...values);
  const frame = buildFrame(0, hi, width);
  const { y, ticks } = frame;
  const x = (index: number) => frame.x(index, periods.length);

  const points = periods
    .map((period, index) => (period.value === null ? null : { x: x(index), y: y(period.value), period }))
    .filter((point): point is { x: number; y: number; period: { period: string; value: number | null } } => point !== null);

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${HEIGHT}`} className="chart" role="img" aria-label="Age of money in days">
      <g className="chart-grid">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
              {`${Math.round(tick)}d`}
            </text>
          </g>
        ))}
      </g>
      <g className="chart-plot" key={plotKey(periods)}>
        <path className="dotted-line" d={path} />
        {points.map((point, index) => (
          <circle key={point.period.period} className="dot dot-ink" style={stagger(index)} cx={point.x} cy={point.y} r={3}>
            <title>{`${formatPeriod(point.period.period)} · ${Math.round(point.period.value ?? 0)} days`}</title>
          </circle>
        ))}
      </g>
      <XLabels labels={periods.map((p) => p.period)} frame={frame} />
    </svg>
  );
}

function plotKey(periods: ReadonlyArray<{ period: string }>): string {
  return `${periods[0]?.period}:${periods.length}`;
}

const stagger = (index: number) => ({ "--i": Math.min(index, 24) }) as CSSProperties;

function EmptyChart() {
  return <div className="chart-empty">No data in this range.</div>;
}
