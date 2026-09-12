import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin, respondError } from "./_supabaseAdmin.js";
import { buildProductionChain } from "../src/lib/chain.js";
import { effectiveSizes, sortSizes } from "../src/lib/sizes.js";
import type {
  MaterialEntry,
  MaterialRequirement,
  PoSizeQuantity,
  ProductionLot,
  ProductionTxn,
  PurchaseOrder,
  WorkflowStage,
} from "../src/lib/types.js";

/**
 * Public, unauthenticated read of one order's Production Output dashboard -
 * the data source behind the QR-code share card (ShareQrModal) and the
 * view-only page it opens (SharedOutputPage). No bearer token, no
 * requireAdminCaller: this is meant to be called by an anonymous browser
 * that scanned a QR code, not a signed-in Admin/MD session.
 *
 * The order id in the URL (a random UUID) IS the access control, the same
 * model "anyone with the link" sharing uses everywhere else - so this
 * deliberately whitelists exactly which order columns it returns (no
 * created_by, no anything else not already shown on the real dashboard) and
 * never returns user names, entered-by attribution, or audit history - the
 * real Output & Reports page doesn't show any of that in the sections this
 * mirrors either.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sums each size code across every PO of an order, extra% applied -  the
 * exact logic of the private mergeSizesAcrossPos in useProductionChain.ts,
 * duplicated here rather than imported since that file also pulls in the
 * browser Supabase client singleton, which has no place in a server function. */
function mergeSizesAcrossPos(
  purchaseOrders: PurchaseOrder[],
  allSizes: PoSizeQuantity[],
): { size_code: string; quantity: number }[] {
  const totals = new Map<string, number>();
  const order: string[] = [];
  for (const po of purchaseOrders) {
    const rows = effectiveSizes(po, sortSizes(allSizes.filter((s) => s.po_id === po.id)));
    for (const r of rows) {
      if (!totals.has(r.size_code)) order.push(r.size_code);
      totals.set(r.size_code, (totals.get(r.size_code) ?? 0) + r.quantity);
    }
  }
  return order.map((code) => ({ size_code: code, quantity: totals.get(code) ?? 0 }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const orderId = typeof req.query.orderId === "string" ? req.query.orderId : "";
    if (!UUID_PATTERN.test(orderId)) {
      res.status(404).json({ error: "Order not found." });
      return;
    }

    const admin = supabaseAdmin();

    const { data: orderRow, error: orderError } = await admin
      .from("orders")
      .select("id, io_no, style, description, color, fabric, image_path, total_qty, delivery_date")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!orderRow) {
      res.status(404).json({ error: "Order not found." });
      return;
    }

    const [posRes, stagesRes, txnsRes, lotsRes, reqsRes] = await Promise.all([
      admin.from("purchase_orders").select("*").eq("order_id", orderId),
      admin.from("workflow_stages").select("*").order("sequence_no", { ascending: true }),
      admin.from("production_txns").select("*").eq("order_id", orderId),
      admin.from("production_lots").select("*").eq("order_id", orderId),
      admin.from("material_requirements").select("*").eq("order_id", orderId),
    ]);
    if (posRes.error) throw posRes.error;
    if (stagesRes.error) throw stagesRes.error;
    if (txnsRes.error) throw txnsRes.error;
    if (lotsRes.error) throw lotsRes.error;
    if (reqsRes.error) throw reqsRes.error;

    const purchaseOrders = (posRes.data ?? []) as PurchaseOrder[];
    const stages = (stagesRes.data ?? []) as WorkflowStage[];
    const txns = (txnsRes.data ?? []) as ProductionTxn[];
    const lots = (lotsRes.data ?? []) as ProductionLot[];
    const requirements = (reqsRes.data ?? []) as MaterialRequirement[];

    const poIds = purchaseOrders.map((p) => p.id);
    const sizesRes = poIds.length
      ? await admin.from("po_size_quantities").select("*").in("po_id", poIds)
      : { data: [] as PoSizeQuantity[], error: null };
    if (sizesRes.error) throw sizesRes.error;
    const poSizeQuantities = (sizesRes.data ?? []) as PoSizeQuantity[];

    let materialEntries: MaterialEntry[] = [];
    if (requirements.length > 0) {
      const entriesRes = await admin
        .from("material_entries")
        .select("*")
        .in("requirement_id", requirements.map((r) => r.id));
      if (entriesRes.error) throw entriesRes.error;
      materialEntries = (entriesRes.data ?? []) as MaterialEntry[];
    }

    const sizes = mergeSizesAcrossPos(purchaseOrders, poSizeQuantities);
    const totalPcs = sizes.reduce((total, s) => total + s.quantity, 0);

    const chain = buildProductionChain({ stages, totalPcs, sizes, lots, requirements, materialEntries, txns });
    // Map doesn't survive JSON - the client rebuilds byKey from chain.stages
    // with the same one-liner every other consumer of this shape already uses.
    const { byKey: _byKey, ...chainForClient } = chain;

    const imageUrl = orderRow.image_path
      ? admin.storage.from("order-images").getPublicUrl(orderRow.image_path).data.publicUrl
      : null;

    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.status(200).json({
      order: { ...orderRow, imageUrl },
      chain: chainForClient,
    });
  } catch (err) {
    respondError(res, err);
  }
}
