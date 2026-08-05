import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { Order, PurchaseOrder } from "../lib/types";

/** Lightweight orders + POs fetch for search/picker UIs (no progress math). */
export function useOrdersList() {
  return useQuery({
    queryKey: ["orders_list"],
    queryFn: async () => {
      const [ordersRes, posRes] = await Promise.all([
        supabase.from("orders").select("*").order("io_no", { ascending: true }),
        supabase.from("purchase_orders").select("*"),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (posRes.error) throw posRes.error;
      return {
        orders: ordersRes.data as Order[],
        purchaseOrders: posRes.data as PurchaseOrder[],
      };
    },
  });
}
