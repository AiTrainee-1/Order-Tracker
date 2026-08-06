import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { useStageSubItems, useUpsertStageSubItem } from "../../../hooks/useStageSubItems";
import { useCreateStageEntry } from "../../../hooks/useStageEntries";
import { STAGE_SUB_ITEMS } from "../../../lib/stageConfig";
import { getFixedOrderQty } from "../../../lib/orderQty";
import { Button } from "../../ui/Button";
import { Input, Textarea, Toggle } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import { Badge } from "../../ui/Badge";
import { QtyStat } from "./shared";
import type { StageFormProps } from "./types";

export function SubStepsForm({ order, assignment, onForwarded }: StageFormProps) {
  const { appUser } = useAuth();
  const toast = useToast();
  const stageKey = assignment.section?.key ?? "sewing";
  const items = STAGE_SUB_ITEMS[stageKey] ?? [];
  const fixedQty = getFixedOrderQty(order);

  const subItemsQuery = useStageSubItems(order.id, assignment.section_id);
  const upsertItem = useUpsertStageSubItem();
  const createEntry = useCreateStageEntry();

  const [completed, setCompleted] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subItemsQuery.data) return;
    const nextQty: Record<string, string> = {};
    const nextDone: Record<string, boolean> = {};
    for (const item of items) {
      const existing = subItemsQuery.data.find((s) => s.item_key === item.key);
      nextQty[item.key] = existing ? String(existing.completed_qty) : "";
      nextDone[item.key] = existing?.is_completed ?? false;
    }
    setCompleted(nextQty);
    setDone(nextDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subItemsQuery.data]);

  if (subItemsQuery.isLoading) return <Loader label="Loading steps…" />;

  const allDone = items.length > 0 && items.every((item) => done[item.key]);

  async function persistItems() {
    if (!appUser) return;
    await Promise.all(
      items.map((item) =>
        upsertItem.mutateAsync({
          order_id: order.id,
          section_id: assignment.section_id,
          item_key: item.key,
          item_label: item.label,
          planned_qty: fixedQty,
          completed_qty: Number(completed[item.key]) || 0,
          unit_type: "PCS",
          is_completed: !!done[item.key],
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
      toast.success("Progress saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      toast.error(message);
    }
  }

  async function handleForward() {
    if (!appUser) return;
    setError(null);
    try {
      await persistItems();
      const minCompleted = Math.min(...items.map((item) => Number(completed[item.key]) || 0));
      await createEntry.mutateAsync({
        order_id: order.id,
        po_id: assignment.po_id,
        section_id: assignment.section_id,
        entry_date: new Date().toISOString().slice(0, 10),
        unit_type: "PCS",
        qty_received: fixedQty,
        qty_completed_today: minCompleted,
        qty_forwarded: minCompleted,
        qty_shortage: Math.max(fixedQty - minCompleted, 0),
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
      toast.success(`${assignment.section?.label} completed and forwarded.`);
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not forward.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <QtyStat label="Fixed Order Quantity (PCS)" value={fixedQty} />

      <div className="space-y-2">
        {items.map((item) => {
          const qty = Number(completed[item.key]) || 0;
          const balance = Math.max(fixedQty - qty, 0);
          return (
            <div key={item.key} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-ink-100 p-3 sm:grid-cols-5">
              <p className="text-xs font-semibold text-ink-800 sm:col-span-1">{item.label}</p>
              <Input
                label="Completed (PCS)"
                type="number"
                min={0}
                value={completed[item.key] ?? ""}
                onChange={(e) => setCompleted((prev) => ({ ...prev, [item.key]: e.target.value }))}
              />
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wide text-ink-400">Balance</p>
                <p className="text-sm font-bold text-ink-900">{balance.toLocaleString()}</p>
              </div>
              <div className="sm:col-span-1">
                <Toggle checked={!!done[item.key]} onChange={(v) => setDone((prev) => ({ ...prev, [item.key]: v }))} label="Done" />
              </div>
              <div className="flex justify-center sm:justify-end">
                <Badge tone={done[item.key] ? "good" : balance > 0 ? "warn" : "neutral"}>
                  {done[item.key] ? "Completed" : "In Progress"}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>

      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" onClick={handleSaveProgress} isLoading={upsertItem.isPending} className="flex-1">
          Save Progress
        </Button>
        <Button
          onClick={handleForward}
          isLoading={createEntry.isPending}
          disabled={!allDone}
          className="flex-1"
          title={!allDone ? "Mark every step Done before forwarding" : undefined}
        >
          {allDone ? "Forward to Next Stage →" : "Complete all steps to forward"}
        </Button>
      </div>
    </div>
  );
}
