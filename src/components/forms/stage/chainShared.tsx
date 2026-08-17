import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { useEntryUser } from "../../../hooks/useEntryUser";
import { useConfirm } from "../../../context/ConfirmContext";
import { useToast } from "../../../context/ToastContext";
import {
  useCreateLot,
  useCreateTxns,
  useUpdateTxn,
  useRecordAudit,
  useOrderPurchaseOrders,
  diffFields,
  type NewTxn,
} from "../../../hooks/useProductionChain";
import type { ChainStage } from "../../../lib/chain";
import { formatDisplayDate } from "../../../lib/workflow";
import { applyExtraPercent } from "../../../lib/sizes";
import { getOrderProductionQty } from "../../../lib/orderQty";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Input, Select, Textarea } from "../../ui/FormControls";
import type {
  AssignmentWithDetails,
  Order,
  ProductionLot,
  ProductionTxn,
  TxnType,
  UnitType,
} from "../../../lib/types";

/**
 * Shared machinery for every quantity-recording stage.
 *
 * The rules in §33–35 of the spec -  never overwrite, always allow editing,
 * always record who/when/why, always show the running cumulative -  are
 * implemented once, here, rather than sixteen times across sixteen forms. A
 * stage form supplies a LedgerConfig describing which columns it needs and
 * <StageLedger/> does the rest, so the stages stay consistent by construction
 * and a fix to the ledger fixes every stage at once.
 */

// ---------------------------------------------------------------------------
// Chain strip -  the same four numbers at the top of every stage
// ---------------------------------------------------------------------------

export function QtyBox({
  label,
  value,
  unit,
  tone,
  hint,
}: {
  label: string;
  value: number;
  unit?: UnitType;
  tone?: "good" | "bad" | "warn" | "neutral";
  hint?: string;
}) {
  const color =
    tone === "bad"
      ? "text-status-bad"
      : tone === "good"
        ? "text-status-good"
        : tone === "warn"
          ? "text-amber-600"
          : "text-ink-900";
  return (
    <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
      {unit && <p className="text-[10px] font-medium text-ink-400">{unit}</p>}
      {hint && <p className="mt-0.5 text-[10px] leading-tight text-ink-400">{hint}</p>}
    </div>
  );
}

/** Input → Output → Rejected → Balance. Reading the same four boxes at every
 * stage is what makes the line feel like one system rather than sixteen forms. */
export function ChainStrip({ cs, inputHint }: { cs: ChainStage; inputHint?: string }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QtyBox
          label="Input"
          value={cs.input}
          unit={cs.unit}
          hint={inputHint ?? (cs.recordedIn > 0 ? "counted in here" : cs.inherited > 0 ? "from previous stage" : "order baseline")}
        />
        <QtyBox label="Output" value={cs.output} unit={cs.unit} tone="good" hint="sent on" />
        <QtyBox label="Rejected" value={cs.rejected} unit={cs.unit} tone={cs.rejected > 0 ? "bad" : "neutral"} />
        <QtyBox
          label="Balance"
          value={cs.balance}
          unit={cs.unit}
          tone={cs.balance > 0 ? "warn" : "good"}
          hint="still owed"
        />
      </div>
      {cs.hasMismatch && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The previous stage sent on <b>{cs.inherited.toLocaleString()} {cs.unit}</b> but{" "}
          <b>{cs.recordedIn.toLocaleString()} {cs.unit}</b> was counted in here -  a difference of{" "}
          {Math.abs(cs.recordedIn - cs.inherited).toLocaleString()} {cs.unit}. Both figures are kept;
          reconcile before completing this stage.
        </p>
      )}
    </div>
  );
}

/**
 * Buyer Order Quantity -> Excess % -> Extra Quantity -> Final Production
 * Quantity, shown at the top of every stage form via StageFormRouter.
 *
 * The buyer figure is reference only -  what production actually runs against
 * is the Final Production Quantity, and it always has been: every PCS number
 * in chain.ts (SizeFlow.poQty, ChainStage totals, the Output dashboard)
 * already comes from effectiveSizes(), which applies the PO's extra_percent
 * before anything downstream ever sees the number. This banner doesn't change
 * that math -  it just makes visible what was previously implicit.
 *
 * Data entry is order-wide now (never split by PO), so the numbers here are
 * summed across every PO under the order: each PO's buyer quantity plus its
 * own configured extra%, combined into one order-level total. "Extra %"
 * becomes the blended, effective rate across the whole order -  exact when
 * there's one PO, a true weighted average when there are several.
 */
