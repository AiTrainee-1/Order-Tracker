import type { AssignmentWithDetails, Order } from "./types";

/** The fixed reference quantity every post-Cutting stage compares against.
 * Before Cutting completes there's no fixed PCS number yet, so this falls
 * back to the originally planned total_qty. */
export function getFixedOrderQty(order: Pick<Order, "cut_quantity" | "total_qty">): number {
  return order.cut_quantity ?? order.total_qty;
}

/** The quantity an assignment is actually responsible for. When the assignment
 * is scoped to a single PO, that's the PO's quantity — not the whole order's
 * total — so a user sees only the quantity for the order/style/PO they were
 * given. An order-wide assignment (po_id null) falls back to the order total. */
export function getAssignmentQty(order: Pick<Order, "total_qty">, assignment: AssignmentWithDetails): number {
  return assignment.po?.quantity ?? order.total_qty;
}

/** Same idea for post-Cutting stages: a PO-scoped assignment measures against
 * its own PO quantity; an order-wide one uses the order's fixed cut quantity. */
export function getAssignmentFixedQty(
  order: Pick<Order, "cut_quantity" | "total_qty">,
  assignment: AssignmentWithDetails,
): number {
  return assignment.po?.quantity ?? getFixedOrderQty(order);
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
