import { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useConfirm } from "../../../context/ConfirmContext";
import { useCreateStageEntry, type CreateStageEntryInput } from "../../../hooks/useStageEntries";
import { formatTransfer } from "../../../lib/progress";
import { formatDisplayDate } from "../../../lib/workflow";
import { Input, Select } from "../../ui/FormControls";
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

export function useStageEntryBuilder(order: Order, assignment: AssignmentWithDetails) {
  const { appUser } = useAuth();
  const createEntry = useCreateStageEntry();

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

  return { createEntry, buildEntry, appUser };
}
