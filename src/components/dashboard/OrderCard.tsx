import { Link } from "react-router-dom";
import type { OrderBundle } from "../../hooks/useOrders";
import { publicImageUrl } from "../../lib/supabaseClient";
import { deliveryUrgency, formatDisplayDate, urgencyColorClasses } from "../../lib/workflow";
import { Badge } from "../ui/Badge";
import { ProgressBar } from "../ui/ProgressBar";
import { GarmentPlaceholder } from "../ui/GarmentPlaceholder";

const statusTone: Record<string, "neutral" | "good" | "warn" | "bad"> = {
  not_started: "neutral",
  on_track: "good",
  due_soon: "warn",
  delayed: "bad",
  completed: "good",
};

const statusRibbon: Record<string, string> = {
  not_started: "bg-ink-300",
  on_track: "bg-good-gradient",
  due_soon: "bg-warn-gradient",
  delayed: "bg-bad-gradient",
  completed: "bg-brand-gradient",
};

const statusLabel: Record<string, string> = {
  not_started: "Not started",
  on_track: "On track",
  due_soon: "Due soon",
  delayed: "Delayed",
  completed: "Completed",
};

const progressTone: Record<string, "brand" | "good" | "warn" | "bad"> = {
  not_started: "brand",
  on_track: "brand",
  due_soon: "warn",
  delayed: "bad",
  completed: "good",
};

export function OrderCard({ bundle }: { bundle: OrderBundle }) {
  const { order, progress } = bundle;
  const imageUrl = publicImageUrl(order.image_path);
  const urgency = deliveryUrgency(order.delivery_date);
  const currentStage = progress.stages[progress.currentStageIndex]?.stage.label ?? "—";

  return (
    <Link
      to={`/admin/orders/${order.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/80 backdrop-blur-xl shadow-[0_10px_30px_-14px_rgba(30,41,90,0.35)] transition-shadow hover:shadow-[0_18px_44px_-16px_rgba(30,41,90,0.45)]"
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${statusRibbon[progress.status]}`} />

      <div className="flex items-center gap-3 border-b border-white/70 p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-white/70">
          {imageUrl ? (
            <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
          ) : (
            <GarmentPlaceholder className="h-8 w-8 text-ink-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">{order.style}</p>
          <p className="truncate text-xs text-ink-500">
            IO {order.io_no} · {order.color}
          </p>
        </div>
        <Badge tone={statusTone[progress.status]}>{statusLabel[progress.status]}</Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-ink-500">
            <span>Progress</span>
            <span className="font-medium text-ink-600">
              {progress.completedStagesCount}/{progress.stages.length} stages
            </span>
          </div>
          <ProgressBar value={progress.overallProgressPct} showLabel tone={progressTone[progress.status]} />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-500">Current stage</span>
          <span className="max-w-[60%] truncate font-medium text-ink-800">{currentStage}</span>
        </div>

        {/* Stages that moved on without finishing still owe a balance. They're
            easy to lose track of precisely because the line carried on, so the
            count is surfaced on the card rather than only inside the order. */}
        {progress.partialStagesCount > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
            {progress.partialStagesCount} stage{progress.partialStagesCount === 1 ? "" : "s"} not
            complete — balance still owed
          </p>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-ink-100 pt-3 text-xs">
          <span className="text-ink-500">Delivery {formatDisplayDate(order.delivery_date)}</span>
          <span className={`rounded-full border px-2 py-0.5 font-semibold ${urgencyColorClasses[urgency]}`}>
            {progress.daysRemaining !== null
              ? progress.daysRemaining >= 0
                ? `${progress.daysRemaining}d left`
                : `${Math.abs(progress.daysRemaining)}d overdue`
              : "No date"}
          </span>
        </div>
      </div>
    </Link>
  );
}
