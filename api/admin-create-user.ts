import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdminCaller, respondError, usernameToEmail } from "./_supabaseAdmin";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { admin } = await requireAdminCaller(req);
    const { name, username: rawUsername, password, role, isMonitorOnly } = req.body ?? {};

    const name_ = typeof name === "string" ? name.trim() : "";
    const username = typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";
    const role_ = typeof role === "string" ? role.trim() : "";

    if (!name_ || !username || !password || !role_) {
      res.status(400).json({ error: "Name, username, password and role are all required." });
      return;
    }
    if (!USERNAME_PATTERN.test(username)) {
      res.status(400).json({
        error: "Username must be 3-32 characters: lowercase letters, numbers, dots, underscores, or hyphens only.",
      });
      return;
    }
    if (typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }

    const { data: existing } = await admin
      .from("app_users")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (existing) {
      res.status(409).json({ error: `Username "${username}" is already taken.` });
      return;
    }

    const email = usernameToEmail(username);

    const { data: authUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !authUser.user) {
      const message = /already.*registered|already exists/i.test(createError?.message ?? "")
        ? `Username "${username}" is already taken.`
        : createError?.message || "Could not create the login account.";
      res.status(400).json({ error: message });
      return;
    }

    const { error: profileError } = await admin.from("app_users").insert({
      id: authUser.user.id,
      name: name_,
      username,
      password_plain: password,
      role: role_,
      is_monitor_only: !!isMonitorOnly,
      is_active: true,
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(authUser.user.id);
      res.status(400).json({ error: `Could not save the user profile: ${profileError.message}` });
      return;
    }

    res.status(200).json({ id: authUser.user.id });
  } catch (err) {
    respondError(res, err);
  }
}
