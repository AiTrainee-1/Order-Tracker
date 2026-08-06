import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { StageSubItem, UnitType } from "../lib/types";

export function useStageSubItems(orderId: string | undefined, sectionId: string | undefined) {
  return useQuery({
    queryKey: ["stage_sub_items", orderId, sectionId],
    enabled: !!orderId && !!sectionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_sub_items")
        .select("*")
        .eq("order_id", orderId)
        .eq("section_id", sectionId);
      if (error) throw error;
      return data as StageSubItem[];
    },
  });
}

/** Fetches sub-items for an order across ALL sections (used to read another
 * stage's planned quantities, e.g. Fabric Processing reading the fabric qty
 * planned back in Raw Material Planning). */
export function useAllStageSubItemsForOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ["stage_sub_items_all", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_sub_items")
        .select("*")
        .eq("order_id", orderId);
      if (error) throw error;
      return data as StageSubItem[];
    },
  });
}

export interface UpsertSubItemInput {
  order_id: string;
  section_id: string;
  item_key: string;
  item_label: string;
  planned_qty: number;
  completed_qty: number;
  unit_type: UnitType;
  is_completed: boolean;
  notes: string | null;
  updated_by: string;
}

export function useUpsertStageSubItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertSubItemInput) => {
      const { error } = await supabase
        .from("stage_sub_items")
        .upsert(input, { onConflict: "order_id,section_id,item_key" });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["stage_sub_items", variables.order_id, variables.section_id],
      });
      queryClient.invalidateQueries({ queryKey: ["stage_sub_items_all", variables.order_id] });
    },
  });
}
