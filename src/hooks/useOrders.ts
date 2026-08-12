import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { Order, PurchaseOrder, StageEntry, WorkflowStage } from "../lib/types";
import { useWorkflowStages } from "./useWorkflowStages";
import { buildOrderProgress, type OrderProgress } from "../lib/progress";
import { getCombinedCutQuantity } from "../lib/orderQty";

export interface OrderBundle {
  order: Order;
  purchaseOrders: PurchaseOrder[];
  progress: OrderProgress;
}

/** Fetches every order + PO + stage_entry and builds progress for the fleet dashboard. */
export function useAllOrderProgress() {
  const stagesQuery = useWorkflowStages();

  const dataQuery = useQuery({
    queryKey: ["orders_bundle"],
    queryFn: async () => {
      const [ordersRes, posRes, entriesRes] = await Promise.all([
        // Hidden orders (soft-hidden by their own creator, migration 017)
        // never appear on the fleet-wide dashboard -  admin or MD.
        supabase.from("orders").select("*").eq("is_hidden", false).order("delivery_date", { ascending: true }),
        supabase.from("purchase_orders").select("*"),
        supabase.from("stage_entries").select("*"),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (posRes.error) throw posRes.error;
      if (entriesRes.error) throw entriesRes.error;
      return {
        orders: ordersRes.data as Order[],
        purchaseOrders: posRes.data as PurchaseOrder[],
        entries: entriesRes.data as StageEntry[],
      };
    },
    enabled: stagesQuery.isSuccess,
  });

  const { orders, purchaseOrders, entries } = dataQuery.data ?? {};
  const stages = stagesQuery.data;

  const bundles: OrderBundle[] = useMemo(
    () => computeBundles(orders, purchaseOrders, entries, stages),
    [orders, purchaseOrders, entries, stages],
  );

  return {
    bundles,
    isLoading: stagesQuery.isLoading || dataQuery.isLoading,
    isError: stagesQuery.isError || dataQuery.isError,
    refetch: dataQuery.refetch,
  };
}

function computeBundles(
  orders: Order[] | undefined,
  pos: PurchaseOrder[] | undefined,
  entries: StageEntry[] | undefined,
  stages: WorkflowStage[] | undefined,
): OrderBundle[] {
  if (!orders || !pos || !entries || !stages) return [];
  return orders.map((order) => {
    const purchaseOrders = pos.filter((p) => p.order_id === order.id);
    const orderEntries = entries.filter((e) => e.order_id === order.id);
    const qtyBaseline = {
      totalQty: order.total_qty,
      cutQuantity: getCombinedCutQuantity(order, purchaseOrders),
    };
    const progress = buildOrderProgress(order, stages, orderEntries, qtyBaseline);
    return { order, purchaseOrders, progress };
  });
}
