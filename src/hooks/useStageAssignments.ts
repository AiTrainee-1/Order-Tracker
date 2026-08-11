import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { StageAssignment } from "../lib/types";

/** All global stage-role defaults. Row shape is intentionally minimal (no
 * joins) so it reads correctly under every RLS role -  consumers resolve
 * user/section details from useUsers()/useWorkflowStages() they already load. */
export function useStageAssignments() {
  return useQuery({
    queryKey: ["stage_assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_assignments")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as StageAssignment[];
    },
  });
}

export interface UpsertStageAssignmentInput {
  user_id: string;
  section_id: string;
  can_enter_data: boolean;
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["stage_assignments"] });
  // Work lists are derived from these defaults -  re-fetch them too.
  queryClient.invalidateQueries({ queryKey: ["my_work_entries"] });
}

export function useUpsertStageAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertStageAssignmentInput) => {
      const { error } = await supabase
        .from("stage_assignments")
        .upsert(input, { onConflict: "user_id,section_id" });
      if (error) throw error;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteStageAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stage_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(queryClient),
  });
}
