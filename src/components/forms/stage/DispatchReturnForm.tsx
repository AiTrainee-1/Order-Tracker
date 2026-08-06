import { useMemo, useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { useRecentStageEntries } from "../../../hooks/useStageEntries";
import { DISPATCH_CONFIG } from "../../../lib/stageConfig";
import { getAssignmentQty } from "../../../lib/orderQty";
import { Button } from "../../ui/Button";
import { Input, Textarea, Toggle } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import { QtyStat, StageActions, useStageEntryBuilder } from "./shared";
import type { TransferType } from "../../../lib/types";
import type { StageFormProps } from "./types";

export function DispatchReturnForm({ order, assignment, onForwarded }: StageFormProps) {
  const toast = useToast();
  const { createEntry, buildEntry, appUser } = useStageEntryBuilder(order, assignment);
  const entriesQuery = useRecentStageEntries(order.id, assignment.section_id);
  const stageKey = assignment.section?.key ?? "";
  const config = DISPATCH_CONFIG[stageKey] ?? DISPATCH_CONFIG.printing_embroidery;
  // Printing/embroidery and washing both leave the factory, so record them as an
  // outside transfer — it surfaces on the dashboard and counts in the movement.
  const transferType: Exclude<TransferType, "none"> = "outside";
  const qty = getAssignmentQty(order, assignment);

  const [isRequired, setIsRequired] = useState(true);
  const [sentQty, setSentQty] = useState("");
  const [destination, setDestination] = useState("");
  const [location, setLocation] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [returnedQty, setReturnedQty] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pendingSentEntry = useMemo(
    () => (entriesQuery.data ?? []).find((e) => e.is_sent_outside && !e.is_completed),
    [entriesQuery.data],
  );

  if (entriesQuery.isLoading) return <Loader label="Loading dispatch status…" />;

  async function handleSkip() {
    if (!appUser) return;
    setError(null);
    try {
      await createEntry.mutateAsync(
        buildEntry(
          {
            unit_type: "PCS",
            qty_received: qty,
            qty_forwarded: qty,
            notes: "Not required for this order.",
          },
          true,
        ),
      );
      toast.success("Marked as not required, forwarded to the next stage.");
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not forward.";
      setError(message);
      toast.error(message);
    }
  }

  async function handleSend() {
    if (!appUser) return;
    setError(null);
    try {
      // Send-out entry: nothing forwarded to the NEXT stage yet (forwarded = 0);
      // the sent qty is parked in qty_completed_today until it returns.
      await createEntry.mutateAsync(
        buildEntry(
          {
            unit_type: "PCS",
            qty_received: qty,
            qty_completed_today: Number(sentQty) || 0,
            qty_forwarded: 0,
            is_external: true,
            external_unit_name: destination || null,
            is_sent_outside: true,
            branch: destination || null,
            transfer_type: transferType,
            transfer_to: destination || null,
            notes:
              [location && `Location: ${location}`, expectedReturn && `Expected return: ${expectedReturn}`, notes]
                .filter(Boolean)
                .join(" · ") || null,
          },
          false,
        ),
      );
      toast.success("Dispatch logged — waiting for it to come back.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save dispatch.";
      setError(message);
      toast.error(message);
    }
  }

  async function handleConfirmReturn(isFinal: boolean) {
    if (!appUser || !pendingSentEntry) return;
    const sentQtyRef = pendingSentEntry.qty_completed_today || pendingSentEntry.qty_forwarded;
    const returned = Number(returnedQty) || 0;
    setError(null);
    try {
      await createEntry.mutateAsync(
        buildEntry(
          {
            unit_type: "PCS",
            qty_received: qty,
            qty_completed_today: returned,
            qty_forwarded: returned,
            qty_shortage: isFinal ? Math.max(sentQtyRef - returned, 0) : 0,
            qty_returned: returned,
            is_external: true,
            external_unit_name: pendingSentEntry.external_unit_name,
            is_sent_outside: true,
            is_returned: true,
            branch: pendingSentEntry.branch,
            transfer_type: transferType,
            transfer_to: pendingSentEntry.transfer_to ?? pendingSentEntry.branch,
            notes: notes || null,
          },
          isFinal,
        ),
      );
      toast.success(
        isFinal
          ? "Return confirmed and forwarded to the next stage."
          : `${returned.toLocaleString()} PCS moved forward — this stage stays open for the rest of the consignment.`,
      );
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not confirm return.";
      setError(message);
      toast.error(message);
    }
  }

  if (pendingSentEntry) {
    const sentQtyRef = pendingSentEntry.qty_completed_today || pendingSentEntry.qty_forwarded;
    const returned = Number(returnedQty) || 0;
    return (
      <div className="space-y-5">
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
          {sentQtyRef.toLocaleString()} PCS sent to{" "}
          <span className="font-semibold">{pendingSentEntry.external_unit_name || "external unit"}</span> on{" "}
          {pendingSentEntry.entry_date}. Enter the returned quantity once it's back.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <QtyStat label="Sent" value={sentQtyRef} />
          <Input
            label="Pieces Returned"
            type="number"
            min={0}
            value={returnedQty}
            onChange={(e) => setReturnedQty(e.target.value)}
          />
          <QtyStat
            label="Shortfall"
            value={Math.max(sentQtyRef - returned, 0)}
            tone={sentQtyRef - returned > 0 ? "bad" : "good"}
          />
        </div>

        <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {error && <p className="text-sm text-status-bad">{error}</p>}

        <StageActions
          sectionLabel={assignment.section?.label ?? "this stage"}
          unitType="PCS"
          balance={Math.max(sentQtyRef - returned, 0)}
          isLoading={createEntry.isPending}
          onMoveForward={() => handleConfirmReturn(false)}
          moveForwardLabel="Part Returned — Move to Next Stage"
          onComplete={() => handleConfirmReturn(true)}
          completeLabel="Confirm Return & Move Forward →"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Toggle
        checked={isRequired}
        onChange={setIsRequired}
        label={`Is ${assignment.section?.label} required for this order?`}
        description="Turn off if this order skips this stage entirely."
      />

      {!isRequired ? (
        <Button onClick={handleSkip} isLoading={createEntry.isPending} className="w-full" size="lg">
          Not Required — Forward to Next Stage →
        </Button>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Pieces Being Sent"
              type="number"
              min={0}
              value={sentQty}
              onChange={(e) => setSentQty(e.target.value)}
            />
            <Input
              label={config.destinationLabel}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
            {config.showLocation && (
              <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
            )}
            {config.showExpectedReturn && (
              <Input
                label="Expected Return Date"
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
              />
            )}
          </div>

          <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

          {error && <p className="text-sm text-status-bad">{error}</p>}

          <Button onClick={handleSend} isLoading={createEntry.isPending} className="w-full" size="lg">
            Mark as Sent
          </Button>
        </>
      )}
    </div>
  );
}
