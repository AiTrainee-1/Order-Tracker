import { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { useCreateStageEntry } from "../../../hooks/useStageEntries";
import { useSetCutQuantity } from "../../../hooks/useOrderMutations";
import { Button } from "../../ui/Button";
import { Input, Textarea } from "../../ui/FormControls";
import { QtyStat } from "./shared";
import type { StageFormProps } from "./types";

export function CuttingForm({ order, assignment, onForwarded }: StageFormProps) {
  const { appUser } = useAuth();
  const toast = useToast();
  const createEntry = useCreateStageEntry();
  const setCutQuantity = useSetCutQuantity();

  const [cutQty, setCutQty] = useState(String(order.total_qty));
  const [forwardedQty, setForwardedQty] = useState(String(order.total_qty));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPending = createEntry.isPending || setCutQuantity.isPending;

  async function handleForward() {
    if (!appUser) return;
    setError(null);
    const cut = Number(cutQty) || 0;
    const forwarded = Number(forwardedQty) || 0;
    try {
      await setCutQuantity.mutateAsync({ orderId: order.id, cutQuantity: forwarded });
      await createEntry.mutateAsync({
        order_id: order.id,
        po_id: assignment.po_id,
        section_id: assignment.section_id,
        entry_date: new Date().toISOString().slice(0, 10),
        unit_type: "PCS",
        qty_received: order.total_qty,
        qty_completed_today: cut,
        qty_forwarded: forwarded,
        qty_shortage: Math.max(order.total_qty - forwarded, 0),
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
        <QtyStat label="Order Qty (Planned)" value={order.total_qty} />
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

      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <Button onClick={handleForward} isLoading={isPending} className="w-full" size="lg">
        Confirm Cutting & Move Forward →
      </Button>
    </div>
  );
}
