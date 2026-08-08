import { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useConfirm } from "../../../context/ConfirmContext";
import { useToast } from "../../../context/ToastContext";
import {
  useDeleteMaterialEntry,
  useDeleteRequirement,
  useRecordAudit,
  useSaveMaterialEntry,
  useSaveRequirement,
  diffFields,
} from "../../../hooks/useProductionChain";
import { buildRequirementFlow, type RequirementFlow } from "../../../lib/chain";
import { formatDisplayDate } from "../../../lib/workflow";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Checkbox, Input, Select, Textarea } from "../../ui/FormControls";
import { Section, QtyBox } from "./chainShared";
import type {
  MaterialCategory,
  MaterialEntry,
  MaterialEntryType,
  MaterialRequirement,
} from "../../../lib/types";

/**
 * Yarn and fabric, from requirement through to store.
 *
 * Raw Material Planning, PO to Suppliers and Raw Material Inward are three
 * screens over ONE set of rows: a requirement ("40s — 500 KG") and a ledger of
 * entries against it. Each screen edits the entry types it owns and shows the
 * others read-only, which is why Inward can display planned/dispatched/received
 * without the storekeeper re-typing anything the planner or buyer already
 * entered — and why the three can never disagree.
 */

const ENTRY_LABEL: Record<MaterialEntryType, string> = {
  plan: "Planned",
  dc: "Dispatched (DC)",
  receipt: "Received",
  inward: "Store Inward",
};

export interface MaterialLedgerProps {
  orderId: string;
  poId: string | null;
  sectionId: string;
  flows: RequirementFlow[];
  /** Which categories this stage shows. */
  categories: MaterialCategory[];
  /** Whether the yarn-count / fabric-type rows themselves can be added,
   * renamed and removed here. Only Raw Material Planning owns that. */
  canEditRequirements: boolean;
  /** Entry types this stage records. */
  entryTypes: MaterialEntryType[];
  onSaved: () => void;
}

const CATEGORY_TITLE: Record<MaterialCategory, string> = {
  yarn: "Yarn Counts",
  fabric: "Fabric",
};

const CATEGORY_HINT: Record<MaterialCategory, string> = {
  yarn: "Add the counts this order needs — 40s, 30s, 20s, 150s. They aren't a fixed list; add, rename or remove as the plan changes.",
  fabric: "Fabric types and the kilos required of each.",
};

export function MaterialLedger({
  orderId,
  poId,
  sectionId,
  flows,
  categories,
  canEditRequirements,
  entryTypes,
  onSaved,
}: MaterialLedgerProps) {
  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <CategoryBlock
          key={category}
          category={category}
          orderId={orderId}
          poId={poId}
          sectionId={sectionId}
          flows={flows.filter((f) => f.requirement.category === category)}
          canEditRequirements={canEditRequirements}
          entryTypes={entryTypes}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}

