import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const AUTH_EMAIL_DOMAIN =
  import.meta.env.VITE_AUTH_EMAIL_DOMAIN || "uktextiles.local";

/** Supabase Auth requires an email; usernames are mapped to a synthetic one. */
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

export function publicImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from("order-images").getPublicUrl(path);
  return data.publicUrl;
}
