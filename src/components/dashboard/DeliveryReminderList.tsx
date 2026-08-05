import { Link } from "react-router-dom";
import type { OrderBundle } from "../../hooks/useOrders";
import { deliveryUrgency, formatDisplayDate, urgencyColorClasses } from "../../lib/workflow";

export function DeliveryReminderList({ bundles }: { bundles: OrderBundle[] }) {
  const sorted = [...bundles]
    .filter((b) => b.progress.status !== "completed")
    .sort((a, b) => {
      const da = a.progress.daysRemaining ?? Infinity;
      const db = b.progress.daysRemaining ?? Infinity;
      return da - db;
    })
    .slice(0, 6);

  if (sorted.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-400">No upcoming deliveries.</p>;
  }

  return (
    <ul className="divide-y divide-ink-100">
      {sorted.map(({ order, progress }) => {
        const urgency = deliveryUrgency(order.delivery_date);
        return (
          <li key={order.id}>
            <Link
              to={`/admin/orders/${order.id}`}
              className="flex items-center justify-between gap-3 px-1 py-3 hover:bg-ink-50/60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{order.style}</p>
                <p className="truncate text-xs text-ink-500">
                  IO {order.io_no} · {order.color} · {formatDisplayDate(order.delivery_date)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${urgencyColorClasses[urgency]}`}
              >
                {progress.daysRemaining !== null
                  ? progress.daysRemaining >= 0
                    ? `${progress.daysRemaining}d`
                    : `${Math.abs(progress.daysRemaining)}d late`
                  : "—"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
