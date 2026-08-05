export function Loader({ label = "Loading…", full = false }: { label?: string; full?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center gap-3 text-ink-500 ${
        full ? "h-[60vh]" : "py-10"
      }`}
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-300 border-t-ink-900" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulseSoft rounded-md bg-ink-100 ${className}`} />;
}
