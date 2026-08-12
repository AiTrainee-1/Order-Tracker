import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useOrdersList } from "../../hooks/useOrdersList";
import { useDeleteOrder, useSetOrderHidden } from "../../hooks/useOrderMutations";
import { useToast } from "../../context/ToastContext";
import { useConfirm } from "../../context/ConfirmContext";
import { publicImageUrl } from "../../lib/supabaseClient";
import { formatDisplayDate } from "../../lib/workflow";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";
import { OrderCreatePanel } from "../../components/forms/OrderCreatePanel";
import type { Order } from "../../lib/types";

/**
 * The floor-side counterpart to Admin's "+ Create Order" -  same form, same
 * useCreateOrder mutation, same result: a normal row in `orders` that shows
 * up everywhere else in the app exactly like an Admin-created one (Dashboard,
 * Orders, Assign Work, Stage Roles, Data Input). The only thing scoped to
 * this user is what they're allowed to do here -  create, and manage what
 * they created -  not what the created order can be used for afterward.
 *
 * Reachable only with can_create_orders (granted from Stage Roles); the nav
 * item is hidden without it, and this is the backstop if someone still types
 * the URL directly. The real backstop is server-side -  RLS blocks the
 * insert regardless (see migration 016) -  this is just the friendly version.
 */
export function CreateOrderPage() {
  const { appUser } = useAuth();
  // includeHidden: this is the one list in the whole app that's SUPPOSED to
  // still show a hidden order -  otherwise there'd be nowhere left to unhide
  // it from (see useOrdersList's default, which excludes them everywhere else).
  const { data, isLoading } = useOrdersList({ includeHidden: true });

  const myOrders = useMemo(
    () => (data?.orders ?? []).filter((o) => o.created_by === appUser?.id),
    [data, appUser],
  );

  if (!appUser?.can_create_orders) {
    return <Navigate to="/user/home" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Create Order</h1>
        <p className="text-sm text-ink-500">
          Add a new garment order and its POs -  it'll appear across the whole app just like any other
          order, ready to be assigned and tracked.
        </p>
      </div>

      <OrderCreatePanel />

      {!isLoading && myOrders.length > 0 && (
        <Card>
          <CardHeader title="Orders You've Created" subtitle={`${myOrders.length} so far`} />
          <CardBody className="space-y-2">
            {myOrders.map((order) => (
              <MyOrderRow key={order.id} order={order} />
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function MyOrderRow({ order }: { order: Order }) {
  const toast = useToast();
  const confirm = useConfirm();
  const setHidden = useSetOrderHidden();
  const deleteOrder = useDeleteOrder();
  const imageUrl = publicImageUrl(order.image_path);

  async function toggleHidden() {
    try {
      await setHidden.mutateAsync({ orderId: order.id, hidden: !order.is_hidden });
      toast.success(order.is_hidden ? "Order unhidden." : "Order hidden -  it won't show anywhere else in the app.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the order.");
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this order?",
      message: `This permanently deletes "${order.style}" and everything under it -  POs, size breakdowns, assignments, and any recorded production. It can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteOrder.mutateAsync(order.id);
      toast.success(`Deleted "${order.style}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete order.");
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/70 p-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/80 bg-white/70">
        {imageUrl ? (
          <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
        ) : (
          <GarmentPlaceholder className="h-6 w-6 text-ink-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink-900">{order.style}</p>
          {order.is_hidden && <Badge tone="warn">Hidden</Badge>}
        </div>
        <p className="truncate text-xs text-ink-500">
          IO {order.io_no} · {order.color} · {order.total_qty.toLocaleString()} PCS · Delivery{" "}
          {formatDisplayDate(order.delivery_date)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={toggleHidden} isLoading={setHidden.isPending}>
          {order.is_hidden ? "Unhide" : "Hide"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-status-bad hover:bg-red-50"
          onClick={handleDelete}
          isLoading={deleteOrder.isPending}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
