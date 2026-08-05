import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { StageEntry } from "../lib/types";

export function useRecentStageEntries(orderId?: string, sectionId?: string) {
  return useQuery({
    queryKey: ["stage_entries", orderId, sectionId],
    enabled: !!orderId && !!sectionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_entries")
        .select("*")
        .eq("order_id", orderId)
        .eq("section_id", sectionId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as StageEntry[];
    },
  });
}

export type CreateStageEntryInput = Omit<StageEntry, "id" | "created_at">;

export function useCreateStageEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStageEntryInput) => {
      const { error } = await supabase.from("stage_entries").insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["stage_entries", variables.order_id, variables.section_id],
      });
      queryClient.invalidateQueries({ queryKey: ["order_detail", variables.order_id] });
      queryClient.invalidateQueries({ queryKey: ["orders_bundle"] });
    },
  });
}
