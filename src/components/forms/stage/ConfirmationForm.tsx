import { useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/FormControls";
import { formatDisplayDate } from "../../../lib/workflow";
import { getAssignmentQty } from "../../../lib/orderQty";
import { TransferFields, useForwardConfirm, useStageEntryBuilder, useTransferFields } from "./shared";
import type { StageFormProps } from "./types";

export function ConfirmationForm({ order, assignment, onForwarded }: StageFormProps) {
  const toast = useToast();
  const { createEntry, buildEntry, appUser } = useStageEntryBuilder(order, assignment);
  const transfer = useTransferFields();
  const forwardConfirm = useForwardConfirm();
  const qty = getAssignmentQty(order, assignment);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleForward() {
    if (!appUser) return;
    if (!(await forwardConfirm(assignment.section?.label ?? "this stage"))) return;
    setError(null);
    try {
      await createEntry.mutateAsync(
        buildEntry(
          {
            qty_received: qty,
            qty_completed_today: qty,
            qty_forwarded: qty,
            notes: notes || "Order confirmed.",
            ...transfer.values,
          },
          true,
        ),
      );
      toast.success("Order confirmed and forwarded to Raw Material Planning.");
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not confirm order.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-400">Style</p>
          <p className="text-sm font-semibold text-ink-900">{order.style}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-400">IO / No</p>
          <p className="text-sm font-semibold text-ink-900">{order.io_no}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-400">Color</p>
          <p className="text-sm font-semibold text-ink-900">{order.color}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-400">
            {assignment.po ? `PO ${assignment.po.po_number} Qty` : "Total Quantity"}
          </p>
          <p className="text-sm font-semibold text-ink-900">{qty.toLocaleString()} PCS</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-400">Description</p>
          <p className="text-sm text-ink-800">{order.description || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-400">Delivery Date</p>
          <p className="text-sm text-ink-800">{formatDisplayDate(order.delivery_date)}</p>
        </div>
      </div>
      <p className="text-xs text-ink-500">{order.fabric}</p>

      <TransferFields
        type={transfer.transferType}
        to={transfer.transferTo}
        onTypeChange={transfer.setTransferType}
        onToChange={transfer.setTransferTo}
      />

      <Textarea
        label="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Any confirmation notes…"
      />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <Button onClick={handleForward} isLoading={createEntry.isPending} className="w-full" size="lg">
        Confirm Order & Move Forward →
      </Button>
    </div>
  );
}
