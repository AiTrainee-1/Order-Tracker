import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Input, Select, Textarea, Toggle } from "../ui/FormControls";
import type { PurchaseOrder, UnitType } from "../../lib/types";

export interface StageEntryFormValues {
  po_id: string | null;
  entry_date: string;
  qty_received: number;
  qty_completed_today: number;
  qty_forwarded: number;
  qty_shortage: number;
  qty_rejected: number;
  qty_returned: number;
  branch: string;
  unit_name: string;
  is_sent_outside: boolean;
  is_external: boolean;
  external_unit_name: string;
  is_returned: boolean;
  is_completed: boolean;
  notes: string;
}

export function StageEntryForm({
  unitType,
  purchaseOrders,
  lockedPoId,
  onSubmit,
  submitting,
  error,
}: {
  unitType: UnitType;
  purchaseOrders: PurchaseOrder[];
  lockedPoId: string | null;
  onSubmit: (values: StageEntryFormValues) => void;
  submitting: boolean;
  error?: string | null;
}) {
  const [poId, setPoId] = useState(lockedPoId ?? "");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [qtyReceived, setQtyReceived] = useState("");
  const [qtyCompletedToday, setQtyCompletedToday] = useState("");
  const [qtyForwarded, setQtyForwarded] = useState("");
  const [qtyShortage, setQtyShortage] = useState("0");
  const [qtyRejected, setQtyRejected] = useState("0");
  const [qtyReturned, setQtyReturned] = useState("0");
  const [branch, setBranch] = useState("");
  const [unitName, setUnitName] = useState("");
  const [isSentOutside, setIsSentOutside] = useState(false);
  const [isExternal, setIsExternal] = useState(false);
  const [externalUnitName, setExternalUnitName] = useState("");
  const [isReturned, setIsReturned] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [notes, setNotes] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      po_id: poId || null,
      entry_date: entryDate,
      qty_received: Number(qtyReceived) || 0,
      qty_completed_today: Number(qtyCompletedToday) || 0,
      qty_forwarded: Number(qtyForwarded) || 0,
      qty_shortage: Number(qtyShortage) || 0,
      qty_rejected: Number(qtyRejected) || 0,
      qty_returned: Number(qtyReturned) || 0,
      branch,
      unit_name: unitName,
      is_sent_outside: isSentOutside,
      is_external: isExternal,
      external_unit_name: externalUnitName,
      is_returned: isReturned,
      is_completed: isCompleted,
      notes,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Entry Date"
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          required
        />
        {!lockedPoId && purchaseOrders.length > 0 && (
          <Select label="PO (optional)" value={poId} onChange={(e) => setPoId(e.target.value)}>
            <option value="">Not PO-specific</option>
            {purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.po_number}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Input
          label={`Qty Available (${unitType})`}
          type="number"
          min={0}
          value={qtyReceived}
          onChange={(e) => setQtyReceived(e.target.value)}
          required
        />
        <Input
          label="Work Completed Today"
          type="number"
          min={0}
          value={qtyCompletedToday}
          onChange={(e) => setQtyCompletedToday(e.target.value)}
        />
        <Input
          label="Qty Forwarded Next"
          type="number"
          min={0}
          value={qtyForwarded}
          onChange={(e) => setQtyForwarded(e.target.value)}
        />
        <Input
          label="Shortage Qty"
          type="number"
          min={0}
          value={qtyShortage}
          onChange={(e) => setQtyShortage(e.target.value)}
        />
        <Input
          label="Mistake / Rejection Qty"
          type="number"
          min={0}
          value={qtyRejected}
          onChange={(e) => setQtyRejected(e.target.value)}
        />
        <Input
          label="Returned Qty"
          type="number"
          min={0}
          value={qtyReturned}
          onChange={(e) => setQtyReturned(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. Main Factory" />
        <Input label="Unit / Line" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="e.g. Unit 1" />
      </div>

      <div className="space-y-2 rounded-lg border border-ink-100 p-3">
        <Toggle checked={isSentOutside} onChange={setIsSentOutside} label="Sent Outside" description="Work forwarded to another unit/vendor." />
        <Toggle checked={isExternal} onChange={setIsExternal} label="External Unit Movement" description="This batch is being handled by an external/subcontract unit." />
        {isExternal && (
          <Input
            label="External Unit Name"
            value={externalUnitName}
            onChange={(e) => setExternalUnitName(e.target.value)}
            placeholder="Vendor/unit name"
          />
        )}
        <Toggle checked={isReturned} onChange={setIsReturned} label="Returned" description="Batch has returned from outside/external unit." />
        <Toggle checked={isCompleted} onChange={setIsCompleted} label="Section Completed" description="Mark this stage as fully completed for this order." />
      </div>

      <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any other relevant movement information…" />

      {error && <p className="text-sm text-status-bad">{error}</p>}
      <Button type="submit" className="w-full" isLoading={submitting}>
        Submit Entry
      </Button>
    </form>
  );
}
