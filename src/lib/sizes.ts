import type { PoSizeQuantity, PurchaseOrder } from "./types";

/**
 * Size handling.
 *
 * Sizes are per-PO data, not a fixed enum — a joggers PO runs XS–2XL while a
 * kids' order might run 3-4Y/5-6Y. The list below is only the starting template
 * offered when creating an order; anything can be typed in, reordered or
 * removed. Everything downstream keys off whatever size codes the PO actually
 * has, so a new size never needs a code change.
 */
export const DEFAULT_SIZE_TEMPLATE = ["XS", "S", "M", "L", "XL", "2XL"] as const;

/** Placeholder written by migration 011 for POs that predate size tracking:
 * one row holding the whole PO quantity, so old orders stay valid until an
 * admin breaks them out into real sizes. */
export const LEGACY_SIZE_CODE = "TOTAL";

export function isLegacySizeRow(sizes: Pick<PoSizeQuantity, "size_code">[]): boolean {
  return sizes.length === 1 && sizes[0].size_code === LEGACY_SIZE_CODE;
}

export function sortSizes<T extends Pick<PoSizeQuantity, "sort_order" | "size_code">>(sizes: T[]): T[] {
  return [...sizes].sort((a, b) => a.sort_order - b.sort_order || a.size_code.localeCompare(b.size_code));
}

export function sumSizes(sizes: Pick<PoSizeQuantity, "quantity">[]): number {
  return sizes.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
}

/** Groups size rows by PO, pre-sorted, ready for lookup while rendering. */
export function groupSizesByPo(sizes: PoSizeQuantity[]): Map<string, PoSizeQuantity[]> {
  const map = new Map<string, PoSizeQuantity[]>();
  for (const s of sizes) map.set(s.po_id, [...(map.get(s.po_id) ?? []), s]);
  for (const [poId, rows] of map) map.set(poId, sortSizes(rows));
  return map;
}

/**
 * The size breakdown a stage should work against.
 *
 * Prefers the PO's own recorded sizes. Falls back to a single TOTAL row built
 * from the PO quantity so a PO whose sizes were never entered still renders and
 * still reconciles — a missing size split degrades the detail available, it
 * does not break the chain.
 */
export function effectiveSizes(
  po: PurchaseOrder | null | undefined,
  sizes: PoSizeQuantity[],
): { size_code: string; quantity: number }[] {
  if (sizes.length > 0) return sortSizes(sizes).map((s) => ({ size_code: s.size_code, quantity: s.quantity }));
  if (!po) return [];
  return [{ size_code: LEGACY_SIZE_CODE, quantity: po.quantity }];
}

/** Union of every size code across a set of POs, in first-seen order — used for
 * the column headers of order-wide size tables. */
export function unionSizeCodes(sizesByPo: Map<string, PoSizeQuantity[]>): string[] {
  const seen: string[] = [];
  for (const rows of sizesByPo.values()) {
    for (const r of rows) if (!seen.includes(r.size_code)) seen.push(r.size_code);
  }
  return seen;
}
