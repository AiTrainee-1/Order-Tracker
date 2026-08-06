import { useMemo, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { useCreateStageEntry, useRecentStageEntries } from "../../../hooks/useStageEntries";
import { DISPATCH_CONFIG } from "../../../lib/stageConfig";
import { Button } from "../../ui/Button";
import { Input, Textarea, Toggle } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import { QtyStat } from "./shared";
import type { StageFormProps } from "./types";

export function DispatchReturnForm({ order, assignment, onForwarded }: StageFormProps) {
  const { appUser } = useAuth();
  const toast = useToast();
  const createEntry = useCreateStageEntry();
  const entriesQuery = useRecentStageEntries(order.id, assignment.section_id);
  const config = DISPATCH_CONFIG[assignment.section?.key ?? ""] ?? DISPATCH_CONFIG.printing_embroidery;

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
      await createEntry.mutateAsync({
        order_id: order.id,
        po_id: assignment.po_id,
        section_id: assignment.section_id,
        entry_date: new Date().toISOString().slice(0, 10),
        unit_type: "PCS",
        qty_received: order.total_qty,
        qty_completed_today: 0,
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
        notes: "Not required for this order.",
        entered_by: appUser.id,
        forwarded_to_user_id: null,
      });
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
      await createEntry.mutateAsync({
        order_id: order.id,
        po_id: assignment.po_id,
        section_id: assignment.section_id,
        entry_date: new Date().toISOString().slice(0, 10),
        unit_type: "PCS",
        qty_received: order.total_qty,
        qty_completed_today: 0,
        qty_forwarded: Number(sentQty) || 0,
        qty_shortage: 0,
        qty_rejected: 0,
        qty_returned: 0,
        is_external: true,
        external_unit_name: destination || null,
        is_sent_outside: true,
        is_returned: false,
        is_completed: false,
        branch: destination || null,
        unit_name: assignment.unit_name,
        notes: [location && `Location: ${location}`, expectedReturn && `Expected return: ${expectedReturn}`, notes]
          .filter(Boolean)
          .join(" · ") || null,
        entered_by: appUser.id,
        forwarded_to_user_id: null,
      });
      toast.success("Dispatch logged — waiting for it to come back.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save dispatch.";
      setError(message);
      toast.error(message);
    }
  }

  async function handleConfirmReturn() {
    if (!appUser || !pendingSentEntry) return;
    setError(null);
    const sentQtyRef = pendingSentEntry.qty_forwarded;
    const returned = Number(returnedQty) || 0;
    try {
      await createEntry.mutateAsync({
        order_id: order.id,
        po_id: assignment.po_id,
        section_id: assignment.section_id,
        entry_date: new Date().toISOString().slice(0, 10),
        unit_type: "PCS",
        qty_received: sentQtyRef,
        qty_completed_today: returned,
        qty_forwarded: returned,
        qty_shortage: Math.max(sentQtyRef - returned, 0),
        qty_rejected: 0,
        qty_returned: returned,
        is_external: true,
        external_unit_name: pendingSentEntry.external_unit_name,
        is_sent_outside: true,
        is_returned: true,
        is_completed: true,
        branch: pendingSentEntry.branch,
        unit_name: assignment.unit_name,
        notes: notes || null,
        entered_by: appUser.id,
        forwarded_to_user_id: null,
      });
      toast.success("Return confirmed and forwarded to the next stage.");
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not confirm return.";
      setError(message);
      toast.error(message);
    }
  }

  if (pendingSentEntry) {
    const sentQtyRef = pendingSentEntry.qty_forwarded;
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

        <Button onClick={handleConfirmReturn} isLoading={createEntry.isPending} className="w-full" size="lg">
          Confirm Return & Move Forward →
        </Button>
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
