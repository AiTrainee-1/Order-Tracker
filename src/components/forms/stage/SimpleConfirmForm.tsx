import { useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/FormControls";
import { Textarea } from "../../ui/FormControls";
import { getAssignmentQty } from "../../../lib/orderQty";
import { TransferFields, useForwardConfirm, useStageEntryBuilder, useTransferFields } from "./shared";
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
  const toast = useToast();
  const { createEntry, buildEntry, appUser } = useStageEntryBuilder(order, assignment);
  const transfer = useTransferFields();
  const copy = COPY[assignment.section?.key ?? ""] ?? COPY.po_to_suppliers;
  const qty = getAssignmentQty(order, assignment);
  const forwardConfirm = useForwardConfirm();

  const [confirmed, setConfirmed] = useState(false);
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
            notes: notes || copy.confirmLabel,
            ...transfer.values,
          },
          true,
        ),
      );
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

      <TransferFields
        type={transfer.transferType}
        to={transfer.transferTo}
        onTypeChange={transfer.setTransferType}
        onToChange={transfer.setTransferTo}
      />

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
