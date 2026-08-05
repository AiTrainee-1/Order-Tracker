import type { ReactNode } from "react";

type Tone = "neutral" | "good" | "warn" | "bad" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  good: "bg-green-50 text-status-good",
  warn: "bg-amber-50 text-status-warn",
  bad: "bg-red-50 text-status-bad",
  info: "bg-ink-900 text-white",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
