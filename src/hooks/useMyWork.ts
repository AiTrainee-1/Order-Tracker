import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { StageEntry } from "../lib/types";
import { useAssignments } from "./useAssignments";
import { useWorkflowStages } from "./useWorkflowStages";
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
}

export function useMyWork(userId: string | undefined) {
  const assignmentsQuery = useAssignments(userId);
  const stagesQuery = useWorkflowStages();

  const orderIds = useMemo(
    () => Array.from(new Set((assignmentsQuery.data ?? []).map((a) => a.order_id))),
    [assignmentsQuery.data],
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
    if (!assignmentsQuery.data || !stagesQuery.data) return [];
    const entries = entriesQuery.data ?? [];

    return assignmentsQuery.data
      .filter((a) => !!a.order)
      .map((a) => {
        const orderEntries = entries.filter((e) => e.order_id === a.order_id);
        const orderProgress = buildOrderProgress(a.order!, stagesQuery.data!, orderEntries);
        const stageProgress = orderProgress.stages.find((s) => s.stage.id === a.section_id);
        const sectionSequence = a.section?.sequence_no ?? -1;
        const currentSequence = orderProgress.stages[orderProgress.currentStageIndex]?.stage.sequence_no ?? 0;

        let gateStatus: GateStatus;
        if (stageProgress?.isCompleted) {
          gateStatus = "completed";
        } else if (sectionSequence <= currentSequence) {
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
        };
      });
  }, [assignmentsQuery.data, stagesQuery.data, entriesQuery.data]);

  return {
    workItems,
    isLoading: assignmentsQuery.isLoading || stagesQuery.isLoading || entriesQuery.isLoading,
    isError: assignmentsQuery.isError || stagesQuery.isError || entriesQuery.isError,
  };
}
