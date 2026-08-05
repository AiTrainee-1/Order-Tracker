import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { uploadOrderImage } from "../lib/upload";
import type { Order } from "../lib/types";

export interface OrderPoInput {
  po_number: string;
  quantity: number;
  delivery_date: string | null;
}

export interface OrderFormInput {
  io_no: string;
  style: string;
  description: string;
  color: string;
  fabric: string;
  delivery_date: string | null;
  imageFile: File | null;
  purchaseOrders: OrderPoInput[];
}

function invalidateOrderQueries(queryClient: ReturnType<typeof useQueryClient>, orderId?: string) {
  queryClient.invalidateQueries({ queryKey: ["orders_list"] });
  queryClient.invalidateQueries({ queryKey: ["orders_bundle"] });
  if (orderId) queryClient.invalidateQueries({ queryKey: ["order_detail", orderId] });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrderFormInput) => {
      const totalQty = input.purchaseOrders.reduce((sum, po) => sum + (po.quantity || 0), 0);

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          io_no: input.io_no,
          style: input.style,
          description: input.description || null,
          color: input.color || null,
          fabric: input.fabric || null,
          delivery_date: input.delivery_date,
          total_qty: totalQty,
        })
        .select("*")
        .single<Order>();
      if (orderError || !order) throw orderError ?? new Error("Could not create order.");

      if (input.imageFile) {
        const path = await uploadOrderImage(order.id, input.imageFile);
        const { error: imgError } = await supabase
          .from("orders")
          .update({ image_path: path })
          .eq("id", order.id);
        if (imgError) throw imgError;
      }

      const poRows = input.purchaseOrders
        .filter((po) => po.po_number.trim().length > 0)
        .map((po) => ({
          order_id: order.id,
          po_number: po.po_number,
          quantity: po.quantity,
          delivery_date: po.delivery_date,
        }));
      if (poRows.length > 0) {
        const { error: poError } = await supabase.from("purchase_orders").insert(poRows);
        if (poError) throw poError;
      }

      return order;
    },
    onSuccess: () => invalidateOrderQueries(queryClient),
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, input }: { orderId: string; input: OrderFormInput }) => {
      const totalQty = input.purchaseOrders.reduce((sum, po) => sum + (po.quantity || 0), 0);

      let imagePath: string | undefined;
      if (input.imageFile) {
        imagePath = await uploadOrderImage(orderId, input.imageFile);
      }

      const { error: orderError } = await supabase
        .from("orders")
        .update({
          io_no: input.io_no,
          style: input.style,
          description: input.description || null,
          color: input.color || null,
          fabric: input.fabric || null,
          delivery_date: input.delivery_date,
          total_qty: totalQty,
          ...(imagePath ? { image_path: imagePath } : {}),
        })
        .eq("id", orderId);
      if (orderError) throw orderError;

      const { error: deleteError } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("order_id", orderId);
      if (deleteError) throw deleteError;

      const poRows = input.purchaseOrders
        .filter((po) => po.po_number.trim().length > 0)
        .map((po) => ({
          order_id: orderId,
          po_number: po.po_number,
          quantity: po.quantity,
          delivery_date: po.delivery_date,
        }));
      if (poRows.length > 0) {
        const { error: poError } = await supabase.from("purchase_orders").insert(poRows);
        if (poError) throw poError;
      }
    },
    onSuccess: (_data, variables) => invalidateOrderQueries(queryClient, variables.orderId),
  });
}
