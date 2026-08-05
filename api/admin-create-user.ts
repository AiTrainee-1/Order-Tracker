import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdminCaller, usernameToEmail } from "./_supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { admin } = await requireAdminCaller(req);
    const { name, username, password, role, isMonitorOnly } = req.body ?? {};

    if (!name || !username || !password || !role) {
      res.status(400).json({ error: "name, username, password and role are required." });
      return;
    }

    const email = usernameToEmail(username);

    const { data: authUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !authUser.user) {
      res.status(400).json({ error: createError?.message || "Could not create auth account." });
      return;
    }

    const { error: profileError } = await admin.from("app_users").insert({
      id: authUser.user.id,
      name,
      username,
      password_plain: password,
      role,
      is_monitor_only: !!isMonitorOnly,
      is_active: true,
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(authUser.user.id);
      res.status(400).json({ error: profileError.message });
      return;
    }

    res.status(200).json({ id: authUser.user.id });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : "Unauthorized" });
  }
}
