import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMyWork, type GateStatus, type WorkItem } from "../../hooks/useMyWork";
import { useOrderAssignments } from "../../hooks/useAssignments";
import { useStageAssignments } from "../../hooks/useStageAssignments";
import { useUserContacts } from "../../hooks/useUserContacts";
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
import { StageFormRouter } from "../../components/forms/stage/StageFormRouter";
import type { UserContact } from "../../lib/types";

const GATE_BADGE: Record<GateStatus, { tone: "good" | "warn" | "neutral"; label: string }> = {
  active: { tone: "warn", label: "Your Turn" },
  completed: { tone: "good", label: "Completed" },
  locked: { tone: "neutral", label: "Waiting" },
};

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
              const gate = GATE_BADGE[item.gateStatus];
              const { assignment, orderProgress } = item;
              const order = assignment.order;
              const imageUrl = publicImageUrl(order?.image_path);
              const currentStageLabel = orderProgress.stages[orderProgress.currentStageIndex]?.stage.label;
              const nextAction = !assignment.can_enter_data
                ? "Monitor only — tap to view status"
                : item.gateStatus === "completed"
                  ? "Your part is done — awaiting later stages"
                  : item.gateStatus === "locked"
                    ? `Waiting — order is currently at "${currentStageLabel}"`
                    : "Your turn — tap to enter today's production data";

              return (
                <button
                  key={item.assignment.id}
                  type="button"
                  onClick={() => selectAssignment(item.assignment.id)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-white/70 bg-white/80 p-4 text-left backdrop-blur-xl shadow-[0_10px_30px_-14px_rgba(30,41,90,0.35)] transition-shadow hover:shadow-[0_18px_44px_-16px_rgba(30,41,90,0.45)]"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-white/70">
                    {imageUrl ? (
                      <img src={imageUrl} alt={order?.style} className="h-full w-full object-cover" />
                    ) : (
                      <GarmentPlaceholder className="h-6 w-6 text-ink-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-ink-900">
                        {order?.style} — {assignment.section?.label}
                      </p>
                      <Badge tone={gate.tone}>{gate.label}</Badge>
                    </div>
                    <p className="truncate text-xs text-ink-500">
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
                    <p className="mt-1.5 text-xs font-medium text-blue-700">{nextAction}</p>
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
  const gate = GATE_BADGE[gateStatus];
  const currentStage = orderProgress.stages[orderProgress.currentStageIndex]?.stage;

  return (
    <div className="space-y-6">
      <BackButton onClick={onChangeOrder} label="Change Order" />

      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
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
            <div className="flex items-center gap-2">
              <Badge tone="brand">Your stage: {assignment.section?.label}</Badge>
              <Badge tone={gate.tone}>{gate.label}</Badge>
            </div>
          </div>
          <ProgressBar value={orderProgress.overallProgressPct} showLabel />
        </CardBody>
      </Card>

      {gateStatus === "active" && (
        <Card>
          <CardHeader
            title={assignment.section?.label ?? "Data Entry"}
            subtitle="This is the order's current stage — you can enter data now."
            action={<Badge tone="brand">{assignment.section?.unit_type}</Badge>}
          />
          <CardBody>
            <StageFormRouter
              order={order}
              assignment={assignment}
              stageProgress={item.stageProgress}
              onForwarded={onForwarded}
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
                hasn't been reached yet — it'll unlock automatically once every earlier stage is completed.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {gateStatus === "completed" && (
        <Card>
          <CardHeader title={`${assignment.section?.label} — Completed`} subtitle="Read-only summary of what was entered" />
          <CardBody className="space-y-4">
            {item.stageProgress && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={`Qty (${item.stageProgress.stage.unit_type})`} value={item.stageProgress.qtyReceived} />
                <Stat label="Forwarded" value={item.stageProgress.qtyForwarded} />
                <Stat label="Shortage" value={item.stageProgress.qtyShortage} tone={item.stageProgress.qtyShortage > 0 ? "bad" : undefined} />
                <Stat label="Last Update" value={formatDisplayDate(item.stageProgress.lastEntryDate)} />
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Detailed workflow & stage info — kept below the data entry */}
      <Card>
        <CardHeader
          title="Complete Order Workflow"
          subtitle={`Currently at: ${currentStage?.label ?? "—"} · ${orderProgress.completedStagesCount}/${orderProgress.stages.length} stages completed`}
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

      <UpcomingStages orderProgress={orderProgress} />

      <StageHistoryAndContacts item={item} />
    </div>
  );
}

function UpcomingStages({ orderProgress }: { orderProgress: WorkItem["orderProgress"] }) {
  const { stages, currentStageIndex } = orderProgress;
  const upcoming = stages.slice(currentStageIndex);
  if (upcoming.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Upcoming Stages"
        subtitle="The remaining production steps for this order, in sequence"
      />
      <CardBody>
        <ol className="divide-y divide-ink-100">
          {upcoming.map((s, i) => {
            const isNow = i === 0;
            return (
              <li key={s.stage.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isNow ? "bg-brand-gradient text-white" : "bg-ink-100 text-ink-500"
                  }`}
                >
                  {s.stage.sequence_no}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-800">{s.stage.label}</p>
                  <p className="text-xs text-ink-400">
                    {s.stage.unit_type} · typically {s.stage.typical_duration_days} day
                    {s.stage.typical_duration_days === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge tone={isNow ? "brand" : "neutral"}>{isNow ? "Current" : "Upcoming"}</Badge>
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}

function StageHistoryAndContacts({ item }: { item: WorkItem }) {
  const { assignment, orderProgress } = item;
  const order = assignment.order!;
  const mySequence = assignment.section?.sequence_no ?? 0;

  const previousStages = orderProgress.stages.filter((s) => s.stage.sequence_no < mySequence);
  const nextStageProgress = orderProgress.stages.find((s) => s.stage.sequence_no === mySequence + 1);

  const orderAssignmentsQuery = useOrderAssignments(order.id);
  const stageDefaultsQuery = useStageAssignments();
  const nextStageAssignees = useMemo(
    () => (orderAssignmentsQuery.data ?? []).filter((a) => a.section_id === nextStageProgress?.stage.id),
    [orderAssignmentsQuery.data, nextStageProgress],
  );

  // Whoever's next in line includes both explicit per-order assignees and the
  // stage's global default users, so handoff contacts are always populated.
  const nextStageUserIds = useMemo(() => {
    const defaults = (stageDefaultsQuery.data ?? [])
      .filter((sa) => sa.section_id === nextStageProgress?.stage.id)
      .map((sa) => sa.user_id);
    return Array.from(new Set([...nextStageAssignees.map((a) => a.user_id), ...defaults]));
  }, [stageDefaultsQuery.data, nextStageAssignees, nextStageProgress]);

  const contactIds = useMemo(() => {
    const ids = previousStages.flatMap((s) => s.responsibleUserIds);
    ids.push(...nextStageUserIds);
    return ids;
  }, [previousStages, nextStageUserIds]);

  const { contactsById, isLoading: contactsLoading } = useUserContacts(contactIds);

  return (
    <Card>
      <CardHeader
        title="Stage History & Contacts"
        subtitle="Who handled earlier stages, and who's next in line — with phone numbers for handoff"
      />
      <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Previous Stages
          </h4>
          {previousStages.length === 0 ? (
            <p className="text-sm text-ink-400">This is the first stage — nothing precedes it.</p>
          ) : (
            <ul className="space-y-2">
              {previousStages.map((s) => (
                <li key={s.stage.id} className="rounded-lg border border-ink-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink-900">{s.stage.label}</p>
                    <Badge tone={s.isCompleted ? "good" : "warn"}>
                      {s.isCompleted ? "Completed" : "In Progress"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {s.lastEntryDate ? formatDisplayDate(s.lastEntryDate) : "Not started yet"}
                  </p>
                  <ContactList
                    userIds={s.responsibleUserIds}
                    contactsById={contactsById}
                    isLoading={contactsLoading}
                    emptyLabel="Not yet actioned"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Next Stage Contact
          </h4>
          {!nextStageProgress ? (
            <p className="text-sm text-ink-400">This is the final stage — nothing follows.</p>
          ) : (
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
              <p className="text-sm font-medium text-ink-900">{nextStageProgress.stage.label}</p>
              <ContactList
                userIds={nextStageUserIds}
                contactsById={contactsById}
                isLoading={contactsLoading}
                emptyLabel="No one assigned to this stage yet"
              />
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function ContactList({
  userIds,
  contactsById,
  isLoading,
  emptyLabel,
}: {
  userIds: string[];
  contactsById: Map<string, UserContact>;
  isLoading: boolean;
  emptyLabel: string;
}) {
  const uniqueIds = Array.from(new Set(userIds));
  if (isLoading) return <p className="mt-1.5 text-xs text-ink-400">Loading contact…</p>;
  if (uniqueIds.length === 0) return <p className="mt-1.5 text-xs text-ink-400">{emptyLabel}</p>;
  return (
    <div className="mt-1.5 space-y-1">
      {uniqueIds.map((id) => {
        const contact = contactsById.get(id);
        return (
          <p key={id} className="text-xs text-ink-700">
            <span className="font-medium">{contact?.name ?? "Unknown"}</span>
            {contact?.phone && <span className="text-ink-500"> · {contact.phone}</span>}
          </p>
        );
      })}
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
