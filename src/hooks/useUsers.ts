import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { AppUser } from "../lib/types";

export function useUsers() {
  return useQuery({
    queryKey: ["app_users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_users")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as AppUser[];
    },
  });
}

async function authedFetch(path: string, body: unknown) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface CreateUserInput {
  name: string;
  username: string;
  password: string;
  role: string;
  isMonitorOnly: boolean;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => authedFetch("/api/admin-create-user", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app_users"] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { userId: string; newPassword: string }) =>
      authedFetch("/api/admin-update-password", input),
  });
}

export interface UpdateUserInput {
  id: string;
  name?: string;
  role?: string;
  is_monitor_only?: boolean;
  is_active?: boolean;
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateUserInput) => {
      const { error } = await supabase.from("app_users").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app_users"] }),
  });
}
