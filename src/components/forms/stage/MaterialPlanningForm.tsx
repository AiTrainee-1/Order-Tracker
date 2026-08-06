import { useEffect, useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { useStageSubItems, useUpsertStageSubItem } from "../../../hooks/useStageSubItems";
import { STAGE_SUB_ITEMS } from "../../../lib/stageConfig";
import { getAssignmentQty } from "../../../lib/orderQty";
import { Button } from "../../ui/Button";
import { Input, Textarea } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import { TransferFields, useForwardConfirm, useStageEntryBuilder, useTransferFields } from "./shared";
import type { StageFormProps } from "./types";

export function MaterialPlanningForm({ order, assignment, onForwarded }: StageFormProps) {
  const toast = useToast();
  const items = STAGE_SUB_ITEMS.raw_material_planning;
  const subItemsQuery = useStageSubItems(order.id, assignment.section_id);
  const upsertItem = useUpsertStageSubItem();
  const { createEntry, buildEntry, appUser } = useStageEntryBuilder(order, assignment);
  const transfer = useTransferFields();
  const forwardConfirm = useForwardConfirm();

  const [planned, setPlanned] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subItemsQuery.data) return;
    const next: Record<string, string> = {};
    for (const item of items) {
      const existing = subItemsQuery.data.find((s) => s.item_key === item.key);
      next[item.key] = existing ? String(existing.planned_qty) : "";
    }
    setPlanned(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subItemsQuery.data]);

  if (subItemsQuery.isLoading) return <Loader label="Loading material plan…" />;

  async function handleSavePlan() {
    if (!appUser) return;
    setError(null);
    try {
      await Promise.all(
        items.map((item) =>
          upsertItem.mutateAsync({
            order_id: order.id,
            section_id: assignment.section_id,
            item_key: item.key,
            item_label: item.label,
            planned_qty: Number(planned[item.key]) || 0,
            completed_qty: 0,
            unit_type: "KG",
            is_completed: false,
            notes: null,
            updated_by: appUser.id,
          }),
        ),
      );
      toast.success("Material plan saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save plan.";
      setError(message);
      toast.error(message);
    }
  }

  async function handleForward() {
    if (!appUser) return;
    if (!(await forwardConfirm(assignment.section?.label ?? "this stage"))) return;
    setError(null);
    try {
      await handleSavePlan();
      const totalPlanned = items.reduce((sum, item) => sum + (Number(planned[item.key]) || 0), 0);
      await createEntry.mutateAsync(
        buildEntry(
          {
            qty_received: totalPlanned,
            qty_completed_today: totalPlanned,
            qty_forwarded: totalPlanned,
            notes: notes || null,
            ...transfer.values,
          },
          true,
        ),
      );
      toast.success("Material plan forwarded to Purchase Order to Suppliers.");
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
        Plan how much of each material is required for {getAssignmentQty(order, assignment).toLocaleString()} PCS of{" "}
        {order.style}
        {assignment.po ? ` (PO ${assignment.po.po_number})` : ""}.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Input
            key={item.key}
            label={`${item.label} Required (KG)`}
            type="number"
            min={0}
            value={planned[item.key] ?? ""}
            onChange={(e) => setPlanned((prev) => ({ ...prev, [item.key]: e.target.value }))}
          />
        ))}
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
        <Button variant="secondary" onClick={handleSavePlan} isLoading={upsertItem.isPending} className="flex-1">
          Save Plan
        </Button>
        <Button onClick={handleForward} isLoading={createEntry.isPending} className="flex-1">
          Forward to Next Stage →
        </Button>
      </div>
    </div>
  );
}
