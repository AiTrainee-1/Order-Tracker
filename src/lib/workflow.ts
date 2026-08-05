export function diffInDays(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / msPerDay);
}

export function daysRemaining(deliveryDate: string | null): number | null {
  if (!deliveryDate) return null;
  return diffInDays(new Date(), new Date(deliveryDate));
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export type DeliveryUrgency = "overdue" | "urgent" | "soon" | "safe" | "none";

export function deliveryUrgency(deliveryDate: string | null): DeliveryUrgency {
  const remaining = daysRemaining(deliveryDate);
  if (remaining === null) return "none";
  if (remaining < 0) return "overdue";
  if (remaining <= 3) return "urgent";
  if (remaining <= 10) return "soon";
  return "safe";
}

export const urgencyColorClasses: Record<DeliveryUrgency, string> = {
  overdue: "bg-red-50 text-status-bad border-red-200",
  urgent: "bg-amber-50 text-status-warn border-amber-200",
  soon: "bg-amber-50/60 text-amber-700 border-amber-100",
  safe: "bg-green-50 text-status-good border-green-200",
  none: "bg-ink-50 text-ink-500 border-ink-200",
};

export const urgencyTextClasses: Record<DeliveryUrgency, string> = {
  overdue: "text-status-bad",
  urgent: "text-status-warn",
  soon: "text-amber-700",
  safe: "text-status-good",
  none: "text-ink-900",
};
