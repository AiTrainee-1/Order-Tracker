import { useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { useSetCutQuantity, useSetPoCutQuantity } from "../../../hooks/useOrderMutations";
import { Input, Textarea } from "../../ui/FormControls";
import {
  InheritedQtyNote,
  QtyStat,
  SplitRecordsTable,
  StageActions,
  useSplitRecords,
  useStageEntryBuilder,
  useStageQty,
} from "./shared";
import type { StageFormProps } from "./types";

export function CuttingForm({ order, assignment, stageProgress, onForwarded }: StageFormProps) {
  const toast = useToast();
  const { submitMovement, isPending: entryPending, appUser } = useStageEntryBuilder(order, assignment);
  const setCutQuantity = useSetCutQuantity();
  const setPoCutQuantity = useSetPoCutQuantity();
  const qty = useStageQty(order, assignment, stageProgress);
  const splits = useSplitRecords();

  const [cutQty, setCutQty] = useState(String(qty.allotted || ""));
  const [forwardedQty, setForwardedQty] = useState(String(qty.balance || ""));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPending = entryPending || setCutQuantity.isPending || setPoCutQuantity.isPending;
  // Splits, when present, are the source of truth for what moved on.
  const forwarded = splits.records.length > 0 ? splits.totalQty : Number(forwardedQty) || 0;
  const balanceAfter = Math.max(qty.allotted - qty.alreadyForwarded - forwarded, 0);

  async function handleForward(isFinal: boolean) {
    if (!appUser) return;
    setError(null);
    try {
      // The fixed baseline is set on completion only — a partial cut isn't the
      // final number yet. A PO-scoped assignment sets that PO's own baseline;
      // an order-wide one sets the order's.
      if (isFinal) {
        const finalQty = qty.alreadyForwarded + forwarded;
        if (assignment.po_id) {
          await setPoCutQuantity.mutateAsync({
            orderId: order.id,
            poId: assignment.po_id,
            cutQuantity: finalQty,
          });
        } else {
          await setCutQuantity.mutateAsync({ orderId: order.id, cutQuantity: finalQty });
        }
      }
      await submitMovement({
        base: {
          unit_type: "PCS",
          qty_received: qty.allotted,
          qty_completed_today: Number(cutQty) || forwarded,
          qty_forwarded: forwarded,
          notes: notes || null,
        },
        splits: splits.records,
        isFinal,
      });
      toast.success(
        isFinal
          ? `Cutting completed — ${(qty.alreadyForwarded + forwarded).toLocaleString()} PCS is now the fixed order quantity.`
          : `${forwarded.toLocaleString()} PCS moved forward. Cutting stays open for the balance.`,
      );
      splits.reset();
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
        This is where quantities convert from KG to PCS. The total forwarded from here becomes the
        fixed order quantity every later stage compares against — set when you complete the stage.
      </p>

      <InheritedQtyNote qty={qty} stageProgress={stageProgress} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <QtyStat label="Allotted (PCS)" value={qty.allotted} />
        <QtyStat label="Already cut & sent" value={qty.alreadyForwarded} />
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
          disabled={splits.records.length > 0}
        />
      </div>

      <SplitRecordsTable
        records={splits.records}
        unitType="PCS"
        allotted={qty.allotted}
        alreadyForwarded={qty.alreadyForwarded}
        onAdd={splits.addRecord}
        onUpdate={splits.updateRecord}
        onRemove={splits.removeRecord}
      />

      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <StageActions
        sectionLabel={assignment.section?.label ?? "Cutting"}
        unitType="PCS"
        balance={balanceAfter}
        isLoading={isPending}
        onMoveForward={() => handleForward(false)}
        onComplete={() => handleForward(true)}
        completeLabel="Confirm Cutting & Move Forward →"
      />
    </div>
  );
}
