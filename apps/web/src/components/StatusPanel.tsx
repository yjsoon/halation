import type { AriaRole, ReactNode } from "react";

export function StatusPanel({ title, error = false, className, role, children }: {
  title?: ReactNode;
  error?: boolean;
  className?: string;
  role?: AriaRole;
  children?: ReactNode;
}) {
  const classes = ["status-panel", error && "status-panel-error", className].filter(Boolean).join(" ");
  return (
    <div className={classes} role={role}>
      {title !== undefined && <p className="status-title">{title}</p>}
      {children !== undefined && <p className="status-detail">{children}</p>}
    </div>
  );
}
