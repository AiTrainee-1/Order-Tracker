import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { Order, PurchaseOrder, StageEntry } from "../lib/types";
import { useAssignments } from "./useAssignments";
import { useWorkflowStages } from "./useWorkflowStages";
import { useStageAssignments } from "./useStageAssignments";
import { useOrdersList } from "./useOrdersList";
import { buildOrderProgress, type OrderProgress, type StageProgress } from "../lib/progress";
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
 * Every work item is scoped to (order, PO, section) -  never just (order,
 * section). Tracking is PO-first: an assignment that covers "every PO" (no
 * po_id set, whether explicit or a stage-role default) is expanded here into
 * one item per purchase order, each with its own progress/quantities against
 * that PO's own numbers. An assignment already scoped to a specific PO passes
 * through unchanged. Orders with no POs yet fall back to a single order-level
 * item so nothing disappears from the work list.
 */
function expandAcrossPOs(
  base: Omit<AssignmentWithDetails, "po" | "po_id"> & { po_id: string | null; po?: AssignmentWithDetails["po"] },
  purchaseOrders: PurchaseOrder[],
): AssignmentWithDetails[] {
  if (base.po_id) return [base as AssignmentWithDetails]; // already scoped to a real PO
  if (purchaseOrders.length === 0) return [{ ...base, po_id: null, po: null } as AssignmentWithDetails];

  return purchaseOrders.map((po) => ({
    ...base,
    id: `${base.id}::po:${po.id}`,
    po_id: po.id,
    po,
  })) as AssignmentWithDetails[];
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
  // defaults, both expanded across every PO of their order (see
  // expandAcrossPOs) -  skipping any (order, PO, section) an explicit row
  // already covers, so a default never duplicates a more specific assignment.
  const effectiveAssignments = useMemo<AssignmentWithDetails[]>(() => {
    const explicitBase = (assignmentsQuery.data ?? []).filter((a) => !!a.order);
    const explicit = explicitBase.flatMap((a) =>
      expandAcrossPOs(a, purchaseOrdersByOrderId.get(a.order_id) ?? []),
    );
    if (!userId) return explicit;

    const stages = stagesQuery.data ?? [];
    const orders = ordersQuery.data?.orders ?? [];
    const stagesById = new Map(stages.map((s) => [s.id, s]));
    const myDefaults = (stageDefaultsQuery.data ?? []).filter((sa) => sa.user_id === userId);
    const explicitKeys = new Set(explicit.map((a) => `${a.order_id}::${a.po_id ?? "none"}::${a.section_id}`));

    const synthetic: AssignmentWithDetails[] = [];
    for (const sa of myDefaults) {
      const section = stagesById.get(sa.section_id);
      if (!section) continue;
      for (const order of orders) {
        const expanded = expandAcrossPOs(
          {
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
          },
          purchaseOrdersByOrderId.get(order.id) ?? [],
        );
        for (const item of expanded) {
          const key = `${item.order_id}::${item.po_id ?? "none"}::${item.section_id}`;
          if (explicitKeys.has(key)) continue;
          synthetic.push(item);
        }
      }
    }
    return [...explicit, ...synthetic];
  }, [assignmentsQuery.data, stageDefaultsQuery.data, ordersQuery.data, stagesQuery.data, userId, purchaseOrdersByOrderId]);

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
      // Every item is PO-scoped now (or order-level only when the order truly
      // has no POs yet) -  only that PO's movement counts toward its progress.
      const orderEntries = entries.filter(
        (e) => e.order_id === a.order_id && (a.po_id ? e.po_id === a.po_id : true),
      );
      const qtyBaseline = a.po
        ? { totalQty: a.po.quantity, cutQuantity: a.po.cut_quantity }
        : undefined;
      const orderProgress = buildOrderProgress(a.order as Order, stagesQuery.data!, orderEntries, qtyBaseline);
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
  }, [effectiveAssignments, stagesQuery.data, entriesQuery.data]);

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
