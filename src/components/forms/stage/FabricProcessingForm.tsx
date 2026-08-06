import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { useAllStageSubItemsForOrder, useStageSubItems, useUpsertStageSubItem } from "../../../hooks/useStageSubItems";
import { useWorkflowStages } from "../../../hooks/useWorkflowStages";
import { FABRIC_PLANNING_ITEM_KEY, FABRIC_PLANNING_STAGE_KEY, STAGE_SUB_ITEMS } from "../../../lib/stageConfig";
import { Button } from "../../ui/Button";
import { Input, Textarea } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import { Badge } from "../../ui/Badge";
import { TransferFields, useForwardConfirm, useStageEntryBuilder, useTransferFields } from "./shared";
import type { StageFormProps } from "./types";

export function FabricProcessingForm({ order, assignment, onForwarded }: StageFormProps) {
  const toast = useToast();
  const items = STAGE_SUB_ITEMS.fabric_processing;
  const stagesQuery = useWorkflowStages();
  const allSubItemsQuery = useAllStageSubItemsForOrder(order.id);
  const thisStageItemsQuery = useStageSubItems(order.id, assignment.section_id);
  const upsertItem = useUpsertStageSubItem();
  const { createEntry, buildEntry, appUser } = useStageEntryBuilder(order, assignment);
  const transfer = useTransferFields();
  const forwardConfirm = useForwardConfirm();

  const [completed, setCompleted] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (!thisStageItemsQuery.data) return;
    const next: Record<string, string> = {};
    for (const item of items) {
      const existing = thisStageItemsQuery.data.find((s) => s.item_key === item.key);
      next[item.key] = existing ? String(existing.completed_qty) : "";
    }
    setCompleted(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thisStageItemsQuery.data]);

  const isLoading = stagesQuery.isLoading || allSubItemsQuery.isLoading || thisStageItemsQuery.isLoading;
  if (isLoading) return <Loader label="Loading fabric processing…" />;

  async function persistItems() {
    if (!appUser) return;
    await Promise.all(
      items.map((item) =>
        upsertItem.mutateAsync({
          order_id: order.id,
          section_id: assignment.section_id,
          item_key: item.key,
          item_label: item.label,
          planned_qty: plannedFabricQty,
          completed_qty: Number(completed[item.key]) || 0,
          unit_type: "KG",
          is_completed: (Number(completed[item.key]) || 0) >= plannedFabricQty,
          notes: null,
          updated_by: appUser.id,
        }),
      ),
    );
  }

  async function handleSaveProgress() {
    setError(null);
    try {
      await persistItems();
      toast.success("Fabric processing progress saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      toast.error(message);
    }
  }

  async function handleForward() {
    if (!appUser) return;
    const minNow = Math.min(...items.map((item) => Number(completed[item.key]) || 0));
    const balance = Math.max(plannedFabricQty - minNow, 0);
    if (!(await forwardConfirm(assignment.section?.label ?? "this stage", { qty: balance, unit: "KG" }))) return;
    setError(null);
    try {
      await persistItems();
      const minCompleted = Math.min(...items.map((item) => Number(completed[item.key]) || 0));
      await createEntry.mutateAsync(
        buildEntry(
          {
            unit_type: "KG",
            qty_received: plannedFabricQty,
            qty_completed_today: minCompleted,
            qty_forwarded: minCompleted,
            qty_shortage: Math.max(plannedFabricQty - minCompleted, 0),
            notes: notes || null,
            ...transfer.values,
          },
          true,
        ),
      );
      toast.success("Fabric processing forwarded to Fabric Store.");
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not forward.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-600">
        Planned fabric quantity: <span className="font-semibold text-ink-900">{plannedFabricQty.toLocaleString()} KG</span>.
        Enter how much has completed each processing step.
      </p>

      <div className="space-y-2">
        {items.map((item) => {
          const done = Number(completed[item.key]) || 0;
          const balance = Math.max(plannedFabricQty - done, 0);
          const sufficient = done >= plannedFabricQty;
          return (
            <div key={item.key} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-ink-100 p-3 sm:grid-cols-4">
              <p className="text-xs font-semibold text-ink-800">{item.label}</p>
              <Input
                label="Completed (KG)"
                type="number"
                min={0}
                value={completed[item.key] ?? ""}
                onChange={(e) => setCompleted((prev) => ({ ...prev, [item.key]: e.target.value }))}
              />
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wide text-ink-400">Balance</p>
                <p className="text-sm font-bold text-ink-900">{balance.toLocaleString()}</p>
              </div>
              <div className="flex justify-center sm:justify-end">
                <Badge tone={sufficient ? "good" : "warn"}>{sufficient ? "Sufficient" : "Insufficient"}</Badge>
              </div>
            </div>
          );
        })}
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
        <Button variant="secondary" onClick={handleSaveProgress} isLoading={upsertItem.isPending} className="flex-1">
          Save Progress (stay open)
        </Button>
        <Button onClick={handleForward} isLoading={createEntry.isPending} className="flex-1">
          Forward &amp; Complete →
        </Button>
      </div>
    </div>
  );
}
