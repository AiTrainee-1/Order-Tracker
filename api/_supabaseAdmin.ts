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

/** Carries an HTTP status + stable code so the client can react precisely instead of guessing from prose. */
export class AuthError extends Error {
  status: number;
  code: "NO_TOKEN" | "SESSION_EXPIRED" | "NO_PROFILE" | "NOT_ADMIN" | "INACTIVE";
  constructor(status: number, code: AuthError["code"], message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Verifies the caller's bearer token belongs to an active admin app_user. */
export async function requireAdminCaller(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    throw new AuthError(401, "NO_TOKEN", "You're not signed in. Please log in and try again.");
  }

  const admin = supabaseAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    throw new AuthError(
      401,
      "SESSION_EXPIRED",
      "Your session has expired. Please log out and log back in, then try again.",
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("app_users")
    .select("*")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile) {
    throw new AuthError(
      401,
      "NO_PROFILE",
      "No account profile was found for your login. Contact another Admin for help.",
    );
  }
  if (profile.role !== "admin") {
    throw new AuthError(403, "NOT_ADMIN", "Only Admin accounts can perform this action.");
  }
  if (!profile.is_active) {
    throw new AuthError(403, "INACTIVE", "Your account has been deactivated.");
  }

  return { admin, callerId: userData.user.id };
}

export const AUTH_EMAIL_DOMAIN = process.env.VITE_AUTH_EMAIL_DOMAIN || "uktextiles.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

/** Standard error responder used by every api/admin-*.ts handler. */
export function respondError(res: { status: (code: number) => { json: (body: unknown) => void } }, err: unknown) {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  res.status(400).json({ error: err instanceof Error ? err.message : "Something went wrong." });
}
