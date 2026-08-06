import { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useConfirm } from "../../../context/ConfirmContext";
import {
  useCreateStageEntries,
  useCreateStageEntry,
  type CreateStageEntryInput,
} from "../../../hooks/useStageEntries";
import { formatTransfer, type StageProgress } from "../../../lib/progress";
import { getAssignmentQty } from "../../../lib/orderQty";
import { formatDisplayDate } from "../../../lib/workflow";
import { Input, Select } from "../../ui/FormControls";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import type { AssignmentWithDetails, Order, StageEntry, TransferType, UnitType } from "../../../lib/types";

export function QtyStat({ label, value, tone }: { label: string; value: string | number; tone?: "bad" | "good" | "neutral" }) {
  const color = tone === "bad" ? "text-status-bad" : tone === "good" ? "text-status-good" : "text-ink-900";
  const display = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="rounded-lg bg-ink-50 px-3 py-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-0.5 text-base font-bold ${color}`}>{display}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transfer capture — every stage records whether its movement went to another
// branch or production unit, and where. Held as local form state via
// useTransferFields, rendered by <TransferFields/>, and spread onto the entry.
// ---------------------------------------------------------------------------

export interface TransferValues {
  transfer_type: TransferType;
  transfer_to: string | null;
}

export function useTransferFields() {
  const [transferType, setTransferType] = useState<TransferType>("none");
  const [transferTo, setTransferTo] = useState("");

  const values: TransferValues = {
    transfer_type: transferType,
    transfer_to: transferType === "none" ? null : transferTo.trim() || null,
  };

  return { transferType, setTransferType, transferTo, setTransferTo, values };
}

const DESTINATION_LABEL: Record<Exclude<TransferType, "none">, string> = {
  branch: "Destination branch",
  unit: "Destination unit / vendor",
  outside: "Outside party",
};

const DESTINATION_PLACEHOLDER: Record<Exclude<TransferType, "none">, string> = {
  branch: "e.g. Tirupur Branch",
  unit: "e.g. Unit 2, ABC Subcontractor",
  outside: "e.g. External printing house",
};

export function TransferFields({
  type,
  to,
  onTypeChange,
  onToChange,
}: {
  type: TransferType;
  to: string;
  onTypeChange: (v: TransferType) => void;
  onToChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Select
        label="Movement Type"
        value={type}
        onChange={(e) => onTypeChange(e.target.value as TransferType)}
      >
        <option value="none">In-house (no transfer)</option>
        <option value="branch">Branch transfer</option>
        <option value="unit">Unit transfer</option>
        <option value="outside">Outside transfer</option>
      </Select>
      {type !== "none" && (
        <Input
          label={DESTINATION_LABEL[type]}
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          placeholder={DESTINATION_PLACEHOLDER[type]}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Balance summary — shows the running Allotted / Forwarded / Balance for a
// stage that already has entries, so a user picking up a partially-forwarded
// stage knows what remains, plus a compact log of prior batches.
// ---------------------------------------------------------------------------

export function StageBalanceSummary({
  unitType,
  allotted,
  forwarded,
  priorEntries,
}: {
  unitType: UnitType;
  allotted: number;
  forwarded: number;
  priorEntries: StageEntry[];
}) {
  const balance = Math.max(allotted - forwarded, 0);
  if (priorEntries.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="grid grid-cols-3 gap-3">
        <QtyStat label={`Allotted (${unitType})`} value={allotted} />
        <QtyStat label="Forwarded so far" value={forwarded} tone="good" />
        <QtyStat label="Balance left" value={balance} tone={balance > 0 ? "bad" : "good"} />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Previous entries</p>
        {priorEntries.map((e) => {
          const transfer = formatTransfer(e.transfer_type, e.transfer_to);
          return (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-xs">
              <span className="text-ink-500">{formatDisplayDate(e.entry_date)}</span>
              <span className="font-medium text-ink-800">
                {e.qty_forwarded.toLocaleString()} {unitType} forwarded
              </span>
              {transfer && <Badge tone="external">{transfer}</Badge>}
              <Badge tone={e.is_completed ? "good" : "warn"}>{e.is_completed ? "Completed" : "Balance entry"}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry builder — fills the common StageEntry shape so each form only supplies
// the quantities/flags it actually cares about. isFinal drives is_completed:
// false = "Save Entry" (partial batch), true = "Forward & Complete".
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Forward-&-complete confirmation — completing a stage is irreversible (it
// unlocks the next stages), so every "Forward & Complete" action gates on this.
// ---------------------------------------------------------------------------

export function useForwardConfirm() {
  const confirm = useConfirm();
  return (sectionLabel: string, balance?: { qty: number; unit: string }) =>
    confirm({
      title: "Forward & Complete?",
      message: (
        <>
          <p>
            This marks <b>{sectionLabel}</b> complete and forwards it to the next stage. The
            following stage(s) will unlock, and this can't be undone.
          </p>
          {balance && balance.qty > 0 ? (
            <p className="mt-2 font-medium text-status-bad">
              {balance.qty.toLocaleString()} {balance.unit} balance remains — it will be recorded as a
              shortage.
            </p>
          ) : null}
        </>
      ),
      confirmLabel: "Yes, forward & complete",
      cancelLabel: "Go back",
    });
}

// ---------------------------------------------------------------------------
// Effective stage quantity — the number a form should actually work against.
// Prefers what was physically counted in here, falls back to what the previous
// stage forwarded (the carry-over), and finally to the order/PO baseline. This
// is why leaving one stage's form blank no longer blanks out the ones after it.
// ---------------------------------------------------------------------------

export interface StageQty {
  unitType: UnitType;
  /** Quantity this stage is responsible for. */
  allotted: number;
  /** Carried over from the previous stage (0 if none / unit switch). */
  inherited: number;
  /** Sum of everything already forwarded on from this stage. */
  alreadyForwarded: number;
  /** Still to move on from here. */
  balance: number;
}

export function useStageQty(
  order: Order,
  assignment: AssignmentWithDetails,
  stageProgress?: StageProgress,
): StageQty {
  const unitType = assignment.section?.unit_type ?? "PCS";
  const baseline = getAssignmentQty(order, assignment);
  const inherited = stageProgress?.qtyInherited ?? 0;
  const recorded = stageProgress?.qtyReceived ?? 0;

  // KG stages have no order-level figure to fall back on — the number has to
  // come from the chain (or be typed in), so don't invent a PCS total for them.
  const fallback = unitType === "PCS" ? baseline : 0;
  const allotted = recorded > 0 ? recorded : inherited > 0 ? inherited : fallback;
  const alreadyForwarded = stageProgress?.qtyForwarded ?? 0;

  return {
    unitType,
    allotted,
    inherited,
    alreadyForwarded,
    balance: Math.max(allotted - alreadyForwarded, 0),
  };
}

/** Banner shown at the top of a form when the quantity was carried over from
 * the previous stage rather than typed in here — makes the automatic hand-down
 * visible instead of magic, and flags any mismatch that needs verifying. */
export function InheritedQtyNote({ qty, stageProgress }: { qty: StageQty; stageProgress?: StageProgress }) {
  if (!stageProgress) return null;

  if (stageProgress.hasQtyMismatch) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        The previous stage forwarded{" "}
        <b>
          {stageProgress.qtyInherited.toLocaleString()} {qty.unitType}
        </b>
        , but <b>{stageProgress.qtyReceived.toLocaleString()}</b> was counted in here — a difference
        of {Math.abs(stageProgress.qtyReceived - stageProgress.qtyInherited).toLocaleString()}{" "}
        {qty.unitType}. Verify before forwarding.
      </p>
    );
  }

  if (qty.inherited > 0 && stageProgress.qtyReceived === 0) {
    return (
      <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        Carried over from the previous stage:{" "}
        <b>
          {qty.inherited.toLocaleString()} {qty.unitType}
        </b>{" "}
        — already filled in for you. Change it only if a different quantity actually arrived.
      </p>
    );
  }

  return null;
}

/** Moving on WITHOUT finishing — the "orange" handoff. Goods that have arrived
 * go forward so the next stage isn't blocked, but this stage stays open so the
 * balance can be entered later when the rest turns up. */
export function usePartialConfirm() {
  const confirm = useConfirm();
  return (sectionLabel: string, balance?: { qty: number; unit: string }) =>
    confirm({
      title: "Move forward without completing?",
      message: (
        <>
          <p>
            This forwards what's ready so the next stage can start, but leaves{" "}
            <b>{sectionLabel}</b> open. It stays flagged in the workflow until you come back and
            complete it.
          </p>
          {balance && balance.qty > 0 ? (
            <p className="mt-2 font-medium text-status-warn">
              {balance.qty.toLocaleString()} {balance.unit} will remain outstanding here.
            </p>
          ) : null}
        </>
      ),
      confirmLabel: "Yes, move forward",
      cancelLabel: "Go back",
    });
}

// ---------------------------------------------------------------------------
// Split records — a stage's quantity rarely moves in one go. Each record is a
// separate unit/branch/outside consignment that becomes its own stage_entry,
// so the next stage can reconcile what arrived from where.
// ---------------------------------------------------------------------------

export interface SplitRecord {
  key: string;
  transferType: TransferType;
  destination: string;
  qty: string;
  rejected: string;
}

function blankSplit(): SplitRecord {
  return {
    key: Math.random().toString(36).slice(2),
    transferType: "none",
    destination: "",
    qty: "",
    rejected: "",
  };
}

export function useSplitRecords() {
  const [records, setRecords] = useState<SplitRecord[]>([]);

  function addRecord() {
    setRecords((prev) => [...prev, blankSplit()]);
  }
  function updateRecord(key: string, patch: Partial<SplitRecord>) {
    setRecords((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRecord(key: string) {
    setRecords((prev) => prev.filter((r) => r.key !== key));
  }
  function reset() {
    setRecords([]);
  }

  const totalQty = records.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  const totalRejected = records.reduce((sum, r) => sum + (Number(r.rejected) || 0), 0);

  return { records, addRecord, updateRecord, removeRecord, reset, totalQty, totalRejected };
}

export function SplitRecordsTable({
  records,
  unitType,
  allotted,
  alreadyForwarded = 0,
  onAdd,
  onUpdate,
  onRemove,
}: {
  records: SplitRecord[];
  unitType: UnitType;
  allotted: number;
  alreadyForwarded?: number;
  onAdd: () => void;
  onUpdate: (key: string, patch: Partial<SplitRecord>) => void;
  onRemove: (key: string) => void;
}) {
  const thisBatch = records.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  const running = alreadyForwarded + thisBatch;
  const balance = allotted - running;

  return (
    <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink-800">Split records</p>
          <p className="text-[11px] text-ink-500">
            Add one row per unit / branch / outside consignment. Leave empty to move the whole
            quantity in-house.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
          + Add Record
        </Button>
      </div>

      {records.length > 0 && (
        <div className="space-y-2">
          {records.map((r, i) => (
            <div
              key={r.key}
              className="grid grid-cols-1 gap-2 rounded-lg border border-ink-100 bg-white p-2.5 sm:grid-cols-[auto_1fr_1fr_auto_auto_auto] sm:items-end"
            >
              <span className="text-[11px] font-semibold text-ink-400 sm:pb-2.5">#{i + 1}</span>
              <Select
                label="Sent to"
                value={r.transferType}
                onChange={(e) => onUpdate(r.key, { transferType: e.target.value as TransferType })}
              >
                <option value="none">In-house</option>
                <option value="branch">Branch</option>
                <option value="unit">Unit / vendor</option>
                <option value="outside">Outside party</option>
              </Select>
              <Input
                label="Destination"
                value={r.destination}
                onChange={(e) => onUpdate(r.key, { destination: e.target.value })}
                placeholder={r.transferType === "none" ? "Own floor" : "e.g. Unit 2"}
                disabled={r.transferType === "none"}
              />
              <Input
                label={`Qty (${unitType})`}
                type="number"
                min={0}
                className="sm:w-28"
                value={r.qty}
                onChange={(e) => onUpdate(r.key, { qty: e.target.value })}
              />
              <Input
                label="Rejected"
                type="number"
                min={0}
                className="sm:w-24"
                value={r.rejected}
                onChange={(e) => onUpdate(r.key, { rejected: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-status-bad hover:bg-red-50"
                onClick={() => onRemove(r.key)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QtyStat label={`Allotted (${unitType})`} value={allotted} />
        <QtyStat label="Already sent" value={alreadyForwarded} />
        <QtyStat label="This batch" value={thisBatch} tone="good" />
        <QtyStat
          label={balance < 0 ? "Over by" : "Balance"}
          value={Math.abs(balance)}
          tone={balance === 0 ? "good" : "bad"}
        />
      </div>
      {balance < 0 && (
        <p className="text-xs font-medium text-status-bad">
          The split total exceeds the quantity allotted to this stage by{" "}
          {Math.abs(balance).toLocaleString()} {unitType}.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage actions — every stage offers the same three moves:
//   Save Plan ............ record planning/progress without moving anything on
//   Move Forward ......... send what's ready, stage stays open (orange)
//   Forward & Complete ... send and close the stage (green)
// ---------------------------------------------------------------------------

export function StageActions({
  sectionLabel,
  unitType,
  balance,
  isLoading,
  onSavePlan,
  savePlanLabel = "Save Plan",
  onMoveForward,
  moveForwardLabel = "Not Completed — Move to Next Stage",
  onComplete,
  completeLabel = "Forward to Next Stage →",
  disabled = false,
  completeDisabled = false,
}: {
  sectionLabel: string;
  unitType: UnitType;
  balance: number;
  isLoading: boolean;
  onSavePlan?: () => void | Promise<void>;
  savePlanLabel?: string;
  onMoveForward: () => void | Promise<void>;
  moveForwardLabel?: string;
  onComplete: () => void | Promise<void>;
  completeLabel?: string;
  disabled?: boolean;
  /** Extra gate on the complete action only (e.g. a "everything arrived"
   * checkbox) — the partial move-forward stays available. */
  completeDisabled?: boolean;
}) {
  const confirmPartial = usePartialConfirm();
  const confirmComplete = useForwardConfirm();

  async function handleMoveForward() {
    if (!(await confirmPartial(sectionLabel, { qty: balance, unit: unitType }))) return;
    await onMoveForward();
  }

  async function handleComplete() {
    if (!(await confirmComplete(sectionLabel, { qty: balance, unit: unitType }))) return;
    await onComplete();
  }

  return (
    <div className="space-y-2 border-t border-ink-100 pt-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {onSavePlan && (
          <Button
            type="button"
            variant="secondary"
            onClick={onSavePlan}
            isLoading={isLoading}
            disabled={disabled}
          >
            {savePlanLabel}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={handleMoveForward}
          isLoading={isLoading}
          disabled={disabled}
          // Inline so the amber wins outright — a `bg-*` utility passed through
          // className races the variant's own background on stylesheet order.
          style={{ backgroundImage: "linear-gradient(120deg, #FEF3C7 0%, #FDE68A 100%)" }}
          className="border-amber-300/80 text-amber-900 hover:brightness-[0.97]"
        >
          {moveForwardLabel}
        </Button>
      </div>
      <Button
        type="button"
        onClick={handleComplete}
        isLoading={isLoading}
        disabled={disabled || completeDisabled}
        className="w-full"
        size="lg"
      >
        {completeLabel}
      </Button>
      <p className="text-center text-[11px] text-ink-500">
        "Move to Next Stage" sends what's ready and keeps this stage open (shown in orange) so you
        can enter the balance later.
      </p>
    </div>
  );
}

export function useStageEntryBuilder(order: Order, assignment: AssignmentWithDetails) {
  const { appUser } = useAuth();
  const createEntry = useCreateStageEntry();
  const createEntries = useCreateStageEntries();

  function buildEntry(
    overrides: Partial<CreateStageEntryInput>,
    isFinal: boolean,
  ): CreateStageEntryInput {
    return {
      order_id: order.id,
      po_id: assignment.po_id,
      section_id: assignment.section_id,
      entry_date: new Date().toISOString().slice(0, 10),
      unit_type: assignment.section?.unit_type ?? "PCS",
      qty_received: 0,
      qty_completed_today: 0,
      qty_forwarded: 0,
      qty_shortage: 0,
      qty_rejected: 0,
      qty_returned: 0,
      is_external: false,
      external_unit_name: null,
      is_sent_outside: false,
      is_returned: false,
      is_completed: isFinal,
      branch: null,
      unit_name: assignment.unit_name,
      transfer_type: "none",
      transfer_to: null,
      notes: null,
      entered_by: appUser?.id ?? "",
      forwarded_to_user_id: null,
      ...overrides,
    };
  }

  /**
   * Writes a stage's movement. With no split records this is a single entry,
   * exactly as before. With splits, each consignment becomes its own entry so
   * the next stage can reconcile what arrived from which unit/branch/party —
   * the stage-level totals stay correct because qty_forwarded sums across
   * entries while qty_received (carried on the first row only) is a restated
   * max. The completion flag rides on the last row.
   */
  async function submitMovement({
    base,
    splits = [],
    isFinal,
  }: {
    base: Partial<CreateStageEntryInput>;
    splits?: SplitRecord[];
    isFinal: boolean;
  }) {
    const usable = splits.filter((s) => Number(s.qty) > 0 || Number(s.rejected) > 0);
    if (usable.length === 0) {
      await createEntry.mutateAsync(buildEntry(base, isFinal));
      return;
    }

    const rows = usable.map((s, i) =>
      buildEntry(
        {
          ...base,
          // qty_received is restated, not accumulated — keep it on row 1 only so
          // the stage total doesn't get mistaken for a per-split figure.
          qty_received: i === 0 ? base.qty_received ?? 0 : 0,
          qty_completed_today: Number(s.qty) || 0,
          qty_forwarded: Number(s.qty) || 0,
          qty_rejected: Number(s.rejected) || 0,
          transfer_type: s.transferType,
          transfer_to: s.transferType === "none" ? null : s.destination.trim() || null,
          is_external: s.transferType === "outside",
          external_unit_name: s.transferType === "outside" ? s.destination.trim() || null : null,
          is_sent_outside: s.transferType === "outside",
          notes: i === 0 ? base.notes ?? null : null,
        },
        // Only the final row closes the stage.
        isFinal && i === usable.length - 1,
      ),
    );
    await createEntries.mutateAsync(rows);
  }

  const isPending = createEntry.isPending || createEntries.isPending;

  return { createEntry, createEntries, buildEntry, submitMovement, isPending, appUser };
}
