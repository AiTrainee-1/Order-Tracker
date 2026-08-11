import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMyWork, workBadge, type GateStatus, type WorkItem } from "../../hooks/useMyWork";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Input } from "../../components/ui/FormControls";
import { Button } from "../../components/ui/Button";
import { Loader } from "../../components/ui/Loader";
import { Badge } from "../../components/ui/Badge";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";
import { publicImageUrl } from "../../lib/supabaseClient";
import { formatDisplayDate } from "../../lib/workflow";
import { GameLevelPath } from "../../components/dashboard/GameLevelPath";
import { NextStagesStrip } from "../../components/dashboard/NextStagesStrip";
import { BackButton } from "../../components/ui/BackButton";
import { FilterTabs } from "../../components/ui/FilterTabs";
import { Tabs } from "../../components/ui/Tabs";
import { StageFormRouter } from "../../components/forms/stage/StageFormRouter";
import {
  cardStatusAccent,
  cardStatusBorder,
  cardStatusLabel,
  cardStatusShadow,
  cardStatusSoftBg,
  type CardStatusTone,
} from "../../lib/theme";

/** Ordering priority for work lists: actionable first, done last. */
const GATE_PRIORITY: Record<GateStatus, number> = { active: 0, locked: 1, completed: 2 };

type StatusFilter = "all" | "active" | "locked" | "completed";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Your Turn" },
  { key: "locked", label: "Waiting" },
  { key: "completed", label: "Completed" },
];

