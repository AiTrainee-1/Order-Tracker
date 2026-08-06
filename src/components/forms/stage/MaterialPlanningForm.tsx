import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { useStageSubItems, useUpsertStageSubItem } from "../../../hooks/useStageSubItems";
import { useCreateStageEntry } from "../../../hooks/useStageEntries";
import { STAGE_SUB_ITEMS } from "../../../lib/stageConfig";
import { Button } from "../../ui/Button";
import { Input, Textarea } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import type { StageFormProps } from "./types";

export function MaterialPlanningForm({ order, assignment, onForwarded }: StageFormProps) {
  const { appUser } = useAuth();
  const toast = useToast();
  const items = STAGE_SUB_ITEMS.raw_material_planning;
  const subItemsQuery = useStageSubItems(order.id, assignment.section_id);
  const upsertItem = useUpsertStageSubItem();
  const createEntry = useCreateStageEntry();

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
    setError(null);
    try {
      await handleSavePlan();
      const totalPlanned = items.reduce((sum, item) => sum + (Number(planned[item.key]) || 0), 0);
      await createEntry.mutateAsync({
        order_id: order.id,
        po_id: assignment.po_id,
        section_id: assignment.section_id,
        entry_date: new Date().toISOString().slice(0, 10),
        unit_type: "KG",
        qty_received: totalPlanned,
        qty_completed_today: totalPlanned,
        qty_forwarded: totalPlanned,
        qty_shortage: 0,
        qty_rejected: 0,
        qty_returned: 0,
        is_external: false,
        external_unit_name: null,
        is_sent_outside: false,
        is_returned: false,
        is_completed: true,
        branch: null,
        unit_name: assignment.unit_name,
        notes: notes || null,
        entered_by: appUser.id,
        forwarded_to_user_id: null,
      });
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
        Plan how much of each material is required for {order.total_qty.toLocaleString()} PCS of{" "}
        {order.style}.
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
