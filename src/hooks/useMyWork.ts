import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { StageEntry } from "../lib/types";
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

export function useMyWork(userId: string | undefined) {
  const assignmentsQuery = useAssignments(userId);
  const stagesQuery = useWorkflowStages();
  const stageDefaultsQuery = useStageAssignments();
  const ordersQuery = useOrdersList();

  // Effective assignments = explicit per-order rows PLUS global stage-role
  // defaults expanded across every order (skipping orders the user already has
  // an explicit assignment on for that section). This is what makes a default
  // apply to all applicable orders automatically.
  const effectiveAssignments = useMemo<AssignmentWithDetails[]>(() => {
    const explicit = (assignmentsQuery.data ?? []).filter((a) => !!a.order);
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
      // When the assignment is scoped to a single PO, only that PO's movement
      // counts toward its progress/quantities — so a user sees just the order/
      // style/PO they were given, not the whole order's total.
      const orderEntries = entries.filter(
        (e) => e.order_id === a.order_id && (a.po_id ? e.po_id === a.po_id : true),
      );
      const orderProgress = buildOrderProgress(a.order!, stagesQuery.data!, orderEntries);
      const stageProgress = orderProgress.stages.find((s) => s.stage.id === a.section_id);

      // A stage opens once every earlier stage has moved goods on — completed
      // OR partially forwarded — so a partial handoff never blocks the line.
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
