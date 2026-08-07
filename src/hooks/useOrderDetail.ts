import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { AppUser, Order, PurchaseOrder, StageEntry } from "../lib/types";
import { useWorkflowStages } from "./useWorkflowStages";
import { buildOrderProgress } from "../lib/progress";
import { getCombinedCutQuantity } from "../lib/orderQty";

export function useOrderDetail(orderId: string | undefined) {
  const stagesQuery = useWorkflowStages();

  const dataQuery = useQuery({
    queryKey: ["order_detail", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const [orderRes, posRes, entriesRes, usersRes] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).single(),
        supabase.from("purchase_orders").select("*").eq("order_id", orderId),
        supabase
          .from("stage_entries")
          .select("*")
          .eq("order_id", orderId)
          .order("entry_date", { ascending: true }),
        supabase.from("app_users").select("*"),
      ]);
      if (orderRes.error) throw orderRes.error;
      if (posRes.error) throw posRes.error;
      if (entriesRes.error) throw entriesRes.error;
      if (usersRes.error) throw usersRes.error;
      return {
        order: orderRes.data as Order,
        purchaseOrders: posRes.data as PurchaseOrder[],
        entries: entriesRes.data as StageEntry[],
        users: usersRes.data as AppUser[],
      };
    },
  });

  const usersById = useMemo(() => {
    const map = new Map<string, AppUser>();
    for (const u of dataQuery.data?.users ?? []) map.set(u.id, u);
    return map;
  }, [dataQuery.data?.users]);

  const progress = useMemo(() => {
    if (!dataQuery.data || !stagesQuery.data) return null;
    const qtyBaseline = {
      totalQty: dataQuery.data.order.total_qty,
      cutQuantity: getCombinedCutQuantity(dataQuery.data.order, dataQuery.data.purchaseOrders),
    };
    return buildOrderProgress(dataQuery.data.order, stagesQuery.data, dataQuery.data.entries, qtyBaseline);
  }, [dataQuery.data, stagesQuery.data]);

  return {
    order: dataQuery.data?.order,
    purchaseOrders: dataQuery.data?.purchaseOrders ?? [],
    entries: dataQuery.data?.entries ?? [],
    usersById,
    progress,
    isLoading: stagesQuery.isLoading || dataQuery.isLoading,
    isError: stagesQuery.isError || dataQuery.isError,
    refetch: dataQuery.refetch,
  };
}
