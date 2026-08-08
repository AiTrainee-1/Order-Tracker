import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { Order, PoSizeQuantity, PurchaseOrder } from "../lib/types";

/** Lightweight orders + POs + size rows for search/picker UIs (no progress
 * math). The size rows come along because the order editor needs them to
 * repopulate its grid — reopening an order without them would silently wipe
 * the breakdown on save. */
export function useOrdersList() {
  return useQuery({
    queryKey: ["orders_list"],
    queryFn: async () => {
      const [ordersRes, posRes, sizesRes] = await Promise.all([
        supabase.from("orders").select("*").order("io_no", { ascending: true }),
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
