export function ProgressBar({
  value,
  tone = "brand",
  showLabel = false,
  className = "",
  size = "md",
}: {
  value: number;
  tone?: "brand" | "good" | "warn" | "bad";
  showLabel?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const barGradient =
    tone === "good"
      ? "bg-good-gradient"
      : tone === "warn"
        ? "bg-warn-gradient"
        : tone === "bad"
          ? "bg-bad-gradient"
          : "bg-brand-gradient";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 overflow-hidden rounded-full bg-ink-100 ${size === "sm" ? "h-1.5" : "h-2"}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barGradient}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-600">
          {clamped}%
        </span>
      )}
    </div>
  );
}