function matchesQuery(item: WorkItem, query: string): boolean {
  if (!query) return true;
  const { assignment } = item;
  const haystack = [assignment.order?.style, assignment.order?.io_no, assignment.order?.color, assignment.section?.label, assignment.po?.po_number]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesStatus(item: WorkItem, status: StatusFilter): boolean {
  if (status === "all") return true;
  return item.gateStatus === status;
}

/** Orange wins outright -  it's the one state that means "act now." Otherwise
 * the same grey/blue/green ladder as the order cards: not started, started,
 * completed. */
function assignmentCardTone(item: WorkItem): CardStatusTone {
  if (item.gateStatus === "active") return "yourTurn";
  if (item.gateStatus === "completed") return "completed";
  return item.orderProgress.completedStagesCount > 0 ? "started" : "notStarted";
}

const PAGE_SIZE = 8;

export function DataInputPage() {
  const { appUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { workItems, isLoading, isError } = useMyWork(appUser?.id);
  const queryClient = useQueryClient();

  const [selectedAssignmentId, setSelectedAssignmentId] = useState(searchParams.get("assignment") ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fromUrl = searchParams.get("assignment");
    if (fromUrl && fromUrl !== selectedAssignmentId) setSelectedAssignmentId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selected = workItems.find((w) => w.assignment.id === selectedAssignmentId);

  const searched = useMemo(() => workItems.filter((w) => matchesQuery(w, query)), [workItems, query]);
  const filtered = useMemo(
    () =>
      searched
        .filter((w) => matchesStatus(w, statusFilter))
        // Surface actionable work first: Your Turn → Waiting → Completed.
        .sort((a, b) => GATE_PRIORITY[a.gateStatus] - GATE_PRIORITY[b.gateStatus]),
    [searched, statusFilter],
  );
  const tabCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: searched.length, active: 0, locked: 0, completed: 0 };
    for (const w of searched) counts[w.gateStatus]++;
    return counts;
  }, [searched]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function selectAssignment(id: string) {
    setSelectedAssignmentId(id);
    setSearchParams(id ? { assignment: id } : {});
  }

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  if (isLoading) return <Loader full label="Loading your assignments…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn't load your assignments.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Data Input</h1>
        <p className="text-sm text-ink-500">Find an order to view its workflow and log production movement.</p>
      </div>

      {workItems.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">You have no assignments yet. Contact your Admin.</p>
          </CardBody>
        </Card>
      ) : selected ? (
        <SelectedAssignmentView
          item={selected}
          onChangeOrder={() => selectAssignment("")}
          onForwarded={() => queryClient.invalidateQueries({ queryKey: ["my_work_entries"] })}
        />
      ) : (
        <>
          <Card>
            <CardBody>
              <Input
                label="Find an order"
                placeholder="Type a style, IO number, color, PO, or section…"
                value={query}
                onChange={(e) => updateQuery(e.target.value)}
                autoFocus
              />
            </CardBody>
          </Card>

          <FilterTabs
            value={statusFilter}
            onChange={updateStatusFilter}
            tabs={STATUS_TABS.map((t) => ({ ...t, count: tabCounts[t.key] }))}
          />

          <p className="text-xs text-ink-500">
            {filtered.length} matching assignment{filtered.length === 1 ? "" : "s"}
          </p>

          <div className="space-y-3">
            {pageItems.map((item) => {
              const { assignment, orderProgress } = item;
              const order = assignment.order;
              const imageUrl = publicImageUrl(order?.image_path);
              const currentStageLabel = orderProgress.stages[orderProgress.currentStageIndex]?.stage.label;
              const nextAction = !assignment.can_enter_data
                ? "Monitor only -  tap to view status"
                : item.stageProgress?.isPartial
                  ? `Moved on without completing -  ${item.stageProgress.qtyPending.toLocaleString()} ${item.stageProgress.stage.unit_type} still owed here`
                  : item.gateStatus === "completed"
                    ? "Your part is done -  you can still record late entries"
                    : item.gateStatus === "locked"
                      ? `Waiting -  order is currently at "${currentStageLabel}"`
                      : "Your turn -  tap to enter today's production data";

              const tone = assignmentCardTone(item);

              return (
                <button
                  key={item.assignment.id}
                  type="button"
                  onClick={() => selectAssignment(item.assignment.id)}
                  style={cardStatusSoftBg[tone]}
                  className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border ${cardStatusBorder[tone]} p-4 text-left transition-transform duration-150 hover:-translate-y-0.5 ${cardStatusShadow[tone]}`}
                >
                  <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: cardStatusAccent[tone] }} />

                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-2 ring-inset"
                    style={{ boxShadow: `inset 0 0 0 2px ${cardStatusAccent[tone]}33` }}
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt={order?.style} className="h-full w-full object-cover" />
                    ) : (
                      <GarmentPlaceholder className="h-6 w-6 text-ink-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-ink-900">
                        {order?.style} -  {assignment.section?.label}
                      </p>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
                        style={{ backgroundColor: cardStatusAccent[tone] }}
                      >
                        {cardStatusLabel[tone]}
                      </span>
                    </div>
                    <p className="truncate text-xs text-ink-600">
                      IO {order?.io_no} · {order?.color}
                      {assignment.po ? ` · PO ${assignment.po.po_number}` : ""}
                    </p>
                    <div className="mt-2">
                      <ProgressBar value={orderProgress.overallProgressPct} showLabel size="sm" />
                    </div>
                    <div className="mt-2">
                      <NextStagesStrip
                        stages={orderProgress.stages}
                        currentStageIndex={orderProgress.currentStageIndex}
                      />
                    </div>
                    <p
                      className={`mt-1.5 text-xs font-semibold ${
                        item.stageProgress?.isPartial ? "text-amber-700" : "text-ink-800"
                      }`}
                    >
                      {nextAction}
                    </p>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <Card>
                <CardBody>
                  <p className="text-sm text-ink-500">No assignments match your search.</p>
                </CardBody>
              </Card>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                ← Previous
              </Button>
              <span className="text-xs text-ink-500">
                Page {currentPage} of {totalPages}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SelectedAssignmentView({
  item,
  onChangeOrder,
  onForwarded,
}: {
  item: WorkItem;
  onChangeOrder: () => void;
  onForwarded: () => void;
}) {
  const { assignment, orderProgress, gateStatus } = item;
  const order = assignment.order!;
  const imageUrl = publicImageUrl(order.image_path);
  const gate = workBadge(item);
  const isPartial = item.stageProgress?.isPartial ?? false;
  const currentStage = orderProgress.stages[orderProgress.currentStageIndex]?.stage;
  const [activeTab, setActiveTab] = useState<"entry" | "details">("entry");
  const showDetails = activeTab === "details";

  return (
    <div className="space-y-6">
      <BackButton onClick={onChangeOrder} label="Change Order" />

      {/* Compact, always-visible orientation strip. Everything else about the
          order lives one tab away -  the data-entry form is the point of this
          page, not a recap of what's already on file. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink-900">
            {order.style} -  {assignment.section?.label}
          </p>
          <p className="truncate text-xs text-ink-500">
            IO {order.io_no}
            {assignment.po ? ` · PO ${assignment.po.po_number}` : ""}
          </p>
        </div>
        <Badge tone={gate.tone}>{gate.label}</Badge>
      </div>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: "entry", label: "Data Entry" },
          { key: "details", label: "Order Details" },
        ]}
      />

      {/* Order Details tab surfaces the reference material -  order info,
          this stage's running totals, and (via showDetails on the form
          below) each form's own summary/reference content. Data Entry stays
          on the compact view. Either way the work itself -  the entries
          history and add-entry row inside StageFormRouter -  stays reachable
          on both tabs; only the surrounding reference content toggles. */}
      {activeTab === "details" && (
        <>
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-white/70">
                  {imageUrl ? (
                    <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
                  ) : (
                    <GarmentPlaceholder className="h-7 w-7 text-ink-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink-900">{order.style}</p>
                  <p className="truncate text-xs text-ink-500">
                    IO {order.io_no} · {order.color}
                    {assignment.po ? ` · PO ${assignment.po.po_number}` : ""} · Delivery{" "}
                    {formatDisplayDate(order.delivery_date)}
                  </p>
                </div>
              </div>
              <ProgressBar value={orderProgress.overallProgressPct} showLabel />
            </CardBody>
          </Card>

          {gateStatus === "completed" && item.stageProgress && (
            <Card>
              <CardHeader title="Your Stage Summary" subtitle={assignment.section?.label} />
              <CardBody>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat
                    label={`Qty (${item.stageProgress.stage.unit_type})`}
                    value={item.stageProgress.qtyReceived}
                  />
                  <Stat label="Forwarded" value={item.stageProgress.qtyForwarded} />
                  <Stat
                    label="Shortage"
                    value={item.stageProgress.qtyShortage}
                    tone={item.stageProgress.qtyShortage > 0 ? "bad" : undefined}
                  />
                  <Stat label="Last Update" value={formatDisplayDate(item.stageProgress.lastEntryDate)} />
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {isPartial && item.stageProgress && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          This stage was moved on without being completed - {" "}
          <b>
            {item.stageProgress.qtyPending.toLocaleString()} {item.stageProgress.stage.unit_type}
          </b>{" "}
          is still owed here. The next stage has already started; record the balance below and use{" "}
          <b>Completed – Move Forward</b> when it's finished.
        </p>
      )}

      {/* Data entry stays available after a stage is completed. Marking a stage
          done is a statement about the handoff, not a lock -  a late balance, a
          recount or a correction still has to be recordable, and the entries
          below are what the Output reconciliation is built from. */}
      {(gateStatus === "active" || gateStatus === "completed") && (
        <Card>
          <CardHeader
            title={assignment.section?.label ?? "Data Entry"}
            subtitle={
              gateStatus === "completed"
                ? "This stage is marked complete. You can still record late entries or corrections."
                : "This is the order's current stage -  you can enter data now."
            }
            action={
              <div className="flex items-center gap-2">
                {gateStatus === "completed" && <Badge tone="good">Completed</Badge>}
                <Badge tone="brand">{assignment.section?.unit_type}</Badge>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <StageFormRouter
              order={order}
              assignment={assignment}
              stageProgress={item.stageProgress}
              onForwarded={onForwarded}
              showDetails={showDetails}
            />
          </CardBody>
        </Card>
      )}

      {gateStatus === "locked" && (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-2 rounded-xl bg-ink-50 py-10 text-center">
              <span className="text-3xl">⏳</span>
              <p className="text-sm font-semibold text-ink-800">Not your turn yet</p>
              <p className="max-w-sm text-sm text-ink-500">
                This order is currently at <span className="font-medium text-ink-700">{currentStage?.label}</span>.
                Your assigned stage, <span className="font-medium text-ink-700">{assignment.section?.label}</span>,
                hasn't been reached yet -  it'll unlock as soon as the stage before it moves anything
                on, whether or not that stage is finished.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Complete Order Workflow"
          subtitle={`Currently at: ${currentStage?.label ?? "- "} · ${orderProgress.completedStagesCount}/${orderProgress.stages.length} stages completed`}
        />
        <CardBody>
          <GameLevelPath
            stages={orderProgress.stages}
            currentStageIndex={orderProgress.currentStageIndex}
            selectedIndex={orderProgress.stages.findIndex((s) => s.stage.id === assignment.section_id)}
            onSelect={() => {}}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "bad" }) {
  return (
    <div className="rounded-lg bg-ink-50 px-3 py-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-0.5 text-base font-bold ${tone === "bad" ? "text-status-bad" : "text-ink-900"}`}>{value}</p>
    </div>
  );
}
