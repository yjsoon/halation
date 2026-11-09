import type { Key, ReactNode } from "react";

type FigureTone = "positive" | "negative";

export function signTone(value: number): FigureTone {
  return value >= 0 ? "positive" : "negative";
}

/** A report headline figure. A new `settleKey` replays the settle animation. */
export function HeadlineFigure({ label, value, settleKey, tone }: {
  label: ReactNode;
  value: ReactNode;
  settleKey: Key;
  tone?: FigureTone;
}) {
  return (
    <div className="headline-figure">
      <span className="figure-label">{label}</span>
      <span key={settleKey} className={tone ? `figure-value figure-settle figure-${tone}` : "figure-value figure-settle"}>
        {value}
      </span>
    </div>
  );
}
