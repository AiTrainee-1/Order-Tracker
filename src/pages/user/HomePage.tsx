import { useAuth } from "../../context/AuthContext";
import { useMyWork } from "../../hooks/useMyWork";
import { publicImageUrl } from "../../lib/supabaseClient";
import { formatDisplayDate } from "../../lib/workflow";
import { Card, CardBody } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Loader } from "../../components/ui/Loader";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";

export function HomePage() {
  const { appUser } = useAuth();
  const { workItems, isLoading, isError } = useMyWork(appUser?.id);

  if (isLoading) return <Loader full label="Loading your assigned work…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn't load your assignments.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">Welcome, {appUser?.name}</h1>
        <p className="text-sm text-ink-500">Here's what's assigned to you right now.</p>
      </div>

      {workItems.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">
              No work has been assigned to you yet. Check back once your Admin assigns an order.
            </p>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {workItems.map(({ assignment, stageProgress, overallProgressPct }) => {
          const order = assignment.order!;
          const imageUrl = publicImageUrl(order.image_path);
          const requiredAction = assignment.can_enter_data
            ? stageProgress?.isCompleted
              ? "Stage completed — awaiting next process"
              : "Enter today's production data"
            : "Monitor only — no action required";

          return (
            <Card key={assignment.id}>
              <CardBody className="flex gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
                  {imageUrl ? (
                    <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
                  ) : (
                    <GarmentPlaceholder className="h-8 w-8 text-ink-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-ink-900">{order.style}</p>
                    <Badge tone={assignment.can_enter_data ? "neutral" : "info"}>
                      {assignment.can_enter_data ? "Entry" : "Monitor"}
                    </Badge>
                  </div>
                  <p className="text-xs text-ink-500">
                    IO {order.io_no} · {order.color} {assignment.po ? `· PO ${assignment.po.po_number}` : ""}
                  </p>
                  <p className="mt-1 text-xs font-medium text-ink-700">
                    Section: {assignment.section?.label}
                    {assignment.unit_name ? ` (${assignment.unit_name})` : ""}
                  </p>

                  <div className="mt-2">
                    <ProgressBar value={overallProgressPct} showLabel />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-ink-500">
                      Delivery {formatDisplayDate(order.delivery_date)}
                    </span>
                    <Badge tone={stageProgress?.isCompleted ? "good" : "warn"}>
                      {stageProgress?.isCompleted ? "Completed" : "Pending"}
                    </Badge>
                  </div>
                  <p className="mt-2 rounded-md bg-ink-50 px-2 py-1 text-xs text-ink-700">
                    {requiredAction}
                  </p>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
