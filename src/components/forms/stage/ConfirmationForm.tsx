import { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { useCreateStageEntry } from "../../../hooks/useStageEntries";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/FormControls";
import { formatDisplayDate } from "../../../lib/workflow";
import type { StageFormProps } from "./types";

export function ConfirmationForm({ order, assignment, onForwarded }: StageFormProps) {
  const { appUser } = useAuth();
  const toast = useToast();
  const createEntry = useCreateStageEntry();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleForward() {
    if (!appUser) return;
    setError(null);
    try {
      await createEntry.mutateAsync({
        order_id: order.id,
        po_id: assignment.po_id,
        section_id: assignment.section_id,
        entry_date: new Date().toISOString().slice(0, 10),
        unit_type: "KG",
        qty_received: order.total_qty,
        qty_completed_today: order.total_qty,
        qty_forwarded: order.total_qty,
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
        notes: notes || "Order confirmed.",
        entered_by: appUser.id,
        forwarded_to_user_id: null,
      });
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
          <p className="text-[11px] uppercase tracking-wide text-ink-400">Total Quantity</p>
          <p className="text-sm font-semibold text-ink-900">{order.total_qty.toLocaleString()} PCS</p>
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
