import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { useDemoStore } from "../context/DemoModeContext";
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

function invalidateAfterEntry(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId: string,
  sectionId: string,
) {
  queryClient.invalidateQueries({ queryKey: ["stage_entries", orderId, sectionId] });
  queryClient.invalidateQueries({ queryKey: ["order_detail", orderId] });
  queryClient.invalidateQueries({ queryKey: ["orders_bundle"] });
  // Broad match (no exact id list) so every my_work_entries query, whatever
  // order-set it was fetched with, re-checks the order's current stage.
  queryClient.invalidateQueries({ queryKey: ["my_work_entries"] });
}

export function useCreateStageEntry() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async (input: CreateStageEntryInput) => {
      if (demo) {
        demo.addStageEntry(input);
        return;
      }
      const { error } = await supabase.from("stage_entries").insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, variables) =>
      !demo && invalidateAfterEntry(queryClient, variables.order_id, variables.section_id),
  });
}

/** Inserts a batch of entries in one round-trip -  used when a stage's quantity
 * is split across several units/branches/outside parties and each split needs
 * its own auditable record. */
export function useCreateStageEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: CreateStageEntryInput[]) => {
      if (inputs.length === 0) return;
      const { error } = await supabase.from("stage_entries").insert(inputs);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      if (variables.length === 0) return;
      invalidateAfterEntry(queryClient, variables[0].order_id, variables[0].section_id);
    },
  });
}
