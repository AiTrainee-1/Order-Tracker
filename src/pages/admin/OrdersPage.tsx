import { useState } from "react";
import { Link } from "react-router-dom";
import { useOrdersList } from "../../hooks/useOrdersList";
import { useCreateOrder, useUpdateOrder } from "../../hooks/useOrderMutations";
import { useToast } from "../../context/ToastContext";
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
  const { data, isLoading, refetch } = useOrdersList();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const orders = data?.orders ?? [];
  const purchaseOrders = data?.purchaseOrders ?? [];

  if (isLoading) return <Loader full label="Loading orders…" />;

  function openCreate() {
    setEditingOrder(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(order: Order) {
    setEditingOrder(order);
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(input: OrderFormInput) {
    setFormError(null);
    try {
      if (editingOrder) {
        await updateOrder.mutateAsync({ orderId: editingOrder.id, input });
        toast.success("Order updated successfully.");
      } else {
        await createOrder.mutateAsync(input);
        toast.success("Order created successfully.");
      }
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
          <p className="text-sm text-ink-500">Create and manage every garment order and its POs.</p>
        </div>
        <Button onClick={openCreate}>+ Create Order</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => {
          const imageUrl = publicImageUrl(order.image_path);
          const pos = purchaseOrders.filter((p) => p.order_id === order.id);
          return (
            <Card key={order.id} className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-ink-100 p-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-100 bg-ink-50">
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

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingOrder ? "Edit Order" : "Create Order"}
        widthClass="max-w-2xl"
      >
        <OrderForm
          key={editingOrder?.id ?? "new"}
          initialOrder={editingOrder ?? undefined}
          initialPurchaseOrders={
            editingOrder ? purchaseOrders.filter((p) => p.order_id === editingOrder.id) : undefined
          }
          existingImageUrl={editingOrder ? publicImageUrl(editingOrder.image_path) : undefined}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
          submitting={createOrder.isPending || updateOrder.isPending}
          error={formError}
        />
      </Modal>
    </div>
  );
}
