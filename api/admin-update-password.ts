import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdminCaller } from "./_supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { admin } = await requireAdminCaller(req);
    const { userId, newPassword } = req.body ?? {};

    if (!userId || !newPassword) {
      res.status(400).json({ error: "userId and newPassword are required." });
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
      res.status(400).json({ error: profileError.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : "Unauthorized" });
  }
}
