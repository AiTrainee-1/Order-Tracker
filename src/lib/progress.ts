import type { Order, StageEntry, WorkflowStage } from "./types";
import { addDays, daysRemaining } from "./workflow";

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
  responsibleUserIds: string[];
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

/**
 * Aggregates the raw stage_entries log for one order into a per-stage and
 * overall progress model. This is the single source of truth for "how far
 * has this order progressed" — computed client-side (not cached in the DB)
 * so the math stays easy to inspect/adjust in one place.
 *
 * Convention: qty_received on an entry represents the quantity available/
 * allotted to that stage as of that entry (restated over time, not additive),
 * so we take the max across entries rather than summing it.
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
    const qtyShortage = stageEntries.reduce((sum, e) => sum + e.qty_shortage, 0);
    const qtyRejected = stageEntries.reduce((sum, e) => sum + e.qty_rejected, 0);
    const qtyReturned = stageEntries.reduce((sum, e) => sum + e.qty_returned, 0);
    const qtyPending = Math.max(qtyReceived - qtyForwarded - qtyShortage - qtyRejected, 0);

    const isCompleted =
      stageEntries.some((e) => e.is_completed) ||
      (qtyReceived > 0 && qtyForwarded > 0 && qtyPending === 0);

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
      ([unitName, group]) => ({
        unitName,
        isExternal: group.some((e) => e.is_external),
        qtyReceived: group.reduce((max, e) => Math.max(max, e.qty_received), 0),
        qtyForwarded: group.reduce((sum, e) => sum + e.qty_forwarded, 0),
        qtyShortage: group.reduce((sum, e) => sum + e.qty_shortage, 0),
        qtyRejected: group.reduce((sum, e) => sum + e.qty_rejected, 0),
        qtyReturned: group.reduce((sum, e) => sum + e.qty_returned, 0),
        isCompleted: group.some((e) => e.is_completed),
        lastEntryDate: group.length ? group[group.length - 1].entry_date : null,
      }),
    );

    const responsibleUserIds = Array.from(new Set(stageEntries.map((e) => e.entered_by)));

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
      responsibleUserIds,
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
