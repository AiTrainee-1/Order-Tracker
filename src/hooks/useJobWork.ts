import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { JobWorkEntry } from "../lib/types";

const KEY = "job_work_entries";

/** Every Job Work entry for one order, across every section -  the page
 * scopes to one section client-side, and Output & Reports reads the whole
 * set to build its per-stage breakdown. */
export function useJobWorkEntries(orderId: string | undefined) {
  return useQuery({
    queryKey: [KEY, orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_work_entries")
        .select("*")
        .eq("order_id", orderId!)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobWorkEntry[];
    },
  });
}

function invalidateJobWork(queryClient: ReturnType<typeof useQueryClient>, orderId: string) {
  queryClient.invalidateQueries({ queryKey: [KEY, orderId] });
  queryClient.invalidateQueries({ queryKey: ["audit_log"] });
}

export type NewJobWorkEntry = Omit<JobWorkEntry, "id" | "created_at" | "updated_at" | "updated_by">;

/** Takes an array so a size-wise entry -  one row per size -  saves as a
 * single insert, the same all-or-nothing pattern useCreateTxns already uses
 * for the in-house grid. */
export function useCreateJobWorkEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: NewJobWorkEntry[]) => {
      if (rows.length === 0) return [] as JobWorkEntry[];
      const { data, error } = await supabase.from("job_work_entries").insert(rows).select("*");
      if (error) throw error;
      return (data ?? []) as JobWorkEntry[];
    },
    onSuccess: (rows) => rows[0] && invalidateJobWork(queryClient, rows[0].order_id),
  });
}

export function useUpdateJobWorkEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      orderId,
      patch,
      userId,
    }: {
      id: string;
      orderId: string;
      patch: Partial<JobWorkEntry>;
      userId: string;
    }) => {
      const { error } = await supabase
        .from("job_work_entries")
        .update({ ...patch, updated_by: userId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateJobWork(queryClient, v.orderId),
  });
}
