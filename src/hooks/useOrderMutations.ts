import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { uploadOrderImage } from "../lib/upload";
import type { Order } from "../lib/types";

export function useSetCutQuantity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, cutQuantity }: { orderId: string; cutQuantity: number }) => {
      const { error } = await supabase
        .from("orders")
        .update({ cut_quantity: cutQuantity })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => invalidateOrderQueries(queryClient, variables.orderId),
  });
}

/** Same idea, scoped to a single PO -  a PO-scoped Cutting assignment sets its
 * own fixed baseline instead of overwriting the whole order's. */
export function useSetPoCutQuantity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      poId,
      cutQuantity,
    }: {
      orderId: string;
      poId: string;
      cutQuantity: number;
    }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ cut_quantity: cutQuantity })
        .eq("id", poId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => invalidateOrderQueries(queryClient, variables.orderId),
  });
}

export interface PoSizeInput {
  size_code: string;
  quantity: number;
}

export interface OrderPoInput {
  po_number: string;
  /** Derived from `sizes` -  kept on the row so every existing query that reads
   * purchase_orders.quantity keeps working without a join. This is the BUYER
   * total; extra_percent is applied on top of it downstream, not baked in. */
  quantity: number;
  delivery_date: string | null;
  sizes: PoSizeInput[];
  /** % added on top of the buyer's size-wise quantity to get what's actually
   * produced. 0 means production matches the buyer order exactly. */
  extra_percent: number;
}

/** A PO's quantity is the sum of its size rows, never typed directly -  the two
 * can then never disagree. */
export function poTotal(sizes: PoSizeInput[]): number {
  return sizes.reduce((total, s) => total + (Number(s.quantity) || 0), 0);
}

/** Writes the size breakdown for a set of freshly-inserted POs. Called after
 * both create and update, which is why it takes the saved rows rather than the
 * form input. */
async function saveSizes(
  savedPos: { id: string; po_number: string }[],
  input: OrderPoInput[],
): Promise<void> {
  const rows = savedPos.flatMap((saved) => {
    const source = input.find((p) => p.po_number === saved.po_number);
    return (source?.sizes ?? [])
      .filter((s) => s.size_code.trim().length > 0)
      .map((s, i) => ({
        po_id: saved.id,
        size_code: s.size_code.trim(),
        sort_order: i,
        quantity: Number(s.quantity) || 0,
      }));
  });
  if (rows.length === 0) return;
  const { error } = await supabase.from("po_size_quantities").insert(rows);
  if (error) throw error;
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
  // Assignments embed a joined `order:orders(*)` snapshot, so it needs
  // invalidating too whenever an order field (like cut_quantity) changes.
  queryClient.invalidateQueries({ queryKey: ["user_assignments"] });
  queryClient.invalidateQueries({ queryKey: ["my_work_entries"] });
  // Size rows are part of the chain bundle, so editing an order's POs has to
  // refresh it too -  otherwise Cutting would keep measuring against the old
  // size breakdown.
  queryClient.invalidateQueries({ queryKey: ["production_chain"] });
  if (orderId) queryClient.invalidateQueries({ queryKey: ["order_detail", orderId] });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrderFormInput) => {
      const totalQty = input.purchaseOrders.reduce((sum, po) => sum + poTotal(po.sizes), 0);

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

      const usablePos = input.purchaseOrders.filter((po) => po.po_number.trim().length > 0);
      if (usablePos.length > 0) {
        const { data: savedPos, error: poError } = await supabase
          .from("purchase_orders")
          .insert(
            usablePos.map((po) => ({
              order_id: order.id,
              po_number: po.po_number,
              quantity: poTotal(po.sizes),
              delivery_date: po.delivery_date,
              extra_percent: po.extra_percent,
            })),
          )
          .select("id, po_number");
        if (poError) throw poError;
        await saveSizes((savedPos ?? []) as { id: string; po_number: string }[], usablePos);
      }

      return order;
    },
    onSuccess: () => invalidateOrderQueries(queryClient),
  });
}

/**
 * Deletes an order and everything under it -  POs, size rows, assignments,
 * stage entries, lots, material requirements/entries, production txns, audit
 * log. Nothing to orchestrate here: every one of those tables already has an
 * `on delete cascade` back to orders/purchase_orders (see schema.sql and
 * migration 011), so a single delete on `orders` removes the lot.
 */
export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => invalidateOrderQueries(queryClient),
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, input }: { orderId: string; input: OrderFormInput }) => {
      const totalQty = input.purchaseOrders.reduce((sum, po) => sum + poTotal(po.sizes), 0);

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

      // POs are replaced wholesale rather than diffed. po_size_quantities
      // cascades on delete, so the size rows go with them and are re-inserted
      // below from the form -  no orphans, no stale sizes.
      const { error: deleteError } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("order_id", orderId);
      if (deleteError) throw deleteError;

      const usablePos = input.purchaseOrders.filter((po) => po.po_number.trim().length > 0);
      if (usablePos.length > 0) {
        const { data: savedPos, error: poError } = await supabase
          .from("purchase_orders")
          .insert(
            usablePos.map((po) => ({
              order_id: orderId,
              po_number: po.po_number,
              quantity: poTotal(po.sizes),
              delivery_date: po.delivery_date,
              extra_percent: po.extra_percent,
            })),
          )
          .select("id, po_number");
        if (poError) throw poError;
        await saveSizes((savedPos ?? []) as { id: string; po_number: string }[], usablePos);
      }
    },
    onSuccess: (_data, variables) => invalidateOrderQueries(queryClient, variables.orderId),
  });
}
