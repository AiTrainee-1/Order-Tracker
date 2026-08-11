import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { Order, PurchaseOrder, StageEntry } from "../lib/types";
import { useAssignments } from "./useAssignments";
import { useWorkflowStages } from "./useWorkflowStages";
import { useStageAssignments } from "./useStageAssignments";
import { useOrdersList } from "./useOrdersList";
import { buildOrderProgress, type OrderProgress, type StageProgress } from "../lib/progress";
import { getOrderProductionQty } from "../lib/orderQty";
import type { AssignmentWithDetails } from "../lib/types";

export type GateStatus = "active" | "locked" | "completed";

export interface WorkItem {
  assignment: AssignmentWithDetails;
  stageProgress: StageProgress | undefined;
  orderProgress: OrderProgress;
  overallProgressPct: number;
  /** Whether the order has actually reached this assignment's stage yet. */
  gateStatus: GateStatus;
  /** True when this item comes from a global stage-role default (all orders),
   * not an explicit per-order assignment. */
  isDefault: boolean;
}

export interface WorkBadge {
  tone: "good" | "warn" | "info" | "neutral";
  label: string;
}

/**
 * How a work item presents in a list.
 *
 * Orange is reserved for exactly one meaning across the whole app -  "moved on
 * but not finished, a balance is still owed here" -  so it has to outrank the
 * gate status: a partially-forwarded stage is still `active`, but showing it as
 * an ordinary "Your Turn" would hide the outstanding balance. "Your Turn" is
 * blue for the same reason; if both were amber the distinction would be lost.
 */
export function workBadge(item: WorkItem): WorkBadge {
  if (item.stageProgress?.isPartial) return { tone: "warn", label: "Not Complete" };
  if (item.gateStatus === "completed") return { tone: "good", label: "Completed" };
  if (item.gateStatus === "locked") return { tone: "neutral", label: "Waiting" };
  return { tone: "info", label: "Your Turn" };
}

/**
 * Every work item is scoped to (order, section) -  never (order, PO, section).
 * Data entry is never split by PO: one order can carry several purchase
 * orders, but there's exactly one data-entry form per stage, measuring
 * against the order's total quantity (every PO's buyer quantity plus its own
 * extra%, summed -  see getOrderProductionQty). An assignment row that still
 * carries a specific po_id, from before this changed, is forced back to
 * order-wide here rather than fragmenting the work list.
 */
function toOrderWide<T extends { po_id: string | null; po?: AssignmentWithDetails["po"] }>(base: T): T {
  if (!base.po_id) return base;
  return { ...base, po_id: null, po: null };
}

