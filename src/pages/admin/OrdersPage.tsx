import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useOrdersList } from "../../hooks/useOrdersList";
import { useDeleteOrder, useUpdateOrder } from "../../hooks/useOrderMutations";
import { useToast } from "../../context/ToastContext";
import { useConfirm } from "../../context/ConfirmContext";
import { publicImageUrl } from "../../lib/supabaseClient";
import { formatDisplayDate } from "../../lib/workflow";
import { Card, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { Loader } from "../../components/ui/Loader";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";
import { OrderForm } from "../../components/forms/OrderForm";
import type { Order } from "../../lib/types";
import type { OrderFormInput } from "../../hooks/useOrderMutations";

export function OrdersPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useOrdersList();
  const updateOrder = useUpdateOrder();
  const deleteOrder = useDeleteOrder();
  const toast = useToast();
  const confirm = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const orders = data?.orders ?? [];
  const purchaseOrders = data?.purchaseOrders ?? [];
  const sizes = data?.sizes ?? [];

  function toggleSelected(orderId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  async function handleDeleteSelected() {
    const targets = orders.filter((o) => selectedIds.has(o.id));
    if (targets.length === 0) return;
    const ok = await confirm({
      title: `Delete ${targets.length} order${targets.length === 1 ? "" : "s"}?`,
      message:
        `This permanently deletes ${targets.length === 1 ? `"${targets[0].style}"` : `${targets.length} orders`} ` +
        "and everything under it -  POs, size breakdowns, assignments, all recorded production, material " +
        "requirements, and history. It can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      for (const order of targets) {
        await deleteOrder.mutateAsync(order.id);
      }
      toast.success(`Deleted ${targets.length} order${targets.length === 1 ? "" : "s"}.`);
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete order.");
    }
  }

  if (isLoading) return <Loader full label="Loading orders…" />;

  function openEdit(order: Order) {
    setEditingOrder(order);
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(input: OrderFormInput) {
    if (!editingOrder) return;
    setFormError(null);
    try {
      await updateOrder.mutateAsync({ orderId: editingOrder.id, input });
      toast.success("Order updated successfully.");
      setShowForm(false);
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save order.";
      setFormError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">Orders</h1>
          <p className="text-sm text-ink-500">
            Create and manage every garment order and its POs. Check one or more to delete them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="secondary"
              className="border-status-bad text-status-bad hover:bg-red-50"
              onClick={handleDeleteSelected}
              isLoading={deleteOrder.isPending}
            >
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => navigate("/admin/orders/new")}>+ Create Order</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => {
          const imageUrl = publicImageUrl(order.image_path);
          const pos = purchaseOrders.filter((p) => p.order_id === order.id);
          const selected = selectedIds.has(order.id);
          return (
            <Card key={order.id} className={`overflow-hidden ${selected ? "ring-2 ring-status-bad" : ""}`}>
              <div className="flex items-center gap-3 border-b border-white/70 p-4">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSelected(order.id)}
                  aria-label={`Select ${order.style}`}
                  className="h-4 w-4 shrink-0 accent-status-bad"
                />
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/80 bg-white/70">
                  {imageUrl ? (
                    <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
                  ) : (
                    <GarmentPlaceholder className="h-7 w-7 text-ink-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{order.style}</p>
                  <p className="truncate text-xs text-ink-500">
                    IO {order.io_no} · {order.color}
                  </p>
                </div>
              </div>
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <Badge tone="neutral">{pos.length} PO{pos.length === 1 ? "" : "s"}</Badge>
                  <span className="font-semibold text-ink-800">{order.total_qty.toLocaleString()} PCS</span>
                </div>
                <p className="text-xs text-ink-500">Delivery {formatDisplayDate(order.delivery_date)}</p>
                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => openEdit(order)}>
                    Edit
                  </Button>
                  <Link to={`/admin/orders/${order.id}`} className="flex-1">
                    <Button variant="ghost" size="sm" className="w-full">
                      Track →
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          );
        })}

        {orders.length === 0 && (
          <Card className="col-span-full">
            <CardBody className="py-10 text-center text-sm text-ink-400">
              No orders yet. Click "Create Order" to add the first one.
            </CardBody>
          </Card>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Edit Order" widthClass="max-w-2xl">
        {editingOrder && (
          <OrderForm
            key={editingOrder.id}
            initialOrder={editingOrder}
            initialPurchaseOrders={purchaseOrders.filter((p) => p.order_id === editingOrder.id)}
            initialSizes={sizes.filter((s) =>
              purchaseOrders.some((p) => p.id === s.po_id && p.order_id === editingOrder.id),
            )}
            existingImageUrl={publicImageUrl(editingOrder.image_path)}
            onSubmit={handleSubmit}
            onCancel={() => setShowForm(false)}
            submitting={updateOrder.isPending}
            error={formError}
          />
        )}
      </Modal>
    </div>
  );
}
