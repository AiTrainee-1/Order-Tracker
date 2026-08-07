import { useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { Checkbox } from "../../ui/FormControls";
import { Textarea } from "../../ui/FormControls";
import { getAssignmentQty } from "../../../lib/orderQty";
import { StageActions, TransferFields, useStageEntryBuilder, useTransferFields } from "./shared";
import type { StageFormProps } from "./types";

const COPY: Record<
  string,
  { prompt: string; confirmLabel: string; partialHint: string; partialLabel: string }
> = {
  po_to_suppliers: {
    prompt:
      "Have Purchase Orders been raised and approved with the suppliers for this order's material plan?",
    confirmLabel: "All purchased items have physically arrived",
    partialHint:
      "DC / slip raised but the goods haven't landed yet? Move it forward now so the next stage isn't blocked — this stage stays orange until everything arrives and you tick the box below.",
    partialLabel: "DC Raised — Move to Next Stage",
  },
  pattern_marker: {
    prompt:
      "Is the Pattern Card / Marker for this order ready in the Fabric Store, and is the order clear to proceed to Cutting?",
    confirmLabel: "Pattern / Marker is ready",
    partialHint:
      "Part of the pattern set ready? Move it forward so Cutting can start — this stage stays orange until the full set is signed off.",
    partialLabel: "Not Completed — Move to Next Stage",
  },
  checking: {
    prompt: "Has this batch passed final garment checking (AQL / 100% inspection)?",
    confirmLabel: "Checking passed for this quantity",
    partialHint:
      "Only part of the batch checked so far? Move it forward so Ironing isn't held up — this stage stays orange until the rest is checked.",
    partialLabel: "Not Completed — Move to Next Stage",
  },
  ironing: {
    prompt: "Has ironing been completed for this batch?",
    confirmLabel: "Ironing is complete for this quantity",
    partialHint:
      "Only part of the batch ironed so far? Move it forward so Packing isn't held up — this stage stays orange until the rest is done.",
    partialLabel: "Not Completed — Move to Next Stage",
  },
  line_packing: {
    prompt: "Has this batch been packed and is it ready to move to Finishing?",
    confirmLabel: "Packing is complete for this quantity",
    partialHint:
      "Only part of the batch packed so far? Move it forward so Finishing isn't held up — this stage stays orange until the rest is done.",
    partialLabel: "Not Completed — Move to Next Stage",
  },
};

export function SimpleConfirmForm({ order, assignment, onForwarded }: StageFormProps) {
  const toast = useToast();
  const { submitMovement, isPending, appUser } = useStageEntryBuilder(order, assignment);
  const transfer = useTransferFields();
  const copy = COPY[assignment.section?.key ?? ""] ?? COPY.po_to_suppliers;
  const qty = getAssignmentQty(order, assignment);

  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleForward(isFinal: boolean) {
    if (!appUser) return;
    setError(null);
    try {
      await submitMovement({
        base: {
          qty_received: qty,
          qty_completed_today: qty,
          qty_forwarded: qty,
          notes: notes || (isFinal ? copy.confirmLabel : copy.partialLabel),
          ...transfer.values,
        },
        isFinal,
      });
      toast.success(
        isFinal
          ? "Completed and forwarded to the next stage."
          : "Moved forward — this stage stays open until everything arrives.",
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
      <p className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-700">{copy.prompt}</p>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        {copy.partialHint}
      </p>

      <Checkbox checked={confirmed} onChange={setConfirmed} label={copy.confirmLabel} />

      <TransferFields
        type={transfer.transferType}
        to={transfer.transferTo}
        onTypeChange={transfer.setTransferType}
        onToChange={transfer.setTransferTo}
      />

      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <StageActions
        sectionLabel={assignment.section?.label ?? "this stage"}
        unitType="PCS"
        balance={0}
        isLoading={isPending}
        onMoveForward={() => handleForward(false)}
        moveForwardLabel={copy.partialLabel}
        onComplete={() => handleForward(true)}
        completeLabel="Mark Completed & Move Forward →"
        completeDisabled={!confirmed}
      />
    </div>
  );
}
