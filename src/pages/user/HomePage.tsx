import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMyWork, type WorkItem } from "../../hooks/useMyWork";
import { publicImageUrl } from "../../lib/supabaseClient";
import { formatDisplayDate } from "../../lib/workflow";
import { Card, CardBody } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Loader } from "../../components/ui/Loader";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";
import { Input, Select } from "../../components/ui/FormControls";
import { Button } from "../../components/ui/Button";

const PAGE_SIZE = 9;

type StatusFilter = "all" | "pending" | "completed" | "monitor";

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
  if (status === "completed") return !!item.stageProgress?.isCompleted;
  return item.assignment.can_enter_data && !item.stageProgress?.isCompleted;
}

export function HomePage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const { workItems, isLoading, isError } = useMyWork(appUser?.id);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return workItems.filter((item) => matchesQuery(item, query) && matchesStatus(item, status));
  }, [workItems, query, status]);

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
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  label="Find an order"
                  placeholder="Type a style, IO number, color, PO, or section…"
                  value={query}
                  onChange={(e) => updateQuery(e.target.value)}
                />
              </div>
              <div className="sm:w-52">
                <Select
                  label="Status"
                  value={status}
                  onChange={(e) => updateStatus(e.target.value as StatusFilter)}
                >
                  <option value="all">All</option>
                  <option value="pending">Pending entry</option>
                  <option value="completed">Completed</option>
                  <option value="monitor">Monitor only</option>
                </Select>
              </div>
            </CardBody>
          </Card>

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
  const { assignment, stageProgress, overallProgressPct } = item;
  const order = assignment.order!;
  const imageUrl = publicImageUrl(order.image_path);
  const requiredAction = assignment.can_enter_data
    ? stageProgress?.isCompleted
      ? "Stage completed — awaiting next process"
      : "Tap to enter today's production data"
    : "Monitor only — tap to view status";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full appearance-none border-0 bg-transparent p-0 text-left"
    >
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-popover hover:ring-1 hover:ring-indigo-200">
        <CardBody className="flex h-full flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
              {imageUrl ? (
                <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
              ) : (
                <GarmentPlaceholder className="h-7 w-7 text-ink-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-ink-900">{order.style}</p>
                <Badge tone={assignment.can_enter_data ? "neutral" : "info"}>
                  {assignment.can_enter_data ? "Entry" : "Monitor"}
                </Badge>
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

          <ProgressBar value={overallProgressPct} showLabel />

          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-500">Delivery {formatDisplayDate(order.delivery_date)}</span>
            <Badge tone={stageProgress?.isCompleted ? "good" : "warn"}>
              {stageProgress?.isCompleted ? "Completed" : "Pending"}
            </Badge>
          </div>

          <p className="mt-auto rounded-md bg-indigo-50 px-2 py-1.5 text-xs font-medium text-indigo-700">
            {requiredAction}
          </p>
        </CardBody>
      </Card>
    </button>
  );
}
