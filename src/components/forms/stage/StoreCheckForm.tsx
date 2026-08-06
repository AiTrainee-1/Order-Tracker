import { useMemo, useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { useAllStageSubItemsForOrder } from "../../../hooks/useStageSubItems";
import { useWorkflowStages } from "../../../hooks/useWorkflowStages";
import { useRecentStageEntries } from "../../../hooks/useStageEntries";
import { FABRIC_PLANNING_ITEM_KEY, FABRIC_PLANNING_STAGE_KEY } from "../../../lib/stageConfig";
import { Input, Textarea } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import { QtyStat, StageActions, StageBalanceSummary, TransferFields, useStageEntryBuilder, useTransferFields } from "./shared";
import type { StageFormProps } from "./types";

export function StoreCheckForm({ order, assignment, onForwarded }: StageFormProps) {
  const toast = useToast();
  const stagesQuery = useWorkflowStages();
  const allSubItemsQuery = useAllStageSubItemsForOrder(order.id);
  const entriesQuery = useRecentStageEntries(order.id, assignment.section_id);
  const { createEntry, buildEntry, appUser } = useStageEntryBuilder(order, assignment);
  const transfer = useTransferFields();

  const [receivedQty, setReceivedQty] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const planningSectionId = useMemo(
    () => stagesQuery.data?.find((s) => s.key === FABRIC_PLANNING_STAGE_KEY)?.id,
    [stagesQuery.data],
  );
  const plannedFabricQty = useMemo(() => {
    if (!allSubItemsQuery.data || !planningSectionId) return 0;
    return (
      allSubItemsQuery.data.find(
        (row) => row.section_id === planningSectionId && row.item_key === FABRIC_PLANNING_ITEM_KEY,
      )?.planned_qty ?? 0
    );
  }, [allSubItemsQuery.data, planningSectionId]);

  if (stagesQuery.isLoading || allSubItemsQuery.isLoading || entriesQuery.isLoading)
    return <Loader label="Loading…" />;

  const priorEntries = entriesQuery.data ?? [];
  const forwardedSoFar = priorEntries.reduce((sum, e) => sum + e.qty_forwarded, 0);
  const received = Number(receivedQty) || 0;
  const balanceAfter = Math.max(plannedFabricQty - forwardedSoFar - received, 0);

  /** planOnly records what physically arrived without sending anything on; the
   * other two modes forward it, either leaving the stage open (orange) or
   * closing it out. */
  async function handleSubmit(isFinal: boolean, planOnly = false) {
    if (!appUser) return;
    setError(null);
    try {
      await createEntry.mutateAsync(
        buildEntry(
          {
            unit_type: "KG",
            qty_received: plannedFabricQty,
            qty_completed_today: received,
            qty_forwarded: planOnly ? 0 : received,
            qty_shortage: isFinal ? balanceAfter : 0,
            notes: notes || (planOnly ? "Stock counted at store." : null),
            ...transfer.values,
          },
          isFinal,
        ),
      );
      if (isFinal) {
        toast.success("Fabric Store verified and forwarded to Pattern Making & Marker Planning.");
        onForwarded();
      } else {
        toast.success(
          planOnly
            ? "Count saved — nothing forwarded yet."
            : "Moved forward — this stage stays open for the remaining balance.",
        );
        setReceivedQty("");
        if (!planOnly) onForwarded();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-600">Verify how much fabric stock has actually reached the store.</p>

      <StageBalanceSummary
        unitType="KG"
        allotted={plannedFabricQty}
        forwarded={forwardedSoFar}
        priorEntries={priorEntries}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QtyStat label="Planned (KG)" value={plannedFabricQty} />
        <div>
          <Input
            label="Received this entry (KG)"
            type="number"
            min={0}
            value={receivedQty}
            onChange={(e) => setReceivedQty(e.target.value)}
          />
        </div>
        <QtyStat label="Balance after" value={balanceAfter} tone={balanceAfter > 0 ? "bad" : "good"} />
      </div>

      <TransferFields
        type={transfer.transferType}
        to={transfer.transferTo}
        onTypeChange={transfer.setTransferType}
        onToChange={transfer.setTransferTo}
      />

      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <StageActions
        sectionLabel={assignment.section?.label ?? "Fabric Store"}
        unitType="KG"
        balance={balanceAfter}
        isLoading={createEntry.isPending}
        onSavePlan={() => handleSubmit(false, true)}
        savePlanLabel="Save Plan (stay open)"
        onMoveForward={() => handleSubmit(false)}
        onComplete={() => handleSubmit(true)}
      />
    </div>
  );
}
