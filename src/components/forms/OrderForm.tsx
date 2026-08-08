import { useRef, useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/FormControls";
import { GarmentPlaceholder } from "../ui/GarmentPlaceholder";
import { DEFAULT_SIZE_TEMPLATE, sortSizes } from "../../lib/sizes";
import type { Order, PoSizeQuantity, PurchaseOrder } from "../../lib/types";
import type { OrderFormInput, OrderPoInput } from "../../hooks/useOrderMutations";

/**
 * Order creation, laid out the way the buying sheet is: sizes across the top,
 * one row per PO, quantities in the grid.
 *
 * The size columns belong to the ORDER, not to each PO — a style is cut in one
 * size set, and every PO of it ships some of each. That keeps the grid
 * rectangular (so it reads like the paper sheet) and means adding a size is one
 * action rather than one per PO. A PO that doesn't ship a given size just
 * leaves that cell empty.
 *
 * PO totals and the order total are computed, never typed — the number and its
 * breakdown then cannot drift apart.
 */

let rowSeq = 0;

interface PoRow {
  key: string;
  po_number: string;
  delivery_date: string | null;
  /** size code → quantity, held as strings so a cleared cell stays cleared
   * instead of snapping back to 0 while being typed. */
  qty: Record<string, string>;
}

function emptyRow(): PoRow {
  rowSeq += 1;
  return { key: `new-${rowSeq}`, po_number: "", delivery_date: "", qty: {} };
}

function rowTotal(row: PoRow, sizes: string[]): number {
  return sizes.reduce((total, code) => total + (Number(row.qty[code]) || 0), 0);
}

export function OrderForm({
  initialOrder,
  initialPurchaseOrders,
  initialSizes,
  existingImageUrl,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  initialOrder?: Order;
  initialPurchaseOrders?: PurchaseOrder[];
  initialSizes?: PoSizeQuantity[];
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

  const [sizes, setSizes] = useState<string[]>(() => {
    const existing = sortSizes(initialSizes ?? []).map((s) => s.size_code);
    const unique = Array.from(new Set(existing));
    return unique.length ? unique : [...DEFAULT_SIZE_TEMPLATE];
  });

  const [poRows, setPoRows] = useState<PoRow[]>(() => {
    if (!initialPurchaseOrders?.length) return [emptyRow()];
    return initialPurchaseOrders.map((po) => {
      const qty: Record<string, string> = {};
      for (const s of initialSizes ?? []) {
        if (s.po_id === po.id) qty[s.size_code] = String(s.quantity);
      }
      return {
        key: po.id,
        po_number: po.po_number,
        delivery_date: po.delivery_date,
        qty,
      };
    });
  });

  const [newSize, setNewSize] = useState("");

  const orderTotal = poRows.reduce((total, r) => total + rowTotal(r, sizes), 0);

  function updateRow(key: string, patch: Partial<Omit<PoRow, "qty">>) {
    setPoRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function updateQty(key: string, sizeCode: string, value: string) {
    setPoRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, qty: { ...r.qty, [sizeCode]: value } } : r)),
    );
  }

  function addSize() {
    const code = newSize.trim().toUpperCase();
    if (!code || sizes.includes(code)) return;
    setSizes((prev) => [...prev, code]);
    setNewSize("");
  }

  function removeSize(code: string) {
    setSizes((prev) => (prev.length > 1 ? prev.filter((s) => s !== code) : prev));
    setPoRows((prev) =>
      prev.map((r) => {
        const { [code]: _dropped, ...rest } = r.qty;
        return { ...r, qty: rest };
      }),
    );
  }

  function handleImageSelect(file: File | null) {
    setImageFile(file);
    if (file) setImagePreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const purchaseOrders: OrderPoInput[] = poRows.map((r) => {
      const sizeRows = sizes
        .map((code) => ({ size_code: code, quantity: Number(r.qty[code]) || 0 }))
        .filter((s) => s.quantity > 0);
      return {
        po_number: r.po_number,
        quantity: rowTotal(r, sizes),
        delivery_date: r.delivery_date || null,
        sizes: sizeRows,
      };
    });

    onSubmit({
      io_no: ioNo,
      style,
      description,
      color,
      fabric,
      delivery_date: deliveryDate || null,
      imageFile,
      purchaseOrders,
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
      <Input
        label="Fabric"
        value={fabric ?? ""}
        onChange={(e) => setFabric(e.target.value)}
        placeholder="e.g. Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM"
      />

      {/* ---------------------------------------------------------------- */}
      {/* Size columns                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-ink-800">Size set</p>
            <p className="text-[11px] text-ink-500">
              The sizes this style is made in. Every PO below is broken down across these, and every
              later stage — Cutting, Panel Checking, Sewing, Packing — tracks against them.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <Input
              label="Add size"
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSize();
                }
              }}
              placeholder="e.g. 3XL"
              className="w-28"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addSize} className="mb-0.5">
              + Add
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sizes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700"
            >
              {code}
              <button
                type="button"
                onClick={() => removeSize(code)}
                className="text-ink-400 transition-colors hover:text-status-bad"
                aria-label={`Remove size ${code}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* PO × size grid                                                    */}
      {/* ---------------------------------------------------------------- */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-700">Purchase Orders — size-wise quantity</p>
          <span className="text-xs font-semibold text-ink-700">
            Order total: {orderTotal.toLocaleString()} PCS
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                <th className="whitespace-nowrap px-2 py-2 text-left font-semibold">PO Number</th>
                {sizes.map((code) => (
                  <th key={code} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
                    {code}
                  </th>
                ))}
                <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">Total</th>
                <th className="whitespace-nowrap px-2 py-2 text-left font-semibold">Delivery</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {poRows.map((row) => (
                <tr key={row.key} className="bg-white">
                  <td className="px-2 py-1.5">
                    <input
                      value={row.po_number}
                      onChange={(e) => updateRow(row.key, { po_number: e.target.value })}
                      placeholder="01669678"
                      className="w-32 rounded-lg border border-ink-200 px-2 py-1.5 text-sm outline-none focus:border-brand"
                    />
                  </td>
                  {sizes.map((code) => (
                    <td key={code} className="px-1 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={row.qty[code] ?? ""}
                        onChange={(e) => updateQty(row.key, code, e.target.value)}
                        className="w-20 rounded-lg border border-ink-200 px-2 py-1.5 text-center text-sm outline-none focus:border-brand"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right text-sm font-bold tabular-nums text-ink-900">
                    {rowTotal(row, sizes).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      value={row.delivery_date ?? ""}
                      onChange={(e) => updateRow(row.key, { delivery_date: e.target.value })}
                      className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm outline-none focus:border-brand"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-status-bad hover:bg-red-50"
                      onClick={() =>
                        setPoRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : prev))
                      }
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50 text-xs font-bold text-ink-800">
                <td className="px-2 py-2">Total</td>
                {sizes.map((code) => (
                  <td key={code} className="px-2 py-2 text-center tabular-nums">
                    {poRows
                      .reduce((total, r) => total + (Number(r.qty[code]) || 0), 0)
                      .toLocaleString()}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums">{orderTotal.toLocaleString()}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={() => setPoRows((p) => [...p, emptyRow()])} className="mt-2">
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
