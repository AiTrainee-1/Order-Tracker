import type { Order } from "./types";

/** The fixed reference quantity every post-Cutting stage compares against.
 * Before Cutting completes there's no fixed PCS number yet, so this falls
 * back to the originally planned total_qty. */
export function getFixedOrderQty(order: Pick<Order, "cut_quantity" | "total_qty">): number {
  return order.cut_quantity ?? order.total_qty;
}

export interface QtyComparison {
  fixedQty: number;
  completedQty: number;
  balance: number;
  status: "shortage" | "on_target" | "surplus";
}

export function compareToFixedQty(fixedQty: number, completedQty: number): QtyComparison {
  const balance = fixedQty - completedQty;
  return {
    fixedQty,
    completedQty,
    balance: Math.max(balance, 0),
    status: balance > 0 ? "shortage" : balance < 0 ? "surplus" : "on_target",
  };
}
