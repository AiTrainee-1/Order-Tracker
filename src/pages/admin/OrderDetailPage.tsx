import { useMemo, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { useOrderDetail } from "../../hooks/useOrderDetail";
import { useProductionChain } from "../../hooks/useProductionChain";
import { useOrderAssignments } from "../../hooks/useAssignments";
import { publicImageUrl } from "../../lib/supabaseClient";
import { deliveryUrgency, formatDisplayDate, urgencyTextClasses } from "../../lib/workflow";
import { buildOrderProgress } from "../../lib/progress";
import { getCombinedCutQuantity } from "../../lib/orderQty";
import { orderTrackingBasePath } from "../../lib/routing";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Loader } from "../../components/ui/Loader";
import { Table } from "../../components/ui/Table";
import { FilterTabs } from "../../components/ui/FilterTabs";
import { GameLevelPath } from "../../components/dashboard/GameLevelPath";
import { StageDetailPanel } from "../../components/dashboard/StageDetailPanel";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";
import { BackButton } from "../../components/ui/BackButton";
import type { AppUser } from "../../lib/types";

const HISTORY_PAGE_SIZE = 15;
const ALL_POS = "all";

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const basePath = orderTrackingBasePath(useLocation().pathname);
  const { order, purchaseOrders, entries, usersById, progress, isLoading, isError } =
    useOrderDetail(orderId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  // Collapsed by default -  it's a full cross-section log and pushes everything
  // above it off the screen on a long order.
  const [showHistory, setShowHistory] = useState(false);
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

  // Recompute progress scoped to just the chosen PO's own entries/quantities - 
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

  // Who is scheduled to run the NEXT stage -  from the assignment roster rather
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
        <BackButton to={`${basePath}/dashboard`} label="Back to Dashboard" />
        <Link to={`${basePath}/output/${order.id}`}>
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

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
              <Metric
                label={selectedPo ? `PO ${selectedPo.po_number} -  Buyer Qty` : "Buyer Order Qty (All POs)"}
                value={plannedQty.toLocaleString() + " PCS"}
              />
              <Metric label="Extra %" value={`${selectedPo?.extra_percent ?? 0}%`} />
              <Metric
                label="Extra Qty"
                value={Math.max((chain?.totalPcs ?? plannedQty) - plannedQty, 0).toLocaleString() + " PCS"}
              />
              <Metric
                label="Final Production Qty"
                value={(chain?.totalPcs ?? plannedQty).toLocaleString() + " PCS"}
                tone="text-brand"
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
                ? `Completed by ${selectedStage.completedBy ? nameOf(selectedStage.completedBy) : "- "} on ${formatDisplayDate(selectedStage.completedOn)}`
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
                    ? "Moved on -  not completed"
                    : selectedStage.entries.length
                      ? "In Progress"
                      : "Pending"}
              </Badge>
            }
          />
          <CardBody className="space-y-5">
            <StageDetailPanel
              orderId={orderId}
              stage={selectedStage}
              chainStage={selectedChainStage}
              chain={chain}
              nameOf={nameOf}
              usersById={usersById}
              nextStage={nextStage}
              nextStageAssignees={nextStageAssignees}
              nextStageAssigneesLoading={assignmentsQuery.isLoading}
            />
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
          {!showHistory ? (
            <Button variant="secondary" size="sm" onClick={() => setShowHistory(true)}>
              See Here
            </Button>
          ) : (
            <>
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
                        {sectionLabelById.get(e.section_id) ?? "- "}
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
                  { header: "Notes", render: (e) => e.notes || "- " },
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

              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                Hide
              </Button>
            </>
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

