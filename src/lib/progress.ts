import type { Order, StageEntry, TransferType, WorkflowStage } from "./types";
import { addDays, daysRemaining } from "./workflow";

/** A single branch/unit transfer recorded on a stage entry. */
export interface StageTransfer {
  type: Exclude<TransferType, "none">;
  to: string | null;
  qty: number;
  date: string;
}

export interface UnitBreakdown {
  unitName: string;
  isExternal: boolean;
  qtyReceived: number;
  qtyForwarded: number;
  qtyShortage: number;
  qtyRejected: number;
  qtyReturned: number;
  isCompleted: boolean;
  lastEntryDate: string | null;
  /** Short label of any transfer(s) recorded for this unit, e.g. "Branch → X". */
  transferLabel: string | null;
}

export interface StageProgress {
  stage: WorkflowStage;
  entries: StageEntry[];
  qtyReceived: number;
  qtyCompletedToday: number;
  qtyForwarded: number;
  qtyShortage: number;
  qtyRejected: number;
  qtyReturned: number;
  qtyPending: number;
  isCompleted: boolean;
  lastEntryDate: string | null;
  firstEntryDate: string | null;
  externalEntries: StageEntry[];
  unitBreakdown: UnitBreakdown[];
  transfers: StageTransfer[];
  responsibleUserIds: string[];
  nextAssignedUserId: string | null;
  estimatedCompletionDate: string | null;
}

export type OrderStatus = "not_started" | "on_track" | "due_soon" | "delayed" | "completed";

export interface OrderProgress {
  order: Order;
  stages: StageProgress[];
  currentStageIndex: number;
  completedStagesCount: number;
  pendingStagesCount: number;
  overallProgressPct: number;
  daysRemaining: number | null;
  status: OrderStatus;
}

const TRANSFER_PREFIX: Record<Exclude<TransferType, "none">, string> = {
  branch: "Branch",
  unit: "Unit",
  outside: "Outside",
};

/** Human-readable label for a single transfer, e.g. "Branch → Unit 2". */
export function formatTransfer(type: TransferType, to: string | null): string | null {
  if (type === "none") return null;
  return `${TRANSFER_PREFIX[type]}${to ? ` → ${to}` : ""}`;
}

/** Joins the distinct transfer labels across a set of entries, or null if none. */
function summarizeTransfers(entries: StageEntry[]): string | null {
  const labels = new Set<string>();
  for (const e of entries) {
    const label = formatTransfer(e.transfer_type, e.transfer_to);
    if (label) labels.add(label);
  }
  return labels.size ? Array.from(labels).join(", ") : null;
}

/**
 * Aggregates the raw stage_entries log for one order into a per-stage and
 * overall progress model. This is the single source of truth for "how far
 * has this order progressed" — computed client-side (not cached in the DB)
 * so the math stays easy to inspect/adjust in one place.
 *
 * Conventions:
 * - qty_received is the quantity allotted to the stage, restated (not additive)
 *   on every entry — so we take the max across entries, not the sum.
 * - qty_forwarded/rejected/returned accumulate across entries (a stage can be
 *   forwarded in several balance batches), so we sum them.
 * - A stage completes ONLY when an entry explicitly marks is_completed (the
 *   "Forward & Complete" action) — there is no auto-complete heuristic.
 * - Balance is derived from the running totals (received − forwarded − rejected),
 *   never summed from per-entry qty_shortage (which would double-count across
 *   balance entries). While in progress that balance is "pending"; once the
 *   stage is completed, whatever was never forwarded becomes the final shortage.
 */
