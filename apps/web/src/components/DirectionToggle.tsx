export type AmountDirection = "spend" | "income";

/** The Outflow or Inflow choice beside an amount whose sign is not typed. */
export function DirectionToggle({ label, value, onChange, disabled, className }: {
  label: string;
  value: AmountDirection;
  onChange: (value: AmountDirection) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className ? `segmented ${className}` : "segmented"} role="group" aria-label={label}>
      <button type="button" className={value === "spend" ? "segment segment-active" : "segment"} aria-pressed={value === "spend"} disabled={disabled} onClick={() => onChange("spend")}>Outflow</button>
      <button type="button" className={value === "income" ? "segment segment-active" : "segment"} aria-pressed={value === "income"} disabled={disabled} onClick={() => onChange("income")}>Inflow</button>
    </div>
  );
}
