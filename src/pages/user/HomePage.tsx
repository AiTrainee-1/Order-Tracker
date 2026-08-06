import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMyWork, type GateStatus, type WorkItem } from "../../hooks/useMyWork";
import { publicImageUrl } from "../../lib/supabaseClient";
import { formatDisplayDate } from "../../lib/workflow";
import { Card, CardBody } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Loader } from "../../components/ui/Loader";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";
import { Input } from "../../components/ui/FormControls";
import { FilterTabs } from "../../components/ui/FilterTabs";
import { Button } from "../../components/ui/Button";
import { NextStagesStrip } from "../../components/dashboard/NextStagesStrip";

const PAGE_SIZE = 9;

type StatusFilter = "all" | "active" | "locked" | "completed" | "monitor";

const GATE_BADGE: Record<GateStatus, { tone: "good" | "warn" | "neutral"; label: string }> = {
  active: { tone: "warn", label: "Your Turn" },
  completed: { tone: "good", label: "Completed" },
  locked: { tone: "neutral", label: "Waiting" },
};

/** Ordering priority for the work grid: actionable first, done last. */
const GATE_PRIORITY: Record<GateStatus, number> = { active: 0, locked: 1, completed: 2 };

function matchesQuery(item: WorkItem, query: string): boolean {
  if (!query) return true;
  const order = item.assignment.order;
  const haystack = [
    order?.style,
    order?.io_no,
    order?.color,
    order?.description,
    item.assignment.section?.label,
    item.assignment.po?.po_number,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesStatus(item: WorkItem, status: StatusFilter): boolean {
  if (status === "all") return true;
  if (status === "monitor") return !item.assignment.can_enter_data;
  return item.gateStatus === status;
}

export function HomePage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const { workItems, isLoading, isError } = useMyWork(appUser?.id);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const searched = useMemo(
    () => workItems.filter((item) => matchesQuery(item, query)),
    [workItems, query],
  );

  const filtered = useMemo(() => {
    return searched
      .filter((item) => matchesStatus(item, status))
      // Your Turn → Waiting → Completed, so the work needing action is on top.
      .sort((a, b) => GATE_PRIORITY[a.gateStatus] - GATE_PRIORITY[b.gateStatus]);
  }, [searched, status]);

  const counts = useMemo(() => {
    const next: Record<StatusFilter, number> = {
      all: searched.length,
      active: 0,
      locked: 0,
      completed: 0,
      monitor: 0,
    };
    for (const item of searched) {
      next[item.gateStatus]++;
      if (!item.assignment.can_enter_data) next.monitor++;
    }
    return next;
  }, [searched]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateStatus(value: StatusFilter) {
    setStatus(value);
    setPage(1);
  }

  if (isLoading) return <Loader full label="Loading your assigned work…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn't load your assignments.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Welcome, {appUser?.name}</h1>
        <p className="text-sm text-ink-500">Here's what's assigned to you right now.</p>
      </div>

      {workItems.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">
              No work has been assigned to you yet. Check back once your Admin assigns an order.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardBody>
              <Input
                label="Find an order"
                placeholder="Type a style, IO number, color, PO, or section…"
                value={query}
                onChange={(e) => updateQuery(e.target.value)}
              />
            </CardBody>
          </Card>

          <FilterTabs
            value={status}
            onChange={updateStatus}
            tabs={[
              { key: "all", label: "All", count: counts.all },
              { key: "active", label: "Your Turn", count: counts.active },
              { key: "locked", label: "Waiting", count: counts.locked },
              { key: "completed", label: "Completed", count: counts.completed },
              { key: "monitor", label: "Monitor Only", count: counts.monitor },
            ]}
          />

          <p className="text-xs text-ink-500">
            {filtered.length} matching assignment{filtered.length === 1 ? "" : "s"}
          </p>

          {filtered.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-ink-500">No assignments match your search/filter.</p>
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((item) => (
                <WorkItemCard
                  key={item.assignment.id}
                  item={item}
                  onOpen={() => navigate(`/user/data-input?assignment=${item.assignment.id}`)}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                ← Previous
              </Button>
              <span className="text-xs text-ink-500">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WorkItemCard({ item, onOpen }: { item: WorkItem; onOpen: () => void }) {
  const { assignment, orderProgress, gateStatus } = item;
  const order = assignment.order!;
  const imageUrl = publicImageUrl(order.image_path);
  const gate = GATE_BADGE[gateStatus];
  const currentStageLabel = orderProgress.stages[orderProgress.currentStageIndex]?.stage.label;

  const requiredAction = !assignment.can_enter_data
    ? "Monitor only — tap to view status"
    : gateStatus === "completed"
      ? "Your part is done — awaiting later stages"
      : gateStatus === "locked"
        ? `Waiting — order is at "${currentStageLabel}"`
        : "Your turn — tap to enter today's production data";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full appearance-none border-0 bg-transparent p-0 text-left"
    >
      <Card className="h-full transition-shadow hover:shadow-[0_18px_44px_-16px_rgba(30,41,90,0.45)]">
        <CardBody className="flex h-full flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/80 bg-white/70">
              {imageUrl ? (
                <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
              ) : (
                <GarmentPlaceholder className="h-7 w-7 text-ink-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-ink-900">{order.style}</p>
                {!assignment.can_enter_data && <Badge tone="info">Monitor</Badge>}
              </div>
              <p className="truncate text-xs text-ink-500">
                IO {order.io_no} · {order.color} {assignment.po ? `· PO ${assignment.po.po_number}` : ""}
              </p>
              <p className="mt-1 truncate text-xs font-medium text-ink-700">
                Section: {assignment.section?.label}
                {assignment.unit_name ? ` (${assignment.unit_name})` : ""}
              </p>
            </div>
          </div>

          <ProgressBar value={orderProgress.overallProgressPct} showLabel />

          <NextStagesStrip
            stages={orderProgress.stages}
            currentStageIndex={orderProgress.currentStageIndex}
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-500">Delivery {formatDisplayDate(order.delivery_date)}</span>
            <Badge tone={gate.tone}>{gate.label}</Badge>
          </div>

          <p className="mt-auto rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700">
            {requiredAction}
          </p>
        </CardBody>
      </Card>
    </button>
  );
}
