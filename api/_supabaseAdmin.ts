import { createClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";

/** Server-only Supabase client using the service-role key. Never import this in src/. */
export function supabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server env vars are not configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Verifies the caller's bearer token belongs to an active admin app_user. */
export async function requireAdminCaller(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) throw new Error("Missing Authorization header.");

  const admin = supabaseAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Invalid session.");

  const { data: profile, error: profileError } = await admin
    .from("app_users")
    .select("*")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile || profile.role !== "admin") {
    throw new Error("Admin privileges required.");
  }

  return { admin, callerId: userData.user.id };
}

export const AUTH_EMAIL_DOMAIN = process.env.VITE_AUTH_EMAIL_DOMAIN || "uktextiles.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}
