import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { WorkflowStage } from "../lib/types";

export function useWorkflowStages() {
  return useQuery({
    queryKey: ["workflow_stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_stages")
        .select("*")
        .order("sequence_no", { ascending: true });
      if (error) throw error;
      return data as WorkflowStage[];
    },
    staleTime: Infinity,
  });
}
