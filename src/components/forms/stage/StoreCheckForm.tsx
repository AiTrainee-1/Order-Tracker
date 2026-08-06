import { useMemo, useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { useAllStageSubItemsForOrder } from "../../../hooks/useStageSubItems";
import { useWorkflowStages } from "../../../hooks/useWorkflowStages";
import { useRecentStageEntries } from "../../../hooks/useStageEntries";
import { FABRIC_PLANNING_ITEM_KEY, FABRIC_PLANNING_STAGE_KEY } from "../../../lib/stageConfig";
import { Button } from "../../ui/Button";
import { Input, Textarea } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import { QtyStat, StageBalanceSummary, TransferFields, useForwardConfirm, useStageEntryBuilder, useTransferFields } from "./shared";
import type { StageFormProps } from "./types";

export function StoreCheckForm({ order, assignment, onForwarded }: StageFormProps) {
  const toast = useToast();
  const stagesQuery = useWorkflowStages();
  const allSubItemsQuery = useAllStageSubItemsForOrder(order.id);
  const entriesQuery = useRecentStageEntries(order.id, assignment.section_id);
  const { createEntry, buildEntry, appUser } = useStageEntryBuilder(order, assignment);
  const transfer = useTransferFields();
  const forwardConfirm = useForwardConfirm();

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

  async function handleSubmit(isFinal: boolean) {
    if (!appUser) return;
    if (isFinal && !(await forwardConfirm(assignment.section?.label ?? "this stage", { qty: balanceAfter, unit: "KG" })))
      return;
    setError(null);
    try {
      await createEntry.mutateAsync(
        buildEntry(
          {
            unit_type: "KG",
            qty_received: plannedFabricQty,
            qty_completed_today: received,
            qty_forwarded: received,
            qty_shortage: isFinal ? balanceAfter : 0,
            notes: notes || null,
            ...transfer.values,
          },
          isFinal,
        ),
      );
      if (isFinal) {
        toast.success("Fabric Store verified and forwarded to Pattern Making & Marker Planning.");
        onForwarded();
      } else {
        toast.success("Entry saved — this stage stays open for the remaining balance.");
        setReceivedQty("");
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          onClick={() => handleSubmit(false)}
          isLoading={createEntry.isPending}
          disabled={received <= 0}
          className="flex-1"
        >
          Save Entry (stay open)
        </Button>
        <Button onClick={() => handleSubmit(true)} isLoading={createEntry.isPending} className="flex-1">
          Forward &amp; Complete →
        </Button>
      </div>
    </div>
  );
}
