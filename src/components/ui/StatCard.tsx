import type { ReactNode } from "react";

type Tone = "neutral" | "good" | "warn" | "bad" | "brand";

const toneAccent: Record<Tone, string> = {
  neutral: "before:bg-ink-300",
  good: "before:bg-good-gradient",
  warn: "before:bg-warn-gradient",
  bad: "before:bg-bad-gradient",
  brand: "before:bg-brand-gradient",
};

const toneValueColor: Record<Tone, string> = {
  neutral: "text-ink-900",
  good: "text-green-700",
  warn: "text-amber-700",
  bad: "text-red-700",
  brand: "text-ink-900",
};

const toneIconBg: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-500",
  good: "bg-green-50 text-green-600",
  warn: "bg-amber-50 text-amber-600",
  bad: "bg-red-50 text-red-600",
  brand: "bg-indigo-50 text-brand",
};

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
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-4 shadow-card transition-transform hover:-translate-y-0.5 hover:shadow-popover before:absolute before:inset-y-0 before:left-0 before:w-1 ${toneAccent[tone]}`}
    >
      <div className="flex items-center justify-between pl-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        {icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneIconBg[tone]}`}>
            {icon}
          </span>
        )}
      </div>
      <p className={`mt-2 pl-2 text-2xl font-bold tracking-tight ${toneValueColor[tone]}`}>{value}</p>
      {hint && <p className="mt-1 pl-2 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
