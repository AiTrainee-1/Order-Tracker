import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { AssignmentWithDetails } from "../lib/types";

const SELECT_WITH_DETAILS =
  "*, order:orders(*), po:purchase_orders(*), section:workflow_stages(*), user:app_users(*)";

export function useAssignments(userId?: string) {
  return useQuery({
    queryKey: ["user_assignments", userId ?? "all"],
    queryFn: async () => {
      let query = supabase.from("user_assignments").select(SELECT_WITH_DETAILS);
      if (userId) query = query.eq("user_id", userId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as AssignmentWithDetails[];
    },
  });
}

export interface CreateAssignmentInput {
  user_id: string;
  order_id: string;
  po_id: string | null;
  section_id: string;
  unit_name: string | null;
  can_enter_data: boolean;
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAssignmentInput) => {
      const { error } = await supabase.from("user_assignments").insert(input);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user_assignments"] }),
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user_assignments"] }),
  });
}
