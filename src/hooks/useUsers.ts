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

/** A stale-but-not-yet-refreshed access token is the #1 cause of surprise 401s
 * on the admin-only API routes, so this always gets (and refreshes if needed)
 * a live session before attaching the bearer token. */
async function getFreshAccessToken(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    throw new Error("You're not signed in. Please log in again.");
  }

  const expiresInMs = (session.expires_at ?? 0) * 1000 - Date.now();
  if (expiresInMs > 30_000) {
    return session.access_token;
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed.session) {
    throw new Error("Your session has expired. Please log out and log back in, then try again.");
  }
  return refreshed.session.access_token;
}

async function postWithToken(path: string, body: unknown, token: string) {
  return fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

/** Background auto-refresh can lag behind actual expiry (e.g. after the tab
 * sits idle/backgrounded for a while), so a token that looked fine to
 * getFreshAccessToken() can still be rejected server-side. Rather than fail
 * on that first 401, force one refresh and retry once before giving up. */
async function authedFetch(path: string, body: unknown) {
  const token = await getFreshAccessToken();
  let res = await postWithToken(path, body, token);

  if (res.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      throw new Error("Your session has expired. Please log out and log back in, then try again.");
    }
    res = await postWithToken(path, body, refreshed.session.access_token);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${res.status}). Please try again.`);
  }
  return res.json();
}

export interface CreateUserInput {
  name: string;
  username: string;
  password: string;
  role: string;
  phone: string;
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

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string }) => authedFetch("/api/admin-delete-user", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app_users"] }),
  });
}

export interface UpdateUserInput {
  id: string;
  name?: string;
  role?: string;
  phone?: string | null;
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
