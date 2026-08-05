/**
 * One-time bootstrap for the default Admin account. Run after `supabase/schema.sql`
 * has been applied to a real Supabase project and .env has real credentials:
 *
 *   npm run seed:admin
 *
 * Creates the Supabase Auth user for the default admin (since auth.users can't be
 * seeded via plain SQL) and its matching public.app_users profile row.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const username = process.env.DEFAULT_ADMIN_USERNAME || "admin";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";
  const emailDomain = process.env.VITE_AUTH_EMAIL_DOMAIN || "uktextiles.local";

  if (!url || !serviceRoleKey) {
    throw new Error(
      "VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env before seeding.",
    );
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `${username.toLowerCase()}@${emailDomain}`;

  console.log(`Creating Supabase Auth user for "${username}" (${email})…`);
  const { data: authUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    throw new Error(`Failed to create auth user: ${createError.message}`);
  }

  console.log("Inserting app_users profile row…");
  const { error: profileError } = await admin.from("app_users").upsert({
    id: authUser.user!.id,
    name: "Host Admin",
    username,
    password_plain: password,
    role: "admin",
    is_monitor_only: false,
    is_active: true,
  });

  if (profileError) {
    throw new Error(`Failed to insert app_users row: ${profileError.message}`);
  }

  console.log(`Done. Log in with username "${username}" and the configured password.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
