import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { useAllStageSubItemsForOrder, useStageSubItems, useUpsertStageSubItem } from "../../../hooks/useStageSubItems";
import { useWorkflowStages } from "../../../hooks/useWorkflowStages";
import { STAGE_SUB_ITEMS } from "../../../lib/stageConfig";
import { Button } from "../../ui/Button";
import { Input, Textarea } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import { Badge } from "../../ui/Badge";
import { TransferFields, useForwardConfirm, useStageEntryBuilder, useTransferFields } from "./shared";
import type { StageFormProps } from "./types";

export function MaterialInwardForm({ order, assignment, onForwarded }: StageFormProps) {
  const toast = useToast();
  const items = STAGE_SUB_ITEMS.raw_material_inward;
  const stagesQuery = useWorkflowStages();
  const allSubItemsQuery = useAllStageSubItemsForOrder(order.id);
  const thisStageItemsQuery = useStageSubItems(order.id, assignment.section_id);
  const upsertItem = useUpsertStageSubItem();
  const { createEntry, buildEntry, appUser } = useStageEntryBuilder(order, assignment);
  const transfer = useTransferFields();
  const forwardConfirm = useForwardConfirm();

  const [received, setReceived] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const planningSectionId = useMemo(
    () => stagesQuery.data?.find((s) => s.key === "raw_material_planning")?.id,
    [stagesQuery.data],
  );

  const plannedByItem = useMemo(() => {
    const map = new Map<string, number>();
    if (!allSubItemsQuery.data || !planningSectionId) return map;
    for (const row of allSubItemsQuery.data) {
      if (row.section_id === planningSectionId) map.set(row.item_key, row.planned_qty);
    }
    return map;
  }, [allSubItemsQuery.data, planningSectionId]);

  useEffect(() => {
    if (!thisStageItemsQuery.data) return;
    const next: Record<string, string> = {};
    for (const item of items) {
      const existing = thisStageItemsQuery.data.find((s) => s.item_key === item.key);
      next[item.key] = existing ? String(existing.completed_qty) : "";
    }
    setReceived(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thisStageItemsQuery.data]);

  const isLoading = stagesQuery.isLoading || allSubItemsQuery.isLoading || thisStageItemsQuery.isLoading;
  if (isLoading) return <Loader label="Loading material plan…" />;

  const totalPending = items.reduce((sum, item) => {
    const planned = plannedByItem.get(item.key) ?? 0;
    const rcv = Number(received[item.key]) || 0;
    return sum + Math.max(planned - rcv, 0);
  }, 0);

  async function persistItems() {
    if (!appUser) return;
    await Promise.all(
      items.map((item) =>
        upsertItem.mutateAsync({
          order_id: order.id,
          section_id: assignment.section_id,
          item_key: item.key,
          item_label: item.label,
          planned_qty: plannedByItem.get(item.key) ?? 0,
          completed_qty: Number(received[item.key]) || 0,
          unit_type: "KG",
          is_completed: (Number(received[item.key]) || 0) >= (plannedByItem.get(item.key) ?? 0),
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
      toast.success("Inward status saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      toast.error(message);
    }
  }

  async function handleForward() {
    if (!appUser) return;
    if (!(await forwardConfirm(assignment.section?.label ?? "this stage", { qty: totalPending, unit: "KG" })))
      return;
    setError(null);
    try {
      await persistItems();
      const totalPlanned = items.reduce((sum, item) => sum + (plannedByItem.get(item.key) ?? 0), 0);
      const totalReceived = items.reduce((sum, item) => sum + (Number(received[item.key]) || 0), 0);
      await createEntry.mutateAsync(
        buildEntry(
          {
            unit_type: "KG",
            // Baseline is the planned qty; forwarded is what actually arrived, so
            // any shortfall is derived correctly on the dashboard.
            qty_received: totalPlanned,
            qty_completed_today: totalReceived,
            qty_forwarded: totalReceived,
            qty_shortage: totalPending,
            notes: notes || null,
            ...transfer.values,
          },
          true,
        ),
      );
      toast.success("Materials confirmed and forwarded to Fabric Processing.");
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
        Confirm how much of each planned material has actually arrived.
      </p>

      <div className="space-y-2">
        {items.map((item) => {
          const planned = plannedByItem.get(item.key) ?? 0;
          const rcv = Number(received[item.key]) || 0;
          const pending = Math.max(planned - rcv, 0);
          return (
            <div key={item.key} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-ink-100 p-3 sm:grid-cols-4">
              <div>
                <p className="text-xs font-semibold text-ink-800">{item.label}</p>
                <p className="text-[11px] text-ink-400">Planned: {planned.toLocaleString()} KG</p>
              </div>
              <Input
                label="Received (KG)"
                type="number"
                min={0}
                value={received[item.key] ?? ""}
                onChange={(e) => setReceived((prev) => ({ ...prev, [item.key]: e.target.value }))}
              />
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wide text-ink-400">Pending</p>
                <p className="text-sm font-bold text-ink-900">{pending.toLocaleString()}</p>
              </div>
              <div className="flex justify-center sm:justify-end">
                <Badge tone={pending > 0 ? "warn" : "good"}>{pending > 0 ? "Pending" : "Complete"}</Badge>
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

      <Textarea
        label="What's missing (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Trims delayed from vendor, expected in 3 days…"
      />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" onClick={handleSaveProgress} isLoading={upsertItem.isPending} className="flex-1">
          Save Progress (stay open)
        </Button>
        <Button onClick={handleForward} isLoading={createEntry.isPending} className="flex-1">
          {totalPending > 0
            ? `Forward & Complete (${totalPending.toLocaleString()} KG short) →`
            : "Forward & Complete →"}
        </Button>
      </div>
    </div>
  );
}
