import { useMemo, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { useAllStageSubItemsForOrder } from "../../../hooks/useStageSubItems";
import { useWorkflowStages } from "../../../hooks/useWorkflowStages";
import { useCreateStageEntry } from "../../../hooks/useStageEntries";
import { FABRIC_PLANNING_ITEM_KEY, FABRIC_PLANNING_STAGE_KEY } from "../../../lib/stageConfig";
import { Button } from "../../ui/Button";
import { Input, Textarea } from "../../ui/FormControls";
import { Loader } from "../../ui/Loader";
import { QtyStat } from "./shared";
import type { StageFormProps } from "./types";

export function StoreCheckForm({ order, assignment, onForwarded }: StageFormProps) {
  const { appUser } = useAuth();
  const toast = useToast();
  const stagesQuery = useWorkflowStages();
  const allSubItemsQuery = useAllStageSubItemsForOrder(order.id);
  const createEntry = useCreateStageEntry();

  const [receivedQty, setReceivedQty] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const planningSectionId = useMemo(
    () => stagesQuery.data?.find((s) => s.key === FABRIC_PLANNING_STAGE_KEY)?.id,
    [stagesQuery.data],
  );
  const plannedFabricQty = useMemo(() => {
    if (!allSubItemsQuery.data || !planningSectionId) return 0;
    return (
      allSubItemsQuery.data.find(
        (row) => row.section_id === planningSectionId && row.item_key === FABRIC_PLANNING_ITEM_KEY,
      )?.planned_qty ?? 0
    );
  }, [allSubItemsQuery.data, planningSectionId]);

  if (stagesQuery.isLoading || allSubItemsQuery.isLoading) return <Loader label="Loading…" />;

  const received = Number(receivedQty) || 0;
  const balance = Math.max(plannedFabricQty - received, 0);

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
        qty_received: plannedFabricQty,
        qty_completed_today: received,
        qty_forwarded: received,
        qty_shortage: balance,
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
      toast.success("Fabric Store verified and forwarded to Pattern Making & Marker Planning.");
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not forward.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-600">Verify how much fabric stock has actually reached the store.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QtyStat label="Planned (KG)" value={plannedFabricQty} />
        <div>
          <Input
            label="Received at Store (KG)"
            type="number"
            min={0}
            value={receivedQty}
            onChange={(e) => setReceivedQty(e.target.value)}
          />
        </div>
        <QtyStat label="Balance" value={balance} tone={balance > 0 ? "bad" : "good"} />
      </div>

      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <Button onClick={handleForward} isLoading={createEntry.isPending} className="w-full" size="lg">
        Forward to Pattern Making & Marker Planning →
      </Button>
    </div>
  );
}
