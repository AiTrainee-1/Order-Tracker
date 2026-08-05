export function ProgressBar({
  value,
  tone = "default",
  showLabel = false,
  className = "",
}: {
  value: number;
  tone?: "default" | "good" | "warn" | "bad";
  showLabel?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor =
    tone === "good"
      ? "bg-status-good"
      : tone === "warn"
        ? "bg-status-warn"
        : tone === "bad"
          ? "bg-status-bad"
          : "bg-ink-900";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-9 shrink-0 text-right text-xs font-medium text-ink-600">
          {clamped}%
        </span>
      )}
    </div>
  );
}
