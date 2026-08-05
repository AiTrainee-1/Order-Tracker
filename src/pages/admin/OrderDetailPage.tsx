import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useOrderDetail } from "../../hooks/useOrderDetail";
import { publicImageUrl } from "../../lib/supabaseClient";
import { deliveryUrgency, formatDisplayDate, urgencyTextClasses } from "../../lib/workflow";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Loader } from "../../components/ui/Loader";
import { Table } from "../../components/ui/Table";
import { StageTracker } from "../../components/dashboard/StageTracker";
import { MultiUnitSplitTable } from "../../components/dashboard/MultiUnitSplitTable";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { order, purchaseOrders, entries, usersById, progress, isLoading, isError } =
    useOrderDetail(orderId);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (isLoading) return <Loader full label="Loading order…" />;
  if (isError || !order || !progress) {
    return <p className="text-sm text-status-bad">Couldn't load this order.</p>;
  }

  const imageUrl = publicImageUrl(order.image_path);
  const urgency = deliveryUrgency(order.delivery_date);
  const selectedStage = progress.stages[selectedIndex];

  return (
    <div className="space-y-6">
      <Link to="/admin/dashboard" className="text-xs font-medium text-ink-500 hover:text-ink-900">
        ← Back to Dashboard
      </Link>

      <Card>
        <CardBody className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-50">
            {imageUrl ? (
              <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
            ) : (
              <GarmentPlaceholder className="h-10 w-10 text-ink-300" />
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-ink-900">{order.style}</h1>
              <Badge tone="neutral">IO {order.io_no}</Badge>
              <Badge tone="neutral">{order.color}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-500">{order.description}</p>
            <p className="mt-1 text-xs text-ink-400">{order.fabric}</p>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Total Qty" value={order.total_qty.toLocaleString() + " PCS"} />
              <Metric label="Delivery" value={formatDisplayDate(order.delivery_date)} />
              <Metric
                label="Days Remaining"
                value={
                  progress.daysRemaining !== null
                    ? `${progress.daysRemaining >= 0 ? progress.daysRemaining : Math.abs(progress.daysRemaining) + " overdue"}`
                    : "—"
                }
                tone={urgencyTextClasses[urgency]}
              />
              <Metric label="Overall Progress" value={`${progress.overallProgressPct}%`} />
            </div>
            <ProgressBar value={progress.overallProgressPct} className="mt-3" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Production Workflow"
          subtitle={`${progress.completedStagesCount} completed · ${progress.pendingStagesCount} pending`}
        />
        <CardBody>
          <StageTracker
            stages={progress.stages}
            currentStageIndex={progress.currentStageIndex}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
        </CardBody>
      </Card>

      {selectedStage && (
        <Card>
          <CardHeader
            title={selectedStage.stage.label}
            subtitle={
              selectedStage.isCompleted
                ? `Completed · last update ${formatDisplayDate(selectedStage.lastEntryDate)}`
                : selectedStage.entries.length
                  ? `In progress · last update ${formatDisplayDate(selectedStage.lastEntryDate)}`
                  : "Not started yet"
            }
            action={
              <Badge tone={selectedStage.isCompleted ? "good" : selectedStage.entries.length ? "warn" : "neutral"}>
                {selectedStage.isCompleted ? "Completed" : selectedStage.entries.length ? "In Progress" : "Pending"}
              </Badge>
            }
          />
          <CardBody className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label={`Qty Allotted (${selectedStage.stage.unit_type})`} value={selectedStage.qtyReceived.toLocaleString()} />
              <Metric label="Forwarded" value={selectedStage.qtyForwarded.toLocaleString()} />
              <Metric label="Pending" value={selectedStage.qtyPending.toLocaleString()} />
              <Metric label="Shortage" value={selectedStage.qtyShortage.toLocaleString()} tone="text-status-bad" />
              <Metric label="Rejected" value={selectedStage.qtyRejected.toLocaleString()} tone="text-status-bad" />
              <Metric label="Returned" value={selectedStage.qtyReturned.toLocaleString()} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <InfoTile
                label="Responsible Person(s)"
                value={
                  selectedStage.responsibleUserIds.length
                    ? selectedStage.responsibleUserIds
                        .map((id) => usersById.get(id)?.name ?? "Unknown")
                        .join(", ")
                    : "Not yet actioned"
                }
              />
              <InfoTile
                label="Next Assigned Person"
                value={
                  selectedStage.nextAssignedUserId
                    ? usersById.get(selectedStage.nextAssignedUserId)?.name ?? "Unknown"
                    : "Not specified"
                }
              />
              <InfoTile
                label="Next Process"
                value={progress.stages[selectedIndex + 1]?.stage.label ?? "Final stage"}
              />
            </div>

            {!selectedStage.isCompleted && (
              <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                Estimated completion: <span className="font-semibold">{formatDisplayDate(selectedStage.estimatedCompletionDate)}</span>
                {" "}(based on a typical {selectedStage.stage.typical_duration_days}-day cycle for this stage)
              </p>
            )}

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                Unit / Vendor Split
              </h4>
              <MultiUnitSplitTable units={selectedStage.unitBreakdown} />
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                Entries for this stage
              </h4>
              <Table
                keyFor={(e) => e.id}
                rows={selectedStage.entries}
                emptyMessage="No entries submitted for this stage yet."
                columns={[
                  { header: "Date", render: (e) => formatDisplayDate(e.entry_date) },
                  { header: "By", render: (e) => usersById.get(e.entered_by)?.name ?? "—" },
                  { header: "Branch", render: (e) => e.branch ?? "—" },
                  { header: "Unit", render: (e) => e.unit_name ?? "—" },
                  { header: "Fwd", render: (e) => e.qty_forwarded.toLocaleString() },
                  { header: "Shortage", render: (e) => e.qty_shortage.toLocaleString() },
                  { header: "Rejected", render: (e) => e.qty_rejected.toLocaleString() },
                  {
                    header: "External",
                    render: (e) =>
                      e.is_external ? (
                        <Badge tone="info">{e.external_unit_name || "External"}</Badge>
                      ) : (
                        "—"
                      ),
                  },
                  {
                    header: "Flags",
                    render: (e) => (
                      <div className="flex flex-wrap gap-1">
                        {e.is_sent_outside && <Badge tone="neutral">Sent Out</Badge>}
                        {e.is_returned && <Badge tone="neutral">Returned</Badge>}
                        {e.is_completed && <Badge tone="good">Done</Badge>}
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Purchase Order Breakdown" subtitle={`${purchaseOrders.length} POs under this order`} />
        <CardBody>
          <Table
            keyFor={(po) => po.id}
            rows={purchaseOrders}
            columns={[
              { header: "PO Number", render: (po) => po.po_number },
              { header: "Quantity", render: (po) => `${po.quantity.toLocaleString()} PCS` },
              { header: "Delivery Date", render: (po) => formatDisplayDate(po.delivery_date) },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Complete Movement History" subtitle={`${entries.length} entries logged`} />
        <CardBody>
          <Table
            keyFor={(e) => e.id}
            rows={[...entries].reverse()}
            emptyMessage="No production activity logged for this order yet."
            columns={[
              { header: "Date", render: (e) => formatDisplayDate(e.entry_date) },
              {
                header: "Section",
                render: (e) =>
                  progress.stages.find((s) => s.stage.id === e.section_id)?.stage.label ?? "—",
              },
              { header: "By", render: (e) => usersById.get(e.entered_by)?.name ?? "—" },
              { header: "Qty Fwd", render: (e) => e.qty_forwarded.toLocaleString() },
              { header: "Notes", render: (e) => e.notes || "—" },
            ]}
          />
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
    <div className="rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-ink-800">{value}</p>
    </div>
  );
}
