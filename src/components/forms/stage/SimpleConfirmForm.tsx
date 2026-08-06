import { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { useCreateStageEntry } from "../../../hooks/useStageEntries";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/FormControls";
import { Textarea } from "../../ui/FormControls";
import type { StageFormProps } from "./types";

const COPY: Record<string, { prompt: string; confirmLabel: string }> = {
  po_to_suppliers: {
    prompt: "Have Purchase Orders been raised and approved with the suppliers for this order's material plan?",
    confirmLabel: "Purchase Orders placed with suppliers",
  },
  pattern_marker: {
    prompt: "Is the Pattern Card / Marker for this order ready in the Fabric Store, and is the order clear to proceed to Cutting?",
    confirmLabel: "Pattern / Marker is ready",
  },
};

export function SimpleConfirmForm({ order, assignment, onForwarded }: StageFormProps) {
  const { appUser } = useAuth();
  const toast = useToast();
  const createEntry = useCreateStageEntry();
  const copy = COPY[assignment.section?.key ?? ""] ?? COPY.po_to_suppliers;

  const [confirmed, setConfirmed] = useState(false);
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
        notes: notes || copy.confirmLabel,
        entered_by: appUser.id,
        forwarded_to_user_id: null,
      });
      toast.success("Forwarded to the next stage.");
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not forward.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-700">{copy.prompt}</p>

      <Checkbox checked={confirmed} onChange={setConfirmed} label={copy.confirmLabel} />

      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <Button
        onClick={handleForward}
        isLoading={createEntry.isPending}
        disabled={!confirmed}
        className="w-full"
        size="lg"
      >
        Mark Completed & Move Forward →
      </Button>
    </div>
  );
}
