import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdminCaller, respondError } from "./_supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { admin, callerId } = await requireAdminCaller(req);
    const { userId } = req.body ?? {};

    if (!userId) {
      res.status(400).json({ error: "userId is required." });
      return;
    }
    if (userId === callerId) {
      res.status(400).json({ error: "You can't delete the account you're currently logged in as." });
      return;
    }

    const [{ count: enteredCount }, { count: forwardedCount }] = await Promise.all([
      admin
        .from("stage_entries")
        .select("id", { count: "exact", head: true })
        .eq("entered_by", userId),
      admin
        .from("stage_entries")
        .select("id", { count: "exact", head: true })
        .eq("forwarded_to_user_id", userId),
    ]);

    if ((enteredCount ?? 0) > 0 || (forwardedCount ?? 0) > 0) {
      res.status(409).json({
        error:
          "This user has production entries on record and can't be permanently deleted, to keep the order history intact. Deactivate the account instead.",
        code: "HAS_HISTORY",
      });
      return;
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      res.status(400).json({ error: deleteError.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    respondError(res, err);
  }
}
