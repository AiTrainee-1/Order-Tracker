import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  icon?: ReactNode;
}) {
  const toneClasses =
    tone === "good"
      ? "text-status-good"
      : tone === "warn"
        ? "text-status-warn"
        : tone === "bad"
          ? "text-status-bad"
          : "text-ink-900";

  return (
    <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        {icon && <span className="text-ink-400">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-semibold ${toneClasses}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