export function buildOrderProgress(
  order: Order,
  stages: WorkflowStage[],
  entries: StageEntry[],
): OrderProgress {
  const sortedStages = [...stages].sort((a, b) => a.sequence_no - b.sequence_no);

  const stageProgressList: StageProgress[] = sortedStages.map((stage) => {
    const stageEntries = entries
      .filter((e) => e.section_id === stage.id)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date));

    const qtyReceived = stageEntries.reduce((max, e) => Math.max(max, e.qty_received), 0);
    const qtyCompletedToday = stageEntries.reduce((sum, e) => sum + e.qty_completed_today, 0);
    const qtyForwarded = stageEntries.reduce((sum, e) => sum + e.qty_forwarded, 0);
    const qtyRejected = stageEntries.reduce((sum, e) => sum + e.qty_rejected, 0);
    const qtyReturned = stageEntries.reduce((sum, e) => sum + e.qty_returned, 0);

    // Complete only when an entry explicitly forwards it — no auto-complete.
    const isCompleted = stageEntries.some((e) => e.is_completed);

    // Derived balance (never the sum of per-entry shortage). Pending while the
    // stage is open; once completed, the un-forwarded remainder is the shortage.
    const outstanding = Math.max(qtyReceived - qtyForwarded - qtyRejected, 0);
    const qtyPending = isCompleted ? 0 : outstanding;
    const qtyShortage = isCompleted ? outstanding : 0;

    const lastEntryDate = stageEntries.length
      ? stageEntries[stageEntries.length - 1].entry_date
      : null;
    const firstEntryDate = stageEntries.length ? stageEntries[0].entry_date : null;

    const externalEntries = stageEntries.filter((e) => e.is_external || e.is_sent_outside);

    const unitGroups = new Map<string, StageEntry[]>();
    for (const e of stageEntries) {
      const key = e.unit_name || e.external_unit_name || "Main";
      unitGroups.set(key, [...(unitGroups.get(key) ?? []), e]);
    }
    const unitBreakdown: UnitBreakdown[] = Array.from(unitGroups.entries()).map(
      ([unitName, group]) => {
        const groupReceived = group.reduce((max, e) => Math.max(max, e.qty_received), 0);
        const groupForwarded = group.reduce((sum, e) => sum + e.qty_forwarded, 0);
        const groupRejected = group.reduce((sum, e) => sum + e.qty_rejected, 0);
        const groupCompleted = group.some((e) => e.is_completed);
        const groupOutstanding = Math.max(groupReceived - groupForwarded - groupRejected, 0);
        return {
          unitName,
          isExternal: group.some((e) => e.is_external),
          qtyReceived: groupReceived,
          qtyForwarded: groupForwarded,
          qtyShortage: groupCompleted ? groupOutstanding : 0,
          qtyRejected: groupRejected,
          qtyReturned: group.reduce((sum, e) => sum + e.qty_returned, 0),
          isCompleted: groupCompleted,
          lastEntryDate: group.length ? group[group.length - 1].entry_date : null,
          transferLabel: summarizeTransfers(group),
        };
      },
    );

    const transfers: StageTransfer[] = stageEntries
      .filter((e) => e.transfer_type !== "none")
      .map((e) => ({
        type: e.transfer_type as StageTransfer["type"],
        to: e.transfer_to,
        qty: e.qty_forwarded,
        date: e.entry_date,
      }));

    const responsibleUserIds = Array.from(new Set(stageEntries.map((e) => e.entered_by)));

    const lastEntryWithForward = [...stageEntries].reverse().find((e) => e.forwarded_to_user_id);
    const nextAssignedUserId = lastEntryWithForward?.forwarded_to_user_id ?? null;

    const estimatedCompletionDate = lastEntryDate
      ? addDays(lastEntryDate, stage.typical_duration_days)
      : null;

    return {
      stage,
      entries: stageEntries,
      qtyReceived,
      qtyCompletedToday,
      qtyForwarded,
      qtyShortage,
      qtyRejected,
      qtyReturned,
      qtyPending,
      isCompleted,
      lastEntryDate,
      firstEntryDate,
      externalEntries,
      unitBreakdown,
      transfers,
      responsibleUserIds,
      nextAssignedUserId,
      estimatedCompletionDate,
    };
  });

  const completedStagesCount = stageProgressList.filter((s) => s.isCompleted).length;
  const pendingStagesCount = stageProgressList.length - completedStagesCount;

  let currentStageIndex = stageProgressList.findIndex((s) => !s.isCompleted);
  if (currentStageIndex === -1) currentStageIndex = stageProgressList.length - 1;

  const overallProgressPct = Math.round(
    (completedStagesCount / stageProgressList.length) * 100,
  );

  const remaining = daysRemaining(order.delivery_date);

  let status: OrderStatus;
  if (completedStagesCount === stageProgressList.length) {
    status = "completed";
  } else if (completedStagesCount === 0 && stageProgressList.every((s) => s.entries.length === 0)) {
    status = "not_started";
  } else if (remaining !== null && remaining < 0) {
    status = "delayed";
  } else if (remaining !== null && remaining <= 7) {
    status = "due_soon";
  } else {
    status = "on_track";
  }

  return {
    order,
    stages: stageProgressList,
    currentStageIndex,
    completedStagesCount,
    pendingStagesCount,
    overallProgressPct,
    daysRemaining: remaining,
    status,
  };
}

export interface FleetStats {
  totalOrders: number;
  onTrack: number;
  dueSoon: number;
  delayed: number;
  completed: number;
  totalCompletedStages: number;
  totalPendingStages: number;
}

export function buildFleetStats(all: OrderProgress[]): FleetStats {
  return all.reduce<FleetStats>(
    (acc, p) => {
      acc.totalOrders += 1;
      if (p.status === "on_track" || p.status === "not_started") acc.onTrack += 1;
      if (p.status === "due_soon") acc.dueSoon += 1;
      if (p.status === "delayed") acc.delayed += 1;
      if (p.status === "completed") acc.completed += 1;
      acc.totalCompletedStages += p.completedStagesCount;
      acc.totalPendingStages += p.pendingStagesCount;
      return acc;
    },
    {
      totalOrders: 0,
      onTrack: 0,
      dueSoon: 0,
      delayed: 0,
      completed: 0,
      totalCompletedStages: 0,
      totalPendingStages: 0,
    },
  );
}
