import type { AssignmentWithDetails, Order, PurchaseOrder } from "./types";
import { applyExtraPercent } from "./sizes";

/** Order-wide production quantity, extra% included -  the sum of every PO's
 * buyer quantity plus its own configured extra%. Data entry is never split by
 * PO now (one order → one data-entry form per stage), so this is the number
 * every order-level assignment measures against, from Order Confirmation
 * through Packing. */
export function getOrderProductionQty(purchaseOrders: PurchaseOrder[]): number {
  return purchaseOrders.reduce((sum, po) => sum + applyExtraPercent(po.quantity, po.extra_percent), 0);
}

/** The fixed reference quantity every post-Cutting stage compares against.
 * Before Cutting completes there's no fixed PCS number yet, so this falls
 * back to the originally planned total_qty. */
export function getFixedOrderQty(order: Pick<Order, "cut_quantity" | "total_qty">): number {
  return order.cut_quantity ?? order.total_qty;
}

/** The quantity an assignment is actually responsible for. When the assignment
 * is scoped to a single PO, that's the PO's quantity -  not the whole order's
 * total -  so a user sees only the quantity for the order/style/PO they were
 * given. An order-wide assignment (po_id null) falls back to the order total. */
export function getAssignmentQty(order: Pick<Order, "total_qty">, assignment: AssignmentWithDetails): number {
  return assignment.po?.quantity ?? order.total_qty;
}

/** Same idea for post-Cutting stages: a PO-scoped assignment measures against
 * its own fixed cut quantity once Cutting has run for that PO (falling back to
 * its planned quantity before that); an order-wide assignment uses the order's
 * fixed cut quantity. */
export function getAssignmentFixedQty(
  order: Pick<Order, "cut_quantity" | "total_qty">,
  assignment: AssignmentWithDetails,
): number {
  if (assignment.po) return assignment.po.cut_quantity ?? assignment.po.quantity;
  return getFixedOrderQty(order);
}

/** The whole-order fixed baseline for a combined ("all POs") view, now that
 * Cutting is normally completed per PO rather than order-wide -  orders.cut_quantity
 * stays null once every PO has been cut individually. Sums each PO's own fixed
 * quantity so the combined view still shows a real post-cut PCS number instead
 * of silently falling back to the pre-cut planned total. Falls back to the
 * order's own cut_quantity (still set on legacy/order-wide cuts), then null
 * (not every PO cut yet) so the caller's own pre-cut fallback takes over. */
export function getCombinedCutQuantity(
  order: Pick<Order, "cut_quantity">,
  purchaseOrders: PurchaseOrder[],
): number | null {
  if (purchaseOrders.length === 0) return order.cut_quantity;
  const allCut = purchaseOrders.every((po) => po.cut_quantity != null);
  if (!allCut) return order.cut_quantity;
  return purchaseOrders.reduce((sum, po) => sum + (po.cut_quantity ?? 0), 0);
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
