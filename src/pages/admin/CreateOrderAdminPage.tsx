import { useNavigate } from "react-router-dom";
import { BackButton } from "../../components/ui/BackButton";
import { OrderCreatePanel } from "../../components/forms/OrderCreatePanel";

/**
 * Admin's own create flow, full-page instead of the cramped modal it used to
 * be -  same OrderCreatePanel the floor-side Create Orders page uses, so the
 * form itself is identical either way; only the surrounding page (a back
 * link back to the Orders grid, rather than a "your orders" list) differs.
 */
export function CreateOrderAdminPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton to="/admin/orders" label="Back to Orders" />
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Create Order</h1>
        <p className="text-sm text-ink-500">Add a new garment order and its POs.</p>
      </div>

      <OrderCreatePanel onCreated={() => navigate("/admin/orders")} />
    </div>
  );
}
