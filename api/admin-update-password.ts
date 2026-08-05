import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdminCaller, respondError } from "./_supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { admin } = await requireAdminCaller(req);
    const { userId, newPassword } = req.body ?? {};

    if (!userId || typeof newPassword !== "string" || newPassword.length < 6) {
      res.status(400).json({ error: "A user and a password of at least 6 characters are required." });
      return;
    }

    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (authError) {
      res.status(400).json({ error: authError.message });
      return;
    }

    const { error: profileError } = await admin
      .from("app_users")
      .update({ password_plain: newPassword })
      .eq("id", userId);
    if (profileError) {
      res.status(400).json({ error: `Password changed, but saving the profile copy failed: ${profileError.message}` });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    respondError(res, err);
  }
}
