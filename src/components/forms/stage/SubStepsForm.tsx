import { useEffect, useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { useStageSubItems, useUpsertStageSubItem } from "../../../hooks/useStageSubItems";
import { STAGE_SUB_ITEMS } from "../../../lib/stageConfig";
import { getAssignmentFixedQty } from "../../../lib/orderQty";

import { Input, Textarea, Toggle } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import { Badge } from "../../ui/Badge";
import { QtyStat, StageActions, TransferFields, useStageEntryBuilder, useTransferFields } from "./shared";
import type { StageFormProps } from "./types";

export function SubStepsForm({ order, assignment, onForwarded }: StageFormProps) {
  const toast = useToast();
  const stageKey = assignment.section?.key ?? "stitching";
  const items = STAGE_SUB_ITEMS[stageKey] ?? [];
  const fixedQty = getAssignmentFixedQty(order, assignment);

  const subItemsQuery = useStageSubItems(order.id, assignment.section_id);
  const upsertItem = useUpsertStageSubItem();
  const { createEntry, buildEntry, appUser } = useStageEntryBuilder(order, assignment);
  const transfer = useTransferFields();

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

  async function handleForward(isFinal: boolean) {
    if (!appUser) return;
    setError(null);
    try {
      await persistItems();
      const minCompleted = Math.min(...items.map((item) => Number(completed[item.key]) || 0));
      await createEntry.mutateAsync(
        buildEntry(
          {
            unit_type: "PCS",
            qty_received: fixedQty,
            qty_completed_today: minCompleted,
            qty_forwarded: minCompleted,
            qty_shortage: isFinal ? Math.max(fixedQty - minCompleted, 0) : 0,
            notes: notes || null,
            ...transfer.values,
          },
          isFinal,
        ),
      );
      toast.success(
        isFinal
          ? `${assignment.section?.label} completed and forwarded.`
          : `${minCompleted.toLocaleString()} PCS moved forward — this stage stays open for the balance.`,
      );
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not forward.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <QtyStat
        label={assignment.po ? `PO ${assignment.po.po_number} Qty (PCS)` : "Fixed Order Quantity (PCS)"}
        value={fixedQty}
      />

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

      <TransferFields
        type={transfer.transferType}
        to={transfer.transferTo}
        onTypeChange={transfer.setTransferType}
        onToChange={transfer.setTransferTo}
      />

      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      {!allDone && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Not every step is marked Done — you can keep saving progress, or forward now and the
          remaining quantity will be recorded as a shortage.
        </p>
      )}

      <StageActions
        sectionLabel={assignment.section?.label ?? "this stage"}
        unitType="PCS"
        balance={Math.max(
          fixedQty - (items.length ? Math.min(...items.map((i) => Number(completed[i.key]) || 0)) : 0),
          0,
        )}
        isLoading={upsertItem.isPending || createEntry.isPending}
        onSavePlan={handleSaveProgress}
        savePlanLabel="Save Plan (stay open)"
        onMoveForward={() => handleForward(false)}
        onComplete={() => handleForward(true)}
      />
    </div>
  );
}
