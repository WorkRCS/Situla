import { cn } from "../../lib/utils.js";

export function Progress({ value = 0, ariaLabel = "Progress", className, indicatorClassName }) {
  const safeValue = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0;
  return (
    <div
      className={cn("ui-progress", className)}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue)}
    >
      <span className={cn("ui-progress-indicator", indicatorClassName)} style={{ width: safeValue + "%" }} />
    </div>
  );
}