export function useMyWork(userId: string | undefined) {
  const assignmentsQuery = useAssignments(userId);
  const stagesQuery = useWorkflowStages();
  const stageDefaultsQuery = useStageAssignments();
  const ordersQuery = useOrdersList();

  const purchaseOrdersByOrderId = useMemo(() => {
    const map = new Map<string, PurchaseOrder[]>();
    for (const po of ordersQuery.data?.purchaseOrders ?? []) {
      map.set(po.order_id, [...(map.get(po.order_id) ?? []), po]);
    }
    return map;
  }, [ordersQuery.data]);

  // Effective assignments = explicit per-order rows PLUS global stage-role
  // defaults, all forced order-wide (see toOrderWide). A legacy assignment row
  // still scoped to a specific PO collapses onto the same order-wide item as
  // any other row for that (order, section, unit) -  duplicates are dropped,
  // not fanned out. A default never duplicates an explicit assignment either.
  const effectiveAssignments = useMemo<AssignmentWithDetails[]>(() => {
    const explicitBase = (assignmentsQuery.data ?? []).filter((a) => !!a.order);
    const seen = new Set<string>();
    const explicit: AssignmentWithDetails[] = [];
    for (const a of explicitBase) {
      const wide = toOrderWide(a);
      const key = `${wide.order_id}::${wide.section_id}::${wide.unit_name ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      explicit.push(wide);
    }
    if (!userId) return explicit;

    const stages = stagesQuery.data ?? [];
    const orders = ordersQuery.data?.orders ?? [];
    const stagesById = new Map(stages.map((s) => [s.id, s]));
    const myDefaults = (stageDefaultsQuery.data ?? []).filter((sa) => sa.user_id === userId);
    const explicitKeys = new Set(explicit.map((a) => `${a.order_id}::${a.section_id}`));

    const synthetic: AssignmentWithDetails[] = [];
    for (const sa of myDefaults) {
      const section = stagesById.get(sa.section_id);
      if (!section) continue;
      for (const order of orders) {
        const key = `${order.id}::${sa.section_id}`;
        if (explicitKeys.has(key)) continue;
        synthetic.push({
          id: `default:${sa.section_id}:${order.id}`,
          user_id: userId,
          order_id: order.id,
          po_id: null,
          section_id: sa.section_id,
          unit_name: null,
          can_enter_data: sa.can_enter_data,
          created_at: sa.created_at,
          order,
          po: null,
          section,
        });
      }
    }
    return [...explicit, ...synthetic];
  }, [assignmentsQuery.data, stageDefaultsQuery.data, ordersQuery.data, stagesQuery.data, userId]);

  const orderIds = useMemo(
    () => Array.from(new Set(effectiveAssignments.map((a) => a.order_id))),
    [effectiveAssignments],
  );

  const entriesQuery = useQuery({
    queryKey: ["my_work_entries", orderIds],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_entries")
        .select("*")
        .in("order_id", orderIds);
      if (error) throw error;
      return data as StageEntry[];
    },
  });

  const workItems: WorkItem[] = useMemo(() => {
    if (!stagesQuery.data) return [];
    const entries = entriesQuery.data ?? [];

    return effectiveAssignments.map((a) => {
      // Order-wide now: every entry for the order counts, regardless of
      // whatever po_id a row happens to carry (old PO-scoped entries included).
      const orderEntries = entries.filter((e) => e.order_id === a.order_id);
      // Extra%-inclusive production total across every PO of the order -  the
      // same number ConfirmationForm/OrderQtyBanner/the chain forms already
      // measure against. Falls back to the order's own total_qty when it has
      // no POs configured yet.
      const productionQty = getOrderProductionQty(purchaseOrdersByOrderId.get(a.order_id) ?? []);
      const order = a.order as Order;
      const qtyBaseline = { totalQty: productionQty || order.total_qty, cutQuantity: order.cut_quantity };
      const orderProgress = buildOrderProgress(order, stagesQuery.data!, orderEntries, qtyBaseline);
      const stageProgress = orderProgress.stages.find((s) => s.stage.id === a.section_id);

      // A stage opens once every earlier stage has moved goods on -  completed
      // OR partially forwarded -  so a partial handoff never blocks the line.
      let gateStatus: GateStatus;
      if (stageProgress?.isCompleted) {
        gateStatus = "completed";
      } else if (stageProgress?.isUnlocked) {
        gateStatus = "active";
      } else {
        gateStatus = "locked";
      }

      return {
        assignment: a,
        stageProgress,
        orderProgress,
        overallProgressPct: orderProgress.overallProgressPct,
        gateStatus,
        isDefault: a.id.startsWith("default:"),
      };
    });
  }, [effectiveAssignments, stagesQuery.data, entriesQuery.data, purchaseOrdersByOrderId]);

  return {
    workItems,
    isLoading:
      assignmentsQuery.isLoading ||
      stagesQuery.isLoading ||
      stageDefaultsQuery.isLoading ||
      ordersQuery.isLoading ||
      entriesQuery.isLoading,
    isError:
      assignmentsQuery.isError ||
      stagesQuery.isError ||
      stageDefaultsQuery.isError ||
      ordersQuery.isError ||
      entriesQuery.isError,
  };
}
