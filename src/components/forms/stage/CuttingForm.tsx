import { useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { useSetCutQuantity } from "../../../hooks/useOrderMutations";
import { getAssignmentQty } from "../../../lib/orderQty";
import { Button } from "../../ui/Button";
import { Input, Textarea } from "../../ui/FormControls";
import { QtyStat, TransferFields, useForwardConfirm, useStageEntryBuilder, useTransferFields } from "./shared";
import type { StageFormProps } from "./types";

export function CuttingForm({ order, assignment, onForwarded }: StageFormProps) {
  const toast = useToast();
  const { createEntry, buildEntry, appUser } = useStageEntryBuilder(order, assignment);
  const setCutQuantity = useSetCutQuantity();
  const transfer = useTransferFields();
  const forwardConfirm = useForwardConfirm();
  const plannedQty = getAssignmentQty(order, assignment);

  const [cutQty, setCutQty] = useState(String(plannedQty));
  const [forwardedQty, setForwardedQty] = useState(String(plannedQty));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPending = createEntry.isPending || setCutQuantity.isPending;

  async function handleForward() {
    if (!appUser) return;
    const cut = Number(cutQty) || 0;
    const forwarded = Number(forwardedQty) || 0;
    if (
      !(await forwardConfirm(assignment.section?.label ?? "this stage", {
        qty: Math.max(plannedQty - forwarded, 0),
        unit: "PCS",
      }))
    )
      return;
    setError(null);
    try {
      // Only an order-wide cut sets the order's fixed cut_quantity; a PO-scoped
      // cut must not overwrite the whole order's baseline with one PO's amount.
      if (!assignment.po_id) {
        await setCutQuantity.mutateAsync({ orderId: order.id, cutQuantity: forwarded });
      }
      await createEntry.mutateAsync(
        buildEntry(
          {
            unit_type: "PCS",
            qty_received: plannedQty,
            qty_completed_today: cut,
            qty_forwarded: forwarded,
            qty_shortage: Math.max(plannedQty - forwarded, 0),
            notes: notes || null,
            ...transfer.values,
          },
          true,
        ),
      );
      toast.success(`Cutting completed — ${forwarded.toLocaleString()} PCS is now the fixed order quantity going forward.`);
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not forward.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
        This is where quantities convert from KG to PCS. Whatever you enter as "Forwarded" below
        becomes the fixed order quantity every later stage compares against.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QtyStat label={assignment.po ? `PO ${assignment.po.po_number} (Planned)` : "Order Qty (Planned)"} value={plannedQty} />
        <Input
          label="Pieces Cut"
          type="number"
          min={0}
          value={cutQty}
          onChange={(e) => setCutQty(e.target.value)}
        />
        <Input
          label="Pieces Forwarded"
          type="number"
          min={0}
          value={forwardedQty}
          onChange={(e) => setForwardedQty(e.target.value)}
        />
      </div>

      <TransferFields
        type={transfer.transferType}
        to={transfer.transferTo}
        onTypeChange={transfer.setTransferType}
        onToChange={transfer.setTransferTo}
      />

      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <Button onClick={handleForward} isLoading={isPending} className="w-full" size="lg">
        Confirm Cutting & Move Forward →
      </Button>
    </div>
  );
}
