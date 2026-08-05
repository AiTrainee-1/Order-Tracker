import { supabase, usernameToEmail } from "./supabaseClient";
import type { AppUser } from "./types";

export interface LoginResult {
  appUser: AppUser;
}

export async function loginWithUsername(
  username: string,
  password: string,
): Promise<LoginResult> {
  const email = usernameToEmail(username);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    throw new Error("Invalid username or password.");
  }

  const { data: appUser, error: profileError } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", data.user.id)
    .single<AppUser>();

  if (profileError || !appUser) {
    await supabase.auth.signOut();
    throw new Error("No profile found for this account. Contact your Admin.");
  }

  if (!appUser.is_active) {
    await supabase.auth.signOut();
    throw new Error("This account has been deactivated. Contact your Admin.");
  }

  return { appUser };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export async function fetchAppUser(userId: string): Promise<AppUser | null> {
  const { data } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", userId)
    .single<AppUser>();
  return data ?? null;
}
