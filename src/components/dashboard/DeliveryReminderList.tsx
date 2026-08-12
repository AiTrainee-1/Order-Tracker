import { Link, useLocation } from "react-router-dom";
import type { OrderBundle } from "../../hooks/useOrders";
import { publicImageUrl } from "../../lib/supabaseClient";
import { deliveryUrgency, formatDisplayDate, urgencyColorClasses } from "../../lib/workflow";
import { orderTrackingBasePath } from "../../lib/routing";
import { GarmentPlaceholder } from "../ui/GarmentPlaceholder";

export function DeliveryReminderList({ bundles }: { bundles: OrderBundle[] }) {
  const basePath = orderTrackingBasePath(useLocation().pathname);
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
    <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {sorted.map(({ order, progress }) => {
        const urgency = deliveryUrgency(order.delivery_date);
        const imageUrl = publicImageUrl(order.image_path);
        return (
          <Link
            key={order.id}
            to={`${basePath}/orders/${order.id}`}
            className="flex w-64 shrink-0 items-center gap-3 rounded-xl border border-white/70 bg-white/80 p-3 backdrop-blur-xl shadow-[0_10px_30px_-14px_rgba(30,41,90,0.35)] transition-shadow hover:shadow-[0_18px_44px_-16px_rgba(30,41,90,0.45)]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/80 bg-white/70">
              {imageUrl ? (
                <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
              ) : (
                <GarmentPlaceholder className="h-5 w-5 text-ink-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{order.style}</p>
              <p className="truncate text-xs text-ink-500">{formatDisplayDate(order.delivery_date)}</p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${urgencyColorClasses[urgency]}`}
            >
              {progress.daysRemaining !== null
                ? progress.daysRemaining >= 0
                  ? `${progress.daysRemaining}d`
                  : `${Math.abs(progress.daysRemaining)}d late`
                : "- "}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
