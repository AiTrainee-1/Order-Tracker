import type { ReactNode } from "react";

type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-600 ring-1 ring-inset ring-ink-200/60",
  good: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200",
  warn: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  bad: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  info: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  brand: "bg-brand-gradient text-white shadow-sm",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
