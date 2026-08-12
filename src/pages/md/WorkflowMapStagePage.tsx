import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useOrderDetail } from "../../hooks/useOrderDetail";
import { useProductionChain } from "../../hooks/useProductionChain";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Loader } from "../../components/ui/Loader";
import { BackButton } from "../../components/ui/BackButton";
import { StageDetailPanel } from "../../components/dashboard/StageDetailPanel";

/**
 * The page a Workflow Map marker opens into. Deliberately narrower than the
 * full Order Detail tracking view -  no PO breakdown, no movement history,
 * just this one section: quantity, status, shortage/variation. Reuses
 * StageDetailPanel so the actual per-section rendering logic (and the fix for
 * it showing unrelated columns) lives in exactly one place.
 */
export function WorkflowMapStagePage() {
  const { orderId, stageKey } = useParams<{ orderId: string; stageKey: string }>();
  const { order, purchaseOrders, usersById, progress, isLoading, isError } = useOrderDetail(orderId);
  const { chain } = useProductionChain({ orderId, purchaseOrders, poId: null });

  const selectedStage = useMemo(
    () => progress?.stages.find((s) => s.stage.key === stageKey) ?? null,
    [progress, stageKey],
  );
  const selectedChainStage = useMemo(
    () => chain?.stages.find((s) => s.stage.key === stageKey) ?? null,
    [chain, stageKey],
  );

  const nameOf = (id: string) => usersById.get(id)?.name ?? "Unknown";

  if (isLoading) return <Loader full label="Loading section…" />;
  if (isError || !order || !progress || !selectedStage) {
    return <p className="text-sm text-status-bad">Couldn't load this section.</p>;
  }

  return (
    <div className="space-y-6">
      <BackButton to="/md/workflow-map" label="Back to Workflow Map" />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">
          UKTextiles — {order.style}
        </h1>
        <p className="text-sm text-ink-500">{selectedStage.stage.label}</p>
      </div>

      <Card>
        <CardHeader
          title={selectedStage.stage.label}
          subtitle={`Order Quantity ${order.total_qty.toLocaleString()} PCS`}
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
        <CardBody>
          <StageDetailPanel
            stage={selectedStage}
            chainStage={selectedChainStage}
            chain={chain}
            nameOf={nameOf}
            usersById={usersById}
            showAssignmentInfo={false}
          />
        </CardBody>
      </Card>
    </div>
  );
}
