import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { Order, PoSizeQuantity, PurchaseOrder } from "../lib/types";

/** Lightweight orders + POs + size rows for search/picker UIs (no progress
 * math). The size rows come along because the order editor needs them to
 * repopulate its grid -  reopening an order without them would silently wipe
 * the breakdown on save.
 *
 * Hidden orders (soft-hidden by their own creator, migration 017) are
 * excluded by default -  every fleet-wide list (Admin Orders, Assign Work)
 * should never show them. Pass includeHidden for the one place that must
 * still see them: the creator's own "Orders You've Created" list, so they
 * have something to unhide. */
export function useOrdersList(options: { includeHidden?: boolean } = {}) {
  const { includeHidden = false } = options;
  return useQuery({
    queryKey: ["orders_list", includeHidden],
    queryFn: async () => {
      let ordersQuery = supabase.from("orders").select("*").order("io_no", { ascending: true });
      if (!includeHidden) ordersQuery = ordersQuery.eq("is_hidden", false);
      const [ordersRes, posRes, sizesRes] = await Promise.all([
        ordersQuery,
        supabase.from("purchase_orders").select("*"),
        supabase.from("po_size_quantities").select("*"),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (posRes.error) throw posRes.error;
      if (sizesRes.error) throw sizesRes.error;
      return {
        orders: ordersRes.data as Order[],
        purchaseOrders: posRes.data as PurchaseOrder[],
        sizes: (sizesRes.data ?? []) as PoSizeQuantity[],
      };
    },
  });
}
