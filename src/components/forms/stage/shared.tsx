export function QtyStat({ label, value, tone }: { label: string; value: string | number; tone?: "bad" | "good" | "neutral" }) {
  const color = tone === "bad" ? "text-status-bad" : tone === "good" ? "text-status-good" : "text-ink-900";
  const display = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="rounded-lg bg-ink-50 px-3 py-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-0.5 text-base font-bold ${color}`}>{display}</p>
    </div>
  );
}
