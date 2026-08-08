import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { useOrderDetail } from "../../hooks/useOrderDetail";
import { useProductionChain } from "../../hooks/useProductionChain";
import { useOrderAssignments } from "../../hooks/useAssignments";
import { LotSummaryTable, SizeSummaryTable } from "../../components/forms/stage/chainShared";
import { publicImageUrl } from "../../lib/supabaseClient";
import { deliveryUrgency, formatDisplayDate, urgencyTextClasses } from "../../lib/workflow";
import { buildOrderProgress } from "../../lib/progress";
import { getCombinedCutQuantity } from "../../lib/orderQty";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Loader } from "../../components/ui/Loader";
import { Table } from "../../components/ui/Table";
import { FilterTabs } from "../../components/ui/FilterTabs";
import { GameLevelPath } from "../../components/dashboard/GameLevelPath";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";
import { BackButton } from "../../components/ui/BackButton";
import type { AppUser } from "../../lib/types";

const HISTORY_PAGE_SIZE = 15;
const ALL_POS = "all";

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { order, purchaseOrders, entries, usersById, progress, isLoading, isError } =
    useOrderDetail(orderId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [poScope, setPoScope] = useState<string>(ALL_POS);
  const assignmentsQuery = useOrderAssignments(order?.id);

  const selectedPo = poScope === ALL_POS ? null : purchaseOrders.find((p) => p.id === poScope) ?? null;

  // The quantity layer, scoped to whichever PO tab is open. progress (below)
  // still drives which stages are open/complete; this drives what the numbers
  // actually are, lot by lot and size by size.
  const { chain } = useProductionChain({
    orderId,
    purchaseOrders,
    poId: selectedPo?.id ?? null,
  });
  const selectedSectionId = progress?.stages[selectedIndex]?.stage.id;
  const selectedChainStage = chain?.stages.find((s) => s.stage.id === selectedSectionId) ?? null;

  // Recompute progress scoped to just the chosen PO's own entries/quantities —
  // this is what makes "how much has been completed for THIS PO" possible,
  // vs. the combined view which merges every PO's movement together.
  const scopedProgress = useMemo(() => {
    if (!order || !progress) return null;
    if (!selectedPo) return progress;
    const poEntries = entries.filter((e) => e.po_id === selectedPo.id);
    return buildOrderProgress(
      { ...order, delivery_date: selectedPo.delivery_date },
      progress.stages.map((s) => s.stage),
      poEntries,
      { totalQty: selectedPo.quantity, cutQuantity: selectedPo.cut_quantity },
    );
  }, [order, progress, entries, selectedPo]);

  const scopedEntries = useMemo(
    () => (selectedPo ? entries.filter((e) => e.po_id === selectedPo.id) : entries),
    [entries, selectedPo],
  );

  /** Names for the workflow tooltips / responsible-person panels. */
  const nameOf = useMemo(
    () => (id: string) => usersById.get(id)?.name ?? "Unknown",
    [usersById],
  );

  const sectionLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of progress?.stages ?? []) map.set(s.stage.id, s.stage.label);
    return map;
  }, [progress]);

  if (isLoading) return <Loader full label="Loading order…" />;
  if (isError || !order || !progress || !scopedProgress) {
    return <p className="text-sm text-status-bad">Couldn't load this order.</p>;
  }

  const imageUrl = publicImageUrl(order.image_path);
  const urgency = deliveryUrgency(scopedProgress.order.delivery_date);
  const selectedStage = scopedProgress.stages[selectedIndex];

  const plannedQty = selectedPo ? selectedPo.quantity : order.total_qty;
  const fixedQty = selectedPo
    ? selectedPo.cut_quantity
    : getCombinedCutQuantity(order, purchaseOrders);

  // Who is scheduled to run the NEXT stage — from the assignment roster rather
  // than only from whoever happened to be named on the last entry.
  const nextStage = scopedProgress.stages[selectedIndex + 1];
  const nextStageAssignees = (assignmentsQuery.data ?? [])
    .filter((a) => a.section_id === nextStage?.stage.id && (!selectedPo || !a.po_id || a.po_id === selectedPo.id))
    .map((a) => usersById.get(a.user_id))
    .filter((u): u is AppUser => !!u);

  const history = [...scopedEntries].reverse();
  const historyTotalPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const historyCurrentPage = Math.min(historyPage, historyTotalPages);
  const historyRows = history.slice(
    (historyCurrentPage - 1) * HISTORY_PAGE_SIZE,
    historyCurrentPage * HISTORY_PAGE_SIZE,
  );

  function selectPoScope(next: string) {
    setPoScope(next);
    setHistoryPage(1);
    setSelectedIndex(0);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton to="/admin/dashboard" label="Back to Dashboard" />
        <Link to={`/admin/output/${order.id}`}>
          <Button size="sm">Production Output & Reports →</Button>
        </Link>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-white/70">
            {imageUrl ? (
              <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
            ) : (
              <GarmentPlaceholder className="h-10 w-10 text-ink-500" />
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-ink-900">{order.style}</h1>
              <Badge tone="neutral">IO {order.io_no}</Badge>
              <Badge tone="neutral">{order.color}</Badge>
              {scopedProgress.partialStagesCount > 0 && (
                <Badge tone="warn">
                  {scopedProgress.partialStagesCount} stage{scopedProgress.partialStagesCount === 1 ? "" : "s"}{" "}
                  moved on unfinished
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-500">{order.description}</p>
            <p className="mt-1 text-xs text-ink-400">{order.fabric}</p>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Metric
                label={selectedPo ? `PO ${selectedPo.po_number} Qty` : "Planned Qty (All POs)"}
                value={plannedQty.toLocaleString() + " PCS"}
              />
              <Metric
                label="Fixed Qty (Post-Cutting)"
                value={fixedQty != null ? fixedQty.toLocaleString() + " PCS" : "Not cut yet"}
              />
              <Metric label="Delivery" value={formatDisplayDate(scopedProgress.order.delivery_date)} />
              <Metric
                label="Days Remaining"
                value={
                  scopedProgress.daysRemaining !== null
                    ? scopedProgress.daysRemaining >= 0
                      ? `${scopedProgress.daysRemaining} days`
                      : `${Math.abs(scopedProgress.daysRemaining)} days overdue`
                    : "No date set"
                }
                tone={urgencyTextClasses[urgency]}
              />
              <Metric label="Overall Progress" value={`${scopedProgress.overallProgressPct}%`} />
            </div>
            <ProgressBar value={scopedProgress.overallProgressPct} className="mt-3" />
          </div>
        </CardBody>
      </Card>

      {purchaseOrders.length > 0 && (
        <Card>
          <CardBody className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Track by Purchase Order
            </p>
            <FilterTabs
              value={poScope}
              onChange={selectPoScope}
              tabs={[
                { key: ALL_POS, label: "All POs (combined)" },
                ...purchaseOrders.map((po) => ({
                  key: po.id,
                  label: `PO ${po.po_number}`,
                })),
              ]}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Production Workflow"
          subtitle={`${scopedProgress.completedStagesCount} completed · ${scopedProgress.pendingStagesCount} pending${
            scopedProgress.partialStagesCount ? ` · ${scopedProgress.partialStagesCount} moved on unfinished` : ""
          }${selectedPo ? ` · PO ${selectedPo.po_number}` : " · all POs combined"}`}
        />
        <CardBody>
          <GameLevelPath
            stages={scopedProgress.stages}
            currentStageIndex={scopedProgress.currentStageIndex}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            userNameById={nameOf}
          />
        </CardBody>
      </Card>

      {selectedStage && (
        <Card>
          <CardHeader
            title={selectedStage.stage.label}
            subtitle={
              selectedStage.isCompleted
                ? `Completed by ${selectedStage.completedBy ? nameOf(selectedStage.completedBy) : "—"} on ${formatDisplayDate(selectedStage.completedOn)}`
                : selectedStage.isPartial
                  ? `Moved on without completing · last update ${formatDisplayDate(selectedStage.lastEntryDate)}`
                  : selectedStage.entries.length
                    ? `In progress · last update ${formatDisplayDate(selectedStage.lastEntryDate)}`
                    : "Not started yet"
            }
            action={
              <Badge
                tone={
                  selectedStage.isCompleted
                    ? "good"
                    : selectedStage.isPartial
                      ? "warn"
                      : selectedStage.entries.length
                        ? "info"
                        : "neutral"
                }
              >
                {selectedStage.isCompleted
                  ? "Completed"
                  : selectedStage.isPartial
                    ? "Moved on — not completed"
                    : selectedStage.entries.length
                      ? "In Progress"
                      : "Pending"}
              </Badge>
            }
          />
          <CardBody className="space-y-5">
            {selectedStage.hasQtyMismatch && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Previous stage forwarded{" "}
                <b>{selectedStage.qtyInherited.toLocaleString()} {selectedStage.stage.unit_type}</b> but{" "}
                <b>{selectedStage.qtyReceived.toLocaleString()}</b> was counted in here — a gap of{" "}
                {Math.abs(selectedStage.qtyReceived - selectedStage.qtyInherited).toLocaleString()}{" "}
                {selectedStage.stage.unit_type} to reconcile.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Metric
                label={`Carried In (${selectedStage.stage.unit_type})`}
                value={
                  selectedStage.qtyInherited > 0 ? selectedStage.qtyInherited.toLocaleString() : "—"
                }
              />
              <Metric
                label={`Allotted (${selectedStage.stage.unit_type})`}
                value={selectedStage.qtyAllotted.toLocaleString()}
              />
              <Metric label="Forwarded" value={selectedStage.qtyForwarded.toLocaleString()} />
              <Metric
                label="Pending"
                value={selectedStage.qtyPending.toLocaleString()}
                tone={selectedStage.qtyPending > 0 ? "text-amber-700" : undefined}
              />
              <Metric
                label="Shortage"
                value={selectedStage.qtyShortage.toLocaleString()}
                tone="text-status-shortage"
              />
              <Metric
                label="Rejected"
                value={selectedStage.qtyRejected.toLocaleString()}
                tone="text-status-rejected"
              />
              <Metric label="Returned" value={selectedStage.qtyReturned.toLocaleString()} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ContactTile
                label="Responsible Person(s)"
                people={selectedStage.responsibleUserIds
                  .map((id) => usersById.get(id))
                  .filter((u): u is AppUser => !!u)}
                emptyLabel="Not yet actioned"
              />
              <ContactTile
                label="Next Assigned Person"
                people={nextStageAssignees}
                emptyLabel={
                  assignmentsQuery.isLoading ? "Loading…" : "No one assigned to the next stage yet"
                }
              />
              <InfoTile label="Next Process" value={nextStage?.stage.label ?? "Final stage"} />
            </div>

            {!selectedStage.isCompleted && (
              <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Estimated completion:{" "}
                <span className="font-semibold">
                  {formatDisplayDate(selectedStage.estimatedCompletionDate)}
                </span>{" "}
                (based on a typical {selectedStage.stage.typical_duration_days}-day cycle for this stage)
              </p>
            )}

            {selectedChainStage && selectedChainStage.byLot.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Lot-wise Breakdown
                </h4>
                <LotSummaryTable cs={selectedChainStage} />
              </div>
            )}

            {selectedChainStage && selectedChainStage.bySize.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Size-wise Breakdown
                </h4>
                <SizeSummaryTable cs={selectedChainStage} />
              </div>
            )}

            {selectedChainStage && selectedChainStage.material && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Material Position
                </h4>
                <Table
                  keyFor={(f) => f.requirement.id}
                  rows={chain?.requirementFlows ?? []}
                  emptyMessage="No yarn or fabric planned for this order yet."
                  columns={[
                    { header: "Material", render: (f) => f.requirement.name },
                    { header: "Type", render: (f) => f.requirement.category },
                    { header: "Required", render: (f) => f.totals.required.toLocaleString() },
                    { header: "DC", render: (f) => f.totals.dc.toLocaleString() },
                    { header: "Received", render: (f) => f.totals.received.toLocaleString() },
                    { header: "Inward", render: (f) => f.totals.inward.toLocaleString() },
                    {
                      header: "Balance",
                      render: (f) => Math.max(f.balance, 0).toLocaleString(),
                    },
                    {
                      header: "Status",
                      render: (f) => (
                        <Badge tone={f.requirement.is_completed ? "good" : "warn"}>
                          {f.requirement.is_completed ? "Complete" : "In Progress"}
                        </Badge>
                      ),
                    },
                  ]}
                />
              </div>
            )}

            <div>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Entries for this stage
                </h4>
                <span className="text-xs text-ink-500">
                  {selectedStage.entries.length} record
                  {selectedStage.entries.length === 1 ? "" : "s"}
                  {selectedStage.firstEntryDate
                    ? ` · first ${formatDisplayDate(selectedStage.firstEntryDate)}`
                    : ""}
                  {selectedStage.lastEntryDate
                    ? ` · last ${formatDisplayDate(selectedStage.lastEntryDate)}`
                    : ""}
                </span>
              </div>
              <Table
                keyFor={(e) => e.id}
                rows={selectedStage.entries}
                emptyMessage="No entries submitted for this stage yet."
                columns={[
                  { header: "#", render: (e) => selectedStage.entries.indexOf(e) + 1 },
                  { header: "Date", render: (e) => formatDisplayDate(e.entry_date) },
                  {
                    header: "Entered By",
                    render: (e) => (
                      <div>
                        <p className="font-medium text-ink-900">{nameOf(e.entered_by)}</p>
                        {usersById.get(e.entered_by)?.phone && (
                          <p className="text-xs text-ink-500">{usersById.get(e.entered_by)!.phone}</p>
                        )}
                      </div>
                    ),
                  },
                  {
                    header: "Forwarded",
                    render: (e) => (
                      <span className="font-semibold text-ink-900">
                        {e.qty_forwarded.toLocaleString()}
                      </span>
                    ),
                  },
                  {
                    header: "Rejected",
                    render: (e) =>
                      e.qty_rejected > 0 ? (
                        <span className="font-medium text-status-rejected">
                          {e.qty_rejected.toLocaleString()}
                        </span>
                      ) : (
                        "—"
                      ),
                  },
                  {
                    header: "Returned",
                    render: (e) => (e.qty_returned > 0 ? e.qty_returned.toLocaleString() : "—"),
                  },
                  {
                    header: "Result",
                    render: (e) => (
                      <Badge tone={e.is_completed ? "good" : "warn"}>
                        {e.is_completed ? "Completed stage" : "Moved on — not completed"}
                      </Badge>
                    ),
                  },
                  { header: "Notes", render: (e) => e.notes || "—" },
                ]}
              />
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Complete Movement History"
          subtitle={`${scopedEntries.length} entries logged across all stages${
            selectedPo ? ` · PO ${selectedPo.po_number}` : " · all POs combined"
          }`}
        />
        <CardBody className="space-y-3">
          <Table
            keyFor={(e) => e.id}
            rows={historyRows}
            emptyMessage="No production activity logged for this order yet."
            columns={[
              { header: "Date", render: (e) => formatDisplayDate(e.entry_date) },
              {
                header: "Workflow Section",
                render: (e) => (
                  <span className="font-medium text-ink-900">
                    {sectionLabelById.get(e.section_id) ?? "—"}
                  </span>
                ),
              },
              { header: "By", render: (e) => nameOf(e.entered_by) },
              { header: "Qty Fwd", render: (e) => e.qty_forwarded.toLocaleString() },
              {
                header: "Result",
                render: (e) => (
                  <Badge tone={e.is_completed ? "good" : "warn"}>
                    {e.is_completed ? "Completed" : "Partial"}
                  </Badge>
                ),
              },
              { header: "Notes", render: (e) => e.notes || "—" },
            ]}
          />

          {historyTotalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyCurrentPage <= 1}
              >
                ← Previous
              </Button>
              <span className="text-xs text-ink-500">
                Page {historyCurrentPage} of {historyTotalPages} · showing{" "}
                {historyRows.length} of {history.length}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                disabled={historyCurrentPage >= historyTotalPages}
              >
                Next →
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`text-sm font-semibold ${tone ?? "text-ink-900"}`}>{value}</p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-ink-800">{value}</p>
    </div>
  );
}

/** Names with phone numbers — the handoff detail the floor actually needs. */
function ContactTile({
  label,
  people,
  emptyLabel,
}: {
  label: string;
  people: AppUser[];
  emptyLabel: string;
}) {
  const unique = Array.from(new Map(people.map((p) => [p.id, p])).values());
  return (
    <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      {unique.length === 0 ? (
        <p className="mt-0.5 text-sm text-ink-400">{emptyLabel}</p>
      ) : (
        <div className="mt-0.5 space-y-0.5">
          {unique.map((p) => (
            <div key={p.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-ink-900">{p.name}</span>
              {p.phone ? (
                <a href={`tel:${p.phone}`} className="text-xs font-medium text-brand hover:underline">
                  {p.phone}
                </a>
              ) : (
                <span className="text-xs text-ink-400">no phone on file</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