export function OrderQtyBanner({ order, assignment }: { order: Order; assignment: AssignmentWithDetails }) {
  const posQuery = useOrderPurchaseOrders(order.id);
  const po = assignment.po;

  const buyerQty = po ? po.quantity : order.total_qty;
  const productionQty = po
    ? applyExtraPercent(po.quantity, po.extra_percent)
    : getOrderProductionQty(posQuery.data ?? []) || buyerQty;
  const extraQty = productionQty - buyerQty;
  const extraPercent = buyerQty > 0 ? Math.round((extraQty / buyerQty) * 1000) / 10 : 0;

  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/70 bg-white/70 p-2.5 sm:grid-cols-4">
      <QtyBox label="Buyer Order Quantity" value={buyerQty} unit="PCS" hint="reference / comparison only" />
      <QtyBox label="Extra %" value={extraPercent} hint="effective rate across every PO in this order" />
      <QtyBox label="Extra Quantity" value={extraQty} unit="PCS" hint="added on top of buyer order qty" />
      <QtyBox
        label="Final Production Quantity"
        value={productionQty}
        unit="PCS"
        tone="good"
        hint="what production actually runs against"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lot-wise and size-wise roll-ups
// ---------------------------------------------------------------------------

export function LotSummaryTable({ cs }: { cs: ChainStage }) {
  if (cs.byLot.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
            <th className="px-3 py-2 text-left font-semibold">Lot</th>
            <th className="px-3 py-2 text-right font-semibold">In</th>
            <th className="px-3 py-2 text-right font-semibold">Out</th>
            <th className="px-3 py-2 text-right font-semibold">Rejected</th>
            <th className="px-3 py-2 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {cs.byLot.map((l) => (
            <tr key={l.lotId} className="bg-white">
              <td className="px-3 py-2 font-semibold text-ink-900">{l.lotNo}</td>
              <td className="px-3 py-2 text-right tabular-nums">{l.qtyIn.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-good">{l.qtyOut.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-bad">{l.qtyRejected.toLocaleString()}</td>
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${l.balance > 0 ? "text-amber-600" : "text-status-good"}`}>
                {l.balance.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SizeSummaryTable({ cs }: { cs: ChainStage }) {
  if (cs.bySize.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
            <th className="px-3 py-2 text-left font-semibold">Size</th>
            <th className="px-3 py-2 text-right font-semibold">PO Qty</th>
            <th className="px-3 py-2 text-right font-semibold">In</th>
            <th className="px-3 py-2 text-right font-semibold">Done</th>
            <th className="px-3 py-2 text-right font-semibold">Rejected</th>
            <th className="px-3 py-2 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {cs.bySize.map((s) => (
            <tr key={s.sizeCode} className="bg-white">
              <td className="px-3 py-2 font-semibold text-ink-900">{s.sizeCode}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-500">{s.poQty.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.qtyIn.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-good">{s.qtyOut.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-bad">{s.qtyRejected.toLocaleString()}</td>
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${s.balance > 0 ? "text-amber-600" : "text-status-good"}`}>
                {s.balance.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-ink-50 text-xs font-bold text-ink-800">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.poQty).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.qtyIn).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.qtyOut).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.qtyRejected).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.balance).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

// ---------------------------------------------------------------------------
// Lot picker
// ---------------------------------------------------------------------------

/**
 * Selects a lot from the register, and -  only where explicitly allowed -
 * raises a new one inline.
 *
 * A lot is created exactly once, at Knitting, where the fabric physically
 * becomes a batch; every stage after it selects from that register so the
 * whole line traces the same number. `allowCreate` therefore defaults to
 * false: creation is opted into in one place rather than switched off in
 * fifteen. Migration 018 enforces the same rule at the database level, so a
 * picker that somehow offered creation still could not write the row.
 */
export function LotSelect({
  lots,
  value,
  onChange,
  orderId,
  poId,
  allowCreate = false,
  label = "Lot",
}: {
  lots: ProductionLot[];
  value: string;
  onChange: (lotId: string) => void;
  orderId: string;
  poId: string | null;
  allowCreate?: boolean;
  label?: string;
}) {
  const appUser = useEntryUser();
  const createLot = useCreateLot();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [lotNo, setLotNo] = useState("");

  async function handleCreate() {
    const trimmed = lotNo.trim();
    if (!trimmed || !appUser) return;
    if (lots.some((l) => l.lot_no.toLowerCase() === trimmed.toLowerCase())) {
      toast.show(`Lot ${trimmed} already exists on this order.`, "error");
      return;
    }
    try {
      const lot = await createLot.mutateAsync({
        order_id: orderId,
        po_id: poId,
        lot_no: trimmed,
        created_by: appUser.id,
      });
      onChange(lot.id);
      setLotNo("");
      setAdding(false);
      toast.show(`Lot ${trimmed} created.`, "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not create the lot.", "error");
    }
  }

  if (adding) {
    return (
      <div className="flex items-end gap-2">
        <Input
          label="New lot number"
          value={lotNo}
          onChange={(e) => setLotNo(e.target.value)}
          placeholder="e.g. LOT-001"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
        />
        <Button type="button" size="sm" onClick={handleCreate} isLoading={createLot.isPending} className="mb-0.5">
          Create
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)} className="mb-0.5">
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2">
        <Select label={label} value={value} onChange={(e) => onChange(e.target.value)} className="min-w-[9rem]">
          <option value="">-  Select lot - </option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lot_no}
            </option>
          ))}
        </Select>
        {allowCreate && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)} className="mb-0.5">
            + New Lot
          </Button>
        )}
      </div>
      {!allowCreate && lots.length === 0 && (
        <p className="text-[11px] text-amber-700">
          No lots on this order yet. Lots are created at Knitting -  once Knitting raises one, it appears here.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger configuration
// ---------------------------------------------------------------------------

export interface LedgerConfig {
  /** Whether a lot must be chosen, may be chosen, or doesn't apply. */
  lot: "required" | "optional" | "none";
  /** Same, for size. */
  size: "required" | "optional" | "none";
  /** Column labels. false hides the column entirely. */
  inLabel: string | false;
  outLabel: string | false;
  rejectedLabel: string | false;
  reworkLabel: string | false;
  /** Free-text party column: knitting unit, embroidery vendor, sewing line. */
  ref: { label: string; presets: string[]; placeholder?: string } | false;
  /** Document reference, e.g. a DC number. */
  docLabel: string | false;
  /** Fixed txn_type for rows this stage writes. */
  txnType?: TxnType;
  /** Show only rows of that txn_type in the history. Lets Embroidery render two
   * ledgers over one stage -  dispatch and return -  each with its own running
   * total, without either seeing the other's rows. */
  filterByTxnType?: boolean;
  /** Render size entry as one row per size against a chosen lot, instead of a
   * size dropdown per draft row. Used by Cutting, where every size of a lot is
   * entered together. */
  sizeGrid?: boolean;
  /**
   * Whether this ledger's lot picker may raise a brand new lot.
   *
   * Defaults to FALSE -  deny by default. Lots originate at Knitting and
   * nowhere else (migration 018 enforces the same rule server-side), so every
   * other stage, including Knitting's own Receiving ledger, can only select
   * from the register Knitting created. The default is deliberately the
   * restrictive one: a stage added later that forgets to think about lots
   * inherits the safe behaviour rather than silently gaining the ability to
   * fork the lot register.
   */
  allowCreateLot?: boolean;
}

export interface DraftRow {
  key: string;
  lotId: string;
  sizeCode: string;
  qtyIn: string;
  qtyOut: string;
  rejected: string;
  rework: string;
  ref: string;
  doc: string;
  txnType: TxnType;
  entryDate: string;
  notes: string;
}

let draftSeq = 0;

function blankDraft(overrides: Partial<DraftRow> = {}): DraftRow {
  draftSeq += 1;
  return {
    key: `draft-${draftSeq}`,
    lotId: "",
    sizeCode: "",
    qtyIn: "",
    qtyOut: "",
    rejected: "",
    rework: "",
    ref: "",
    doc: "",
    txnType: "process",
    entryDate: new Date().toISOString().slice(0, 10),
    notes: "",
    ...overrides,
  };
}

function draftHasValue(d: DraftRow): boolean {
  return [d.qtyIn, d.qtyOut, d.rejected, d.rework].some((v) => Number(v) > 0);
}

// ---------------------------------------------------------------------------
// The ledger itself
// ---------------------------------------------------------------------------

export interface StageLedgerProps {
  orderId: string;
  poId: string | null;
  sectionId: string;
  unit: UnitType;
  cs: ChainStage;
  lots: ProductionLot[];
  sizes: { size_code: string; quantity: number }[];
  config: LedgerConfig;
  onSaved: () => void;
  /** Extra content rendered between the summary and the entry area. */
  children?: React.ReactNode;
  /** Hides the chain strip, extra content and lot/size position tables - 
   * reference summaries, not entry controls. The entries table and the add-row
   * form stay visible regardless, since editing/adding a row IS the data entry
   * this page exists for. */
  showDetails: boolean;
}

/**
 * Committing the ledger is exposed rather than fired from a button of its own.
 *
 * All three stage actions need to write pending entries first -  "Save Plan"
 * writes and stops, the two Move Forward actions write and then hand off -  so
 * a second save button inside the ledger would either duplicate the first
 * action or, worse, let someone forward a stage while a half-typed row sat
 * unsaved above it.
 */
export interface StageLedgerHandle {
  /** Writes any pending rows. Resolves false if validation failed, in which
   * case the caller must not go on to forward the stage. */
  save: () => Promise<boolean>;
  /** Whether anything is actually waiting to be written. */
  hasPending: () => boolean;
}

export const StageLedger = forwardRef<StageLedgerHandle, StageLedgerProps>(function StageLedger(
  { orderId, poId, sectionId, unit, cs, lots, sizes, config, onSaved, children, showDetails },
  ref,
) {
  const appUser = useEntryUser();
  const toast = useToast();
  const confirm = useConfirm();
  const createTxns = useCreateTxns();
  const updateTxn = useUpdateTxn();
  const recordAudit = useRecordAudit();

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftRow | null>(null);
  const [gridLotId, setGridLotId] = useState("");
  const [gridQty, setGridQty] = useState<Record<string, string>>({});
  const [gridNotes, setGridNotes] = useState("");

  const visibleTxns = useMemo(
    () =>
      config.filterByTxnType && config.txnType
        ? cs.txns.filter((t) => t.txn_type === config.txnType)
        : cs.txns,
    [cs.txns, config.filterByTxnType, config.txnType],
  );

  const refPresets = useMemo(() => {
    if (!config.ref) return [];
    const seen = new Set(config.ref.presets);
    for (const t of cs.txns) if (t.ref_name) seen.add(t.ref_name);
    return Array.from(seen);
  }, [config.ref, cs.txns]);

  const isSaving = createTxns.isPending || updateTxn.isPending;

  // --- Draft management ----------------------------------------------------

  function addDraft() {
    setDrafts((prev) => [
      ...prev,
      blankDraft({
        txnType: config.txnType ?? "process",
        lotId: prev[prev.length - 1]?.lotId ?? "",
      }),
    ]);
  }

  function patchDraft(key: string, patch: Partial<DraftRow>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  // --- Saving --------------------------------------------------------------

  function toTxn(d: DraftRow): NewTxn {
    return {
      order_id: orderId,
      po_id: poId,
      section_id: sectionId,
      lot_id: d.lotId || null,
      size_code: d.sizeCode || null,
      txn_type: d.txnType,
      unit,
      qty_in: Number(d.qtyIn) || 0,
      qty_out: Number(d.qtyOut) || 0,
      qty_rejected: Number(d.rejected) || 0,
      qty_rework: Number(d.rework) || 0,
      ref_name: d.ref.trim() || null,
      doc_no: d.doc.trim() || null,
      entry_date: d.entryDate,
      notes: d.notes.trim() || null,
      entered_by: appUser?.id ?? "",
    };
  }

  async function saveDrafts(): Promise<boolean> {
    if (!appUser) return false;
    const usable = drafts.filter(draftHasValue);
    // Nothing typed is not an error -  the operator may simply be forwarding
    // what earlier entries already recorded.
    if (usable.length === 0) return true;
    if (config.lot === "required" && usable.some((d) => !d.lotId)) {
      toast.show("Every entry needs a lot -  select one or create a new lot.", "error");
      return false;
    }
    if (config.size === "required" && usable.some((d) => !d.sizeCode)) {
      toast.show("Every entry needs a size.", "error");
      return false;
    }
    if (usable.some((d) => !d.notes.trim())) {
      toast.show("Add a note for every entry.", "error");
      return false;
    }

    try {
      const rows = usable.map(toTxn);
      await createTxns.mutateAsync(rows);
      await recordAudit.mutateAsync({
        order_id: orderId,
        po_id: poId,
        section_id: sectionId,
        entity: "production_txn",
        entity_id: null,
        action: "create",
        summary: `${usable.length} entr${usable.length === 1 ? "y" : "ies"} added -  ${rows
          .reduce((total, r) => total + r.qty_out + r.qty_in, 0)
          .toLocaleString()} ${unit}`,
        changes: null,
        notes: usable.map((d) => d.notes).filter(Boolean).join(" · ") || null,
        user_id: appUser.id,
      });
      setDrafts([]);
      onSaved();
      toast.show(
        `${usable.length} entr${usable.length === 1 ? "y" : "ies"} saved.`,
        "success",
      );
      return true;
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save the entries.", "error");
      return false;
    }
  }

  /** Cutting-style: one lot, a quantity per size, saved as one row per size so
   * every size stays independently traceable. */
  async function saveGrid(): Promise<boolean> {
    if (!appUser) return false;
    const typed = sizes.some((s) => Number(gridQty[s.size_code]) > 0);
    // Nothing typed is not an error -  see saveDrafts.
    if (!typed) return true;
    if (!gridLotId) {
      toast.show("Select a lot first.", "error");
      return false;
    }
    if (!gridNotes.trim()) {
      toast.show("Add a note for this entry.", "error");
      return false;
    }
    const rows: NewTxn[] = sizes
      .filter((s) => Number(gridQty[s.size_code]) > 0)
      .map((s) => ({
        order_id: orderId,
        po_id: poId,
        section_id: sectionId,
        lot_id: gridLotId,
        size_code: s.size_code,
        txn_type: config.txnType ?? "process",
        unit,
        qty_in: 0,
        qty_out: Number(gridQty[s.size_code]) || 0,
        qty_rejected: 0,
        qty_rework: 0,
        ref_name: null,
        doc_no: null,
        entry_date: new Date().toISOString().slice(0, 10),
        notes: gridNotes.trim() || null,
        entered_by: appUser.id,
      }));

    const total = rows.reduce((sum, r) => sum + r.qty_out, 0);
    const lotNo = lots.find((l) => l.id === gridLotId)?.lot_no ?? "";

    try {
      await createTxns.mutateAsync(rows);
      await recordAudit.mutateAsync({
        order_id: orderId,
        po_id: poId,
        section_id: sectionId,
        entity: "production_txn",
        entity_id: null,
        action: "create",
        summary: `Lot ${lotNo}: ${total.toLocaleString()} ${unit} across ${rows.length} size${rows.length === 1 ? "" : "s"}`,
        changes: null,
        notes: gridNotes.trim() || null,
        user_id: appUser.id,
      });
      setGridQty({});
      setGridNotes("");
      onSaved();
      toast.show(`Lot ${lotNo} recorded -  ${total.toLocaleString()} ${unit}.`, "success");
      return true;
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save the entry.", "error");
      return false;
    }
  }

  // Whichever entry mode this stage uses, the three stage actions drive it
  // through the same handle.
  useImperativeHandle(
    ref,
    () => ({
      save: () => (config.sizeGrid ? saveGrid() : saveDrafts()),
      hasPending: () =>
        config.sizeGrid
          ? sizes.some((s) => Number(gridQty[s.size_code]) > 0)
          : drafts.some(draftHasValue),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.sizeGrid, drafts, gridQty, gridLotId, gridNotes, sizes],
  );

  // --- Editing an existing row ---------------------------------------------

  function beginEdit(t: ProductionTxn) {
    setEditingId(t.id);
    setEditDraft({
      key: t.id,
      lotId: t.lot_id ?? "",
      sizeCode: t.size_code ?? "",
      qtyIn: t.qty_in ? String(t.qty_in) : "",
      qtyOut: t.qty_out ? String(t.qty_out) : "",
      rejected: t.qty_rejected ? String(t.qty_rejected) : "",
      rework: t.qty_rework ? String(t.qty_rework) : "",
      ref: t.ref_name ?? "",
      doc: t.doc_no ?? "",
      txnType: t.txn_type,
      entryDate: t.entry_date,
      notes: "",
    });
  }

  async function saveEdit(original: ProductionTxn) {
    if (!editDraft || !appUser) return;
    if (!editDraft.notes.trim()) {
      toast.show("Add a note explaining the correction -  it's kept in the audit trail.", "error");
      return;
    }

    const patch = {
      lot_id: editDraft.lotId || null,
      size_code: editDraft.sizeCode || null,
      qty_in: Number(editDraft.qtyIn) || 0,
      qty_out: Number(editDraft.qtyOut) || 0,
      qty_rejected: Number(editDraft.rejected) || 0,
      qty_rework: Number(editDraft.rework) || 0,
      ref_name: editDraft.ref.trim() || null,
      doc_no: editDraft.doc.trim() || null,
      entry_date: editDraft.entryDate,
    };

    const changes = diffFields(original as unknown as Record<string, unknown>, patch);
    if (!changes) {
      setEditingId(null);
      return;
    }

    const ok = await confirm({
      title: "Update this entry?",
      message: (
        <>
          <p>The original figures are kept in the audit trail alongside your note.</p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {Object.entries(changes).map(([field, c]) => (
              <li key={field}>
                <b>{field.replace(/_/g, " ")}</b>: {String(c.from ?? "- ")} → {String(c.to ?? "- ")}
              </li>
            ))}
          </ul>
        </>
      ),
      confirmLabel: "Save correction",
      cancelLabel: "Go back",
    });
    if (!ok) return;

    try {
      await updateTxn.mutateAsync({ id: original.id, orderId, patch, userId: appUser.id });
      await recordAudit.mutateAsync({
        order_id: orderId,
        po_id: poId,
        section_id: sectionId,
        entity: "production_txn",
        entity_id: original.id,
        action: "update",
        summary: `Entry of ${formatDisplayDate(original.entry_date)} corrected`,
        changes,
        notes: editDraft.notes.trim(),
        user_id: appUser.id,
      });
      setEditingId(null);
      setEditDraft(null);
      onSaved();
      toast.show("Entry updated.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not update the entry.", "error");
    }
  }

  // --- Render --------------------------------------------------------------

  const lotName = (id: string | null) => lots.find((l) => l.id === id)?.lot_no ?? "- ";
  const showLot = config.lot !== "none";
  const showSize = config.size !== "none" && !config.sizeGrid;

  return (
    <div className="space-y-5">
      {showDetails && (
        <>
          <ChainStrip cs={cs} />

          {children}

          {showLot && cs.byLot.length > 0 && (
            <Section title="Lot-wise position">
              <LotSummaryTable cs={cs} />
            </Section>
          )}

          {config.size !== "none" && cs.bySize.length > 0 && (
            <Section title="Size-wise position">
              <SizeSummaryTable cs={cs} />
            </Section>
          )}
        </>
      )}

      {/* ---------------- Entry history ---------------- */}
      <Section
        title="Entries"
        subtitle="Every entry is kept. Corrections are recorded against the original, never in place of it."
      >
        {visibleTxns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">
            Nothing recorded here yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  {showLot && <th className="px-3 py-2 text-left font-semibold">Lot</th>}
                  {config.size !== "none" && <th className="px-3 py-2 text-left font-semibold">Size</th>}
                  {config.ref && <th className="px-3 py-2 text-left font-semibold">{config.ref.label}</th>}
                  {config.docLabel && <th className="px-3 py-2 text-left font-semibold">{config.docLabel}</th>}
                  {config.inLabel && <th className="px-3 py-2 text-right font-semibold">{config.inLabel}</th>}
                  {config.outLabel && <th className="px-3 py-2 text-right font-semibold">{config.outLabel}</th>}
                  {config.rejectedLabel && <th className="px-3 py-2 text-right font-semibold">{config.rejectedLabel}</th>}
                  <th className="px-3 py-2 text-right font-semibold">Cumulative</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visibleTxns.map((t, i) => {
                  const cumulative = visibleTxns
                    .slice(0, i + 1)
                    .reduce((total, x) => total + (config.outLabel ? x.qty_out : x.qty_in), 0);
                  const isEditing = editingId === t.id;

                  if (isEditing && editDraft) {
                    return (
                      <tr key={t.id} className="bg-amber-50/60">
                        <td colSpan={12} className="px-3 py-3">
                          <div className="space-y-3">
                            <p className="text-xs font-semibold text-amber-800">
                              Correcting the entry of {formatDisplayDate(t.entry_date)}
                            </p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {showLot && (
                                <Select
                                  label="Lot"
                                  value={editDraft.lotId}
                                  onChange={(e) => setEditDraft({ ...editDraft, lotId: e.target.value })}
                                >
                                  <option value="">- </option>
                                  {lots.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.lot_no}
                                    </option>
                                  ))}
                                </Select>
                              )}
                              {config.size !== "none" && (
                                <Select
                                  label="Size"
                                  value={editDraft.sizeCode}
                                  onChange={(e) => setEditDraft({ ...editDraft, sizeCode: e.target.value })}
                                >
                                  <option value="">- </option>
                                  {sizes.map((s) => (
                                    <option key={s.size_code} value={s.size_code}>
                                      {s.size_code}
                                    </option>
                                  ))}
                                </Select>
                              )}
                              {config.inLabel && (
                                <Input
                                  label={config.inLabel}
                                  type="number"
                                  min={0}
                                  value={editDraft.qtyIn}
                                  onChange={(e) => setEditDraft({ ...editDraft, qtyIn: e.target.value })}
                                />
                              )}
                              {config.outLabel && (
                                <Input
                                  label={config.outLabel}
                                  type="number"
                                  min={0}
                                  value={editDraft.qtyOut}
                                  onChange={(e) => setEditDraft({ ...editDraft, qtyOut: e.target.value })}
                                />
                              )}
                              {config.rejectedLabel && (
                                <Input
                                  label={config.rejectedLabel}
                                  type="number"
                                  min={0}
                                  value={editDraft.rejected}
                                  onChange={(e) => setEditDraft({ ...editDraft, rejected: e.target.value })}
                                />
                              )}
                              <Input
                                label="Date"
                                type="date"
                                value={editDraft.entryDate}
                                onChange={(e) => setEditDraft({ ...editDraft, entryDate: e.target.value })}
                              />
                            </div>
                            <Textarea
                              label="Reason for the correction (required)"
                              required
                              rows={2}
                              value={editDraft.notes}
                              onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                              placeholder="e.g. Recount after weighbridge -  12 KG more than first recorded"
                            />
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={() => saveEdit(t)} isLoading={isSaving}>
                                Save correction
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={t.id} className="bg-white">
                      <td className="whitespace-nowrap px-3 py-2 text-ink-500">{formatDisplayDate(t.entry_date)}</td>
                      {showLot && <td className="px-3 py-2 font-medium text-ink-900">{lotName(t.lot_id)}</td>}
                      {config.size !== "none" && <td className="px-3 py-2 font-medium">{t.size_code ?? "- "}</td>}
                      {config.ref && <td className="px-3 py-2">{t.ref_name ?? "- "}</td>}
                      {config.docLabel && <td className="px-3 py-2">{t.doc_no ?? "- "}</td>}
                      {config.inLabel && <td className="px-3 py-2 text-right tabular-nums">{t.qty_in.toLocaleString()}</td>}
                      {config.outLabel && (
                        <td className="px-3 py-2 text-right tabular-nums text-status-good">{t.qty_out.toLocaleString()}</td>
                      )}
                      {config.rejectedLabel && (
                        <td className="px-3 py-2 text-right tabular-nums text-status-bad">
                          {t.qty_rejected.toLocaleString()}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{cumulative.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {t.txn_type !== "process" && (
                            <Badge tone={t.txn_type === "send" ? "external" : "good"}>{t.txn_type}</Badge>
                          )}
                          <Button type="button" variant="ghost" size="sm" onClick={() => beginEdit(t)}>
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ---------------- New entry ---------------- */}
      {config.sizeGrid ? (
        <Section title="Add new entry" subtitle="Pick the lot, then enter the pieces produced in each size.">
          <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            <LotSelect
              lots={lots}
              value={gridLotId}
              onChange={setGridLotId}
              orderId={orderId}
              poId={poId}
              allowCreate={config.allowCreateLot ?? false}
            />
            <div className="overflow-x-auto rounded-lg border border-ink-100 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                    <th className="px-3 py-2 text-left font-semibold">Size</th>
                    <th className="px-3 py-2 text-right font-semibold">PO Qty</th>
                    <th className="px-3 py-2 text-right font-semibold">Done so far</th>
                    <th className="px-3 py-2 text-right font-semibold">This entry</th>
                    <th className="px-3 py-2 text-right font-semibold">Balance after</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {sizes.map((s) => {
                    const done = cs.bySize.find((x) => x.sizeCode === s.size_code)?.qtyOut ?? 0;
                    const now = Number(gridQty[s.size_code]) || 0;
                    const balance = s.quantity - done - now;
                    return (
                      <tr key={s.size_code}>
                        <td className="px-3 py-1.5 font-semibold text-ink-900">{s.size_code}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink-500">{s.quantity.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{done.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            min={0}
                            value={gridQty[s.size_code] ?? ""}
                            onChange={(e) => setGridQty((prev) => ({ ...prev, [s.size_code]: e.target.value }))}
                            className="w-24 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm outline-none focus:border-brand"
                          />
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-semibold tabular-nums ${
                            balance < 0 ? "text-status-bad" : balance > 0 ? "text-amber-600" : "text-status-good"
                          }`}
                        >
                          {balance.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Textarea
              label="Notes"
              required
              rows={2}
              value={gridNotes}
              onChange={(e) => setGridNotes(e.target.value)}
              placeholder="Anything the next stage should know about this lot"
            />
            <p className="text-[11px] text-ink-500">
              Use <b>Save Plan</b> at the bottom to record this without moving on, or either{" "}
              <b>Move Forward</b> button to record it and hand off in one step.
            </p>
          </div>
        </Section>
      ) : (
        <Section title="Add new entry" subtitle="Each row is saved as its own record -  nothing above is replaced.">
          <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            {drafts.map((d, i) => (
              <div key={d.key} className="rounded-lg border border-ink-100 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-ink-400">Entry #{i + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-status-bad hover:bg-red-50"
                    onClick={() => removeDraft(d.key)}
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {showLot && (
                    <div className="col-span-2">
                      <LotSelect
                        lots={lots}
                        value={d.lotId}
                        onChange={(v) => patchDraft(d.key, { lotId: v })}
                        orderId={orderId}
                        poId={poId}
                        allowCreate={config.allowCreateLot ?? false}
                      />
                    </div>
                  )}
                  {showSize && (
                    <Select
                      label="Size"
                      value={d.sizeCode}
                      onChange={(e) => patchDraft(d.key, { sizeCode: e.target.value })}
                    >
                      <option value="">-  Select - </option>
                      {sizes.map((s) => (
                        <option key={s.size_code} value={s.size_code}>
                          {s.size_code}
                        </option>
                      ))}
                    </Select>
                  )}
                  {config.ref && (
                    <div>
                      <Input
                        label={config.ref.label}
                        list={`ref-${sectionId}`}
                        value={d.ref}
                        onChange={(e) => patchDraft(d.key, { ref: e.target.value })}
                        placeholder={config.ref.placeholder ?? "Type or pick"}
                      />
                      <datalist id={`ref-${sectionId}`}>
                        {refPresets.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                  )}
                  {config.docLabel && (
                    <Input
                      label={config.docLabel}
                      value={d.doc}
                      onChange={(e) => patchDraft(d.key, { doc: e.target.value })}
                    />
                  )}
                  {config.inLabel && (
                    <Input
                      label={`${config.inLabel} (${unit})`}
                      type="number"
                      min={0}
                      value={d.qtyIn}
                      onChange={(e) => patchDraft(d.key, { qtyIn: e.target.value })}
                    />
                  )}
                  {config.outLabel && (
                    <Input
                      label={`${config.outLabel} (${unit})`}
                      type="number"
                      min={0}
                      value={d.qtyOut}
                      onChange={(e) => patchDraft(d.key, { qtyOut: e.target.value })}
                    />
                  )}
                  {config.rejectedLabel && (
                    <Input
                      label={config.rejectedLabel}
                      type="number"
                      min={0}
                      value={d.rejected}
                      onChange={(e) => patchDraft(d.key, { rejected: e.target.value })}
                    />
                  )}
                  {config.reworkLabel && (
                    <Input
                      label={config.reworkLabel}
                      type="number"
                      min={0}
                      value={d.rework}
                      onChange={(e) => patchDraft(d.key, { rework: e.target.value })}
                    />
                  )}
                  <Input
                    label="Date"
                    type="date"
                    value={d.entryDate}
                    onChange={(e) => patchDraft(d.key, { entryDate: e.target.value })}
                  />
                </div>
                <div className="mt-2">
                  <Input
                    label="Notes"
                    required
                    value={d.notes}
                    onChange={(e) => patchDraft(d.key, { notes: e.target.value })}
                    placeholder="Kept with this entry in the history"
                  />
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={addDraft}>
                + Add New Entry
              </Button>
              {drafts.length > 0 && (
                <p className="text-[11px] text-ink-500">
                  Use <b>Save Plan</b> at the bottom to record these without moving on, or either{" "}
                  <b>Move Forward</b> button to record them and hand off in one step.
                </p>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
});

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600">{title}</h4>
        {subtitle && <p className="text-[11px] leading-snug text-ink-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
