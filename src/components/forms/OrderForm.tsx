import { useRef, useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/FormControls";
import { GarmentPlaceholder } from "../ui/GarmentPlaceholder";
import type { Order, PurchaseOrder } from "../../lib/types";
import type { OrderFormInput, OrderPoInput } from "../../hooks/useOrderMutations";

let poRowSeq = 0;
interface PoRow extends OrderPoInput {
  key: string;
}

function emptyRow(): PoRow {
  poRowSeq += 1;
  return { key: `new-${poRowSeq}`, po_number: "", quantity: 0, delivery_date: "" };
}

export function OrderForm({
  initialOrder,
  initialPurchaseOrders,
  existingImageUrl,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  initialOrder?: Order;
  initialPurchaseOrders?: PurchaseOrder[];
  existingImageUrl?: string | null;
  onSubmit: (input: OrderFormInput) => void;
  onCancel: () => void;
  submitting: boolean;
  error?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ioNo, setIoNo] = useState(initialOrder?.io_no ?? "");
  const [style, setStyle] = useState(initialOrder?.style ?? "");
  const [description, setDescription] = useState(initialOrder?.description ?? "");
  const [color, setColor] = useState(initialOrder?.color ?? "");
  const [fabric, setFabric] = useState(initialOrder?.fabric ?? "");
  const [deliveryDate, setDeliveryDate] = useState(initialOrder?.delivery_date ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(existingImageUrl ?? null);
  const [poRows, setPoRows] = useState<PoRow[]>(() =>
    initialPurchaseOrders?.length
      ? initialPurchaseOrders.map((po) => ({
          key: po.id,
          po_number: po.po_number,
          quantity: po.quantity,
          delivery_date: po.delivery_date,
        }))
      : [emptyRow()],
  );

  const totalQty = poRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

  function updateRow(key: string, patch: Partial<PoRow>) {
    setPoRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setPoRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(key: string) {
    setPoRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function handleImageSelect(file: File | null) {
    setImageFile(file);
    if (file) setImagePreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      io_no: ioNo,
      style,
      description,
      color,
      fabric,
      delivery_date: deliveryDate || null,
      imageFile,
      purchaseOrders: poRows.map(({ po_number, quantity, delivery_date }) => ({
        po_number,
        quantity: Number(quantity) || 0,
        delivery_date: delivery_date || null,
      })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-ink-200 bg-ink-50 transition-colors hover:border-brand"
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Garment preview" className="h-full w-full object-cover" />
          ) : (
            <GarmentPlaceholder className="h-9 w-9 text-ink-300" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-ink-950/0 text-[11px] font-medium text-transparent transition-colors group-hover:bg-ink-950/50 group-hover:text-white">
            {imagePreview ? "Change" : "Upload"}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleImageSelect(e.target.files?.[0] ?? null)}
        />
        <div className="flex-1 space-y-1">
          <p className="text-xs font-semibold text-ink-700">Garment / Product Image</p>
          <p className="text-xs text-ink-500">
            Used across the dashboard, order details, assignments, and data-entry screens for
            quick identification.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="IO / No" value={ioNo} onChange={(e) => setIoNo(e.target.value)} required />
        <Input label="Style Name" value={style} onChange={(e) => setStyle(e.target.value)} required />
        <Input label="Color" value={color} onChange={(e) => setColor(e.target.value)} />
        <Input
          label="Overall Delivery Date"
          type="date"
          value={deliveryDate ?? ""}
          onChange={(e) => setDeliveryDate(e.target.value)}
        />
      </div>

      <Textarea label="Description" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
      <Input label="Fabric" value={fabric ?? ""} onChange={(e) => setFabric(e.target.value)} placeholder="e.g. Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM" />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-700">Purchase Orders</p>
          <span className="text-xs text-ink-500">Total: {totalQty.toLocaleString()} PCS</span>
        </div>
        <div className="space-y-2">
          {poRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-lg border border-ink-100 bg-ink-50/50 p-2">
              <Input
                label="PO Number"
                value={row.po_number}
                onChange={(e) => updateRow(row.key, { po_number: e.target.value })}
              />
              <Input
                label="Quantity"
                type="number"
                min={0}
                value={row.quantity || ""}
                onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) })}
              />
              <Input
                label="Delivery Date"
                type="date"
                value={row.delivery_date ?? ""}
                onChange={(e) => updateRow(row.key, { delivery_date: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(row.key)}
                className="mb-0.5"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={addRow} className="mt-2">
          + Add PO
        </Button>
      </div>

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={submitting}>
          {initialOrder ? "Save Changes" : "Create Order"}
        </Button>
      </div>
    </form>
  );
}