function CategoryBlock({
  category,
  orderId,
  poId,
  sectionId,
  flows,
  canEditRequirements,
  entryTypes,
  onSaved,
}: {
  category: MaterialCategory;
  orderId: string;
  poId: string | null;
  sectionId: string;
  flows: RequirementFlow[];
  canEditRequirements: boolean;
  entryTypes: MaterialEntryType[];
  onSaved: () => void;
}) {
  const { appUser } = useAuth();
  const toast = useToast();
  const saveRequirement = useSaveRequirement();
  const recordAudit = useRecordAudit();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totals = flows.reduce(
    (acc, f) => ({
      required: acc.required + f.totals.required,
      planned: acc.planned + f.totals.planned,
      dc: acc.dc + f.totals.dc,
      received: acc.received + f.totals.received,
      inward: acc.inward + f.totals.inward,
    }),
    { required: 0, planned: 0, dc: 0, received: 0, inward: 0 },
  );

  async function addRequirement() {
    const name = newName.trim();
    if (!name || !appUser) return;
    try {
      await saveRequirement.mutateAsync({
        input: {
          order_id: orderId,
          po_id: poId,
          category,
          name,
          required_qty: Number(newQty) || 0,
          unit: "KG",
          supplier: null,
          sort_order: flows.length,
          is_completed: false,
          notes: null,
          created_by: appUser.id,
        },
        userId: appUser.id,
      });
      await recordAudit.mutateAsync({
        order_id: orderId,
        po_id: poId,
        section_id: sectionId,
        entity: "material_requirement",
        entity_id: null,
        action: "create",
        summary: `${CATEGORY_TITLE[category]}: added ${name} — ${(Number(newQty) || 0).toLocaleString()} KG required`,
        changes: null,
        notes: null,
        user_id: appUser.id,
      });
      setNewName("");
      setNewQty("");
      setAdding(false);
      onSaved();
      toast.show(`${name} added.`, "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not add it.", "error");
    }
  }

  return (
    <Section title={CATEGORY_TITLE[category]} subtitle={CATEGORY_HINT[category]}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <QtyBox label="Required" value={totals.required} unit="KG" />
        <QtyBox label="Planned" value={totals.planned} unit="KG" />
        <QtyBox label="Dispatched" value={totals.dc} unit="KG" />
        <QtyBox label="Received" value={totals.received} unit="KG" tone="good" />
        <QtyBox
          label="Balance"
          value={Math.max(totals.required - totals.received, 0)}
          unit="KG"
          tone={totals.required - totals.received > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-3 space-y-2">
        {flows.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-200 px-3 py-5 text-center text-sm text-ink-400">
            No {category === "yarn" ? "yarn counts" : "fabric types"} added yet.
          </p>
        )}

        {flows.map((flow) => (
          <RequirementRow
            key={flow.requirement.id}
            flow={flow}
            orderId={orderId}
            poId={poId}
            sectionId={sectionId}
            canEditRequirements={canEditRequirements}
            entryTypes={entryTypes}
            expanded={expandedId === flow.requirement.id}
            onToggle={() =>
              setExpandedId((prev) => (prev === flow.requirement.id ? null : flow.requirement.id))
            }
            onSaved={onSaved}
          />
        ))}
      </div>

      {canEditRequirements &&
        (adding ? (
          <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            <Input
              label={category === "yarn" ? "Yarn count" : "Fabric type"}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={category === "yarn" ? "e.g. 40s" : "e.g. Single Jersey"}
              autoFocus
            />
            <Input
              label="Required (KG)"
              type="number"
              min={0}
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="w-32"
            />
            <Button type="button" size="sm" onClick={addRequirement} isLoading={saveRequirement.isPending} className="mb-0.5">
              Add
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)} className="mb-0.5">
              Cancel
            </Button>
          </div>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)} className="mt-2">
            + Add {category === "yarn" ? "Yarn Count" : "Fabric"}
          </Button>
        ))}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function RequirementRow({
  flow,
  orderId,
  poId,
  sectionId,
  canEditRequirements,
  entryTypes,
  expanded,
  onToggle,
  onSaved,
}: {
  flow: RequirementFlow;
  orderId: string;
  poId: string | null;
  sectionId: string;
  canEditRequirements: boolean;
  entryTypes: MaterialEntryType[];
  expanded: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const { requirement: req, totals, balance } = flow;
  const { appUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const saveRequirement = useSaveRequirement();
  const deleteRequirement = useDeleteRequirement();
  const recordAudit = useRecordAudit();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(req.name);
  const [required, setRequired] = useState(String(req.required_qty));
  const [reason, setReason] = useState("");

  async function toggleCompleted(next: boolean) {
    if (!appUser) return;
    await saveRequirement.mutateAsync({
      id: req.id,
      input: { order_id: orderId, is_completed: next },
      userId: appUser.id,
    });
    await recordAudit.mutateAsync({
      order_id: orderId,
      po_id: poId,
      section_id: sectionId,
      entity: "material_requirement",
      entity_id: req.id,
      action: "update",
      summary: `${req.name} marked ${next ? "completed" : "not completed"}`,
      changes: { is_completed: { from: req.is_completed, to: next } },
      notes: null,
      user_id: appUser.id,
    });
    onSaved();
  }

  async function saveEdit() {
    if (!appUser) return;
    const patch = { name: name.trim(), required_qty: Number(required) || 0 };
    const changes = diffFields(req as unknown as Record<string, unknown>, patch);
    if (!changes) {
      setEditing(false);
      return;
    }
    if (!reason.trim()) {
      toast.show("Add a reason — it's kept in the audit trail.", "error");
      return;
    }
    try {
      await saveRequirement.mutateAsync({
        id: req.id,
        input: { order_id: orderId, ...patch },
        userId: appUser.id,
      });
      await recordAudit.mutateAsync({
        order_id: orderId,
        po_id: poId,
        section_id: sectionId,
        entity: "material_requirement",
        entity_id: req.id,
        action: "update",
        summary: `${req.name} updated`,
        changes,
        notes: reason.trim(),
        user_id: appUser.id,
      });
      setEditing(false);
      setReason("");
      onSaved();
      toast.show("Updated.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not update.", "error");
    }
  }

  async function remove() {
    if (!appUser) return;
    const ok = await confirm({
      title: `Remove ${req.name}?`,
      message: `This deletes the requirement and its ${flow.entries.length} entr${flow.entries.length === 1 ? "y" : "ies"}. It can't be undone.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    await deleteRequirement.mutateAsync({ id: req.id, orderId });
    await recordAudit.mutateAsync({
      order_id: orderId,
      po_id: poId,
      section_id: sectionId,
      entity: "material_requirement",
      entity_id: req.id,
      action: "delete",
      summary: `${req.name} removed`,
      changes: null,
      notes: null,
      user_id: appUser.id,
    });
    onSaved();
  }

  return (
    <div className="rounded-xl border border-ink-100 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`text-ink-400 transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
          <span className="truncate text-sm font-bold text-ink-900">{req.name}</span>
          {req.is_completed && <Badge tone="good">Completed</Badge>}
        </button>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <Figure label="Required" value={totals.required} />
          <Figure label="Received" value={totals.received} tone="good" />
          <Figure label="Balance" value={balance} tone={balance > 0 ? "warn" : "good"} />
        </div>

        {canEditRequirements && (
          <div className="flex items-center gap-1.5">
            <Checkbox checked={req.is_completed} onChange={toggleCompleted} label="" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              Edit
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-status-bad hover:bg-red-50" onClick={remove}>
              Remove
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <div className="space-y-2 border-t border-ink-100 bg-amber-50/50 px-3 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label="Required (KG)"
              type="number"
              min={0}
              value={required}
              onChange={(e) => setRequired(e.target.value)}
            />
          </div>
          <Input
            label="Reason for the change (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Additional requirement raised by production"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={saveEdit} isLoading={saveRequirement.isPending}>
              Update
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="border-t border-ink-100 px-3 py-3">
          <EntryLedger
            requirementId={req.id}
            requirementName={req.name}
            entries={flow.entries}
            entryTypes={entryTypes}
            orderId={orderId}
            poId={poId}
            sectionId={sectionId}
            onSaved={onSaved}
          />
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-status-good" : tone === "warn" ? "text-amber-600" : "text-ink-700";
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink-400">{label} </span>
      <span className={`font-bold tabular-nums ${color}`}>{value.toLocaleString()}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The per-requirement entry ledger
// ---------------------------------------------------------------------------

function EntryLedger({
  requirementId,
  requirementName,
  entries,
  entryTypes,
  orderId,
  poId,
  sectionId,
  onSaved,
}: {
  requirementId: string;
  requirementName: string;
  entries: MaterialEntry[];
  entryTypes: MaterialEntryType[];
  orderId: string;
  poId: string | null;
  sectionId: string;
  onSaved: () => void;
}) {
  const { appUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const saveEntry = useSaveMaterialEntry();
  const deleteEntry = useDeleteMaterialEntry();
  const recordAudit = useRecordAudit();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(() => blankEntryForm(entryTypes[0]));

  function reset() {
    setForm(blankEntryForm(entryTypes[0]));
    setAdding(false);
    setEditingId(null);
  }

  async function submit() {
    if (!appUser) return;
    const qty = Number(form.qty) || 0;
    if (qty <= 0) {
      toast.show("Enter a quantity.", "error");
      return;
    }

    const input = {
      requirement_id: requirementId,
      entry_type: form.entryType,
      qty,
      entry_date: form.entryDate,
      supplier: form.supplier.trim() || null,
      doc_no: form.docNo.trim() || null,
      doc_date: form.docDate || null,
      lot_ref: form.lotRef.trim() || null,
      notes: form.notes.trim() || null,
      entered_by: appUser.id,
    };

    try {
      if (editingId) {
        const original = entries.find((e) => e.id === editingId);
        const changes = original
          ? diffFields(original as unknown as Record<string, unknown>, input)
          : null;
        await saveEntry.mutateAsync({ id: editingId, input, userId: appUser.id, orderId });
        await recordAudit.mutateAsync({
          order_id: orderId,
          po_id: poId,
          section_id: sectionId,
          entity: "material_entry",
          entity_id: editingId,
          action: "update",
          summary: `${requirementName}: ${ENTRY_LABEL[form.entryType]} entry corrected`,
          changes,
          notes: form.notes.trim() || null,
          user_id: appUser.id,
        });
      } else {
        await saveEntry.mutateAsync({ input, userId: appUser.id, orderId });
        await recordAudit.mutateAsync({
          order_id: orderId,
          po_id: poId,
          section_id: sectionId,
          entity: "material_entry",
          entity_id: null,
          action: "create",
          summary: `${requirementName}: ${ENTRY_LABEL[form.entryType]} ${qty.toLocaleString()} KG`,
          changes: null,
          notes: form.notes.trim() || null,
          user_id: appUser.id,
        });
      }
      reset();
      onSaved();
      toast.show("Updated.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save.", "error");
    }
  }

  async function remove(entry: MaterialEntry) {
    if (!appUser) return;
    const ok = await confirm({
      title: "Delete this entry?",
      message: `${ENTRY_LABEL[entry.entry_type]} of ${entry.qty.toLocaleString()} KG on ${formatDisplayDate(entry.entry_date)}. The cumulative totals will change.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    await deleteEntry.mutateAsync({ id: entry.id, orderId });
    await recordAudit.mutateAsync({
      order_id: orderId,
      po_id: poId,
      section_id: sectionId,
      entity: "material_entry",
      entity_id: entry.id,
      action: "delete",
      summary: `${requirementName}: ${ENTRY_LABEL[entry.entry_type]} entry of ${entry.qty.toLocaleString()} KG deleted`,
      changes: null,
      notes: null,
      user_id: appUser.id,
    });
    onSaved();
  }

  function beginEdit(entry: MaterialEntry) {
    setEditingId(entry.id);
    setAdding(true);
    setForm({
      entryType: entry.entry_type,
      qty: String(entry.qty),
      entryDate: entry.entry_date,
      supplier: entry.supplier ?? "",
      docNo: entry.doc_no ?? "",
      docDate: entry.doc_date ?? "",
      lotRef: entry.lot_ref ?? "",
      notes: entry.notes ?? "",
    });
  }

  // Running cumulative is computed per entry type so a DC entry doesn't inflate
  // the received total.
  const runningByType = new Map<MaterialEntryType, number>();

  return (
    <div className="space-y-2">
      {entries.length === 0 ? (
        <p className="text-xs text-ink-400">No entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-100">
          <table className="w-full min-w-[620px] text-xs">
            <thead>
              <tr className="bg-ink-50 uppercase tracking-wide text-ink-500">
                <th className="px-2.5 py-2 text-left font-semibold">Date</th>
                <th className="px-2.5 py-2 text-left font-semibold">Type</th>
                <th className="px-2.5 py-2 text-left font-semibold">Supplier / DC</th>
                <th className="px-2.5 py-2 text-right font-semibold">Qty</th>
                <th className="px-2.5 py-2 text-right font-semibold">Cumulative</th>
                <th className="px-2.5 py-2 text-left font-semibold">Notes</th>
                <th className="px-2.5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {entries.map((e) => {
                const running = (runningByType.get(e.entry_type) ?? 0) + e.qty;
                runningByType.set(e.entry_type, running);
                const editable = entryTypes.includes(e.entry_type);
                return (
                  <tr key={e.id} className="bg-white">
                    <td className="whitespace-nowrap px-2.5 py-2 text-ink-500">{formatDisplayDate(e.entry_date)}</td>
                    <td className="px-2.5 py-2">
                      <Badge tone={e.entry_type === "receipt" || e.entry_type === "inward" ? "good" : "neutral"}>
                        {ENTRY_LABEL[e.entry_type]}
                      </Badge>
                    </td>
                    <td className="px-2.5 py-2 text-ink-600">
                      {[e.supplier, e.doc_no].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{e.qty.toLocaleString()}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-ink-500">{running.toLocaleString()}</td>
                    <td className="max-w-[16rem] truncate px-2.5 py-2 text-ink-500">{e.notes ?? "—"}</td>
                    <td className="px-2.5 py-2 text-right">
                      {editable && (
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="sm" onClick={() => beginEdit(e)}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-status-bad hover:bg-red-50"
                            onClick={() => remove(e)}
                          >
                            ✕
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div className="space-y-2 rounded-lg border border-ink-100 bg-ink-50/60 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {entryTypes.length > 1 && (
              <Select
                label="Entry type"
                value={form.entryType}
                onChange={(e) => setForm({ ...form, entryType: e.target.value as MaterialEntryType })}
              >
                {entryTypes.map((t) => (
                  <option key={t} value={t}>
                    {ENTRY_LABEL[t]}
                  </option>
                ))}
              </Select>
            )}
            <Input
              label="Quantity (KG)"
              type="number"
              min={0}
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
              autoFocus
            />
            <Input
              label="Date"
              type="date"
              value={form.entryDate}
              onChange={(e) => setForm({ ...form, entryDate: e.target.value })}
            />
            <Input
              label="Supplier"
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            />
            {(form.entryType === "dc" || form.entryType === "receipt") && (
              <>
                <Input label="DC No" value={form.docNo} onChange={(e) => setForm({ ...form, docNo: e.target.value })} />
                <Input
                  label="DC Date"
                  type="date"
                  value={form.docDate}
                  onChange={(e) => setForm({ ...form, docDate: e.target.value })}
                />
              </>
            )}
            <Input
              label="Lot / Ref"
              value={form.lotRef}
              onChange={(e) => setForm({ ...form, lotRef: e.target.value })}
            />
          </div>
          <Textarea
            label="Notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="e.g. Additional yarn received against short supply on DC 1180"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={submit} isLoading={saveEntry.isPending}>
              Update
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
          + Add New Entry
        </Button>
      )}
    </div>
  );
}

function blankEntryForm(entryType: MaterialEntryType) {
  return {
    entryType,
    qty: "",
    entryDate: new Date().toISOString().slice(0, 10),
    supplier: "",
    docNo: "",
    docDate: "",
    lotRef: "",
    notes: "",
  };
}

/** Re-export so stage forms can rebuild a flow from a requirement + entries
 * without importing from two places. */
export { buildRequirementFlow };
export type { MaterialRequirement };
