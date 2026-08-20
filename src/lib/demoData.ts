import { STAGE } from "./chain";
import type {
  MaterialEntry,
  MaterialRequirement,
  Order,
  PoSizeQuantity,
  ProductionLot,
  ProductionTxn,
  PurchaseOrder,
  WorkflowStage,
} from "./types";

/**
 * A complete, self-contained order that exists only in memory.
 *
 * It backs the Preview sandbox on Stage Roles: the real stage forms are
 * rendered against this instead of the database, so someone can fill fields in,
 * press the buttons and watch the totals move without a single row being
 * written anywhere.
 *
 * Every id is prefixed `demo-`. That prefix is the safety net -  the write
 * guards in useProductionChain.ts refuse to touch Supabase while demo mode is
 * on, and any id that did somehow escape is obviously not a real uuid.
 */

export const DEMO_PREFIX = "demo-";
export const DEMO_ORDER_ID = "demo-order";
export const DEMO_PO_ID = "demo-po";

export const DEMO_ORDER: Order = {
  id: DEMO_ORDER_ID,
  io_no: "DEMO/01",
  style: "SAMPLE CREW SWEATSHIRT",
  description: "PRACTICE ORDER -  nothing here is real",
  color: "NAVY",
  fabric: "Brushed Back Fleece 60% Cotton 40% Poly - 280GSM",
  image_path: null,
  total_qty: 1000,
  cut_quantity: null,
  delivery_date: "2026-12-31",
  created_by: null,
  is_hidden: false,
  created_at: "2026-01-01T00:00:00Z",
};

export const DEMO_PO: PurchaseOrder = {
  id: DEMO_PO_ID,
  order_id: DEMO_ORDER_ID,
  po_number: "DEMO-0001",
  quantity: 1000,
  cut_quantity: null,
  extra_percent: 0,
  delivery_date: "2026-12-15",
  created_at: "2026-01-01T00:00:00Z",
};

const SIZE_SPLIT: [string, number][] = [
  ["S", 150],
  ["M", 300],
  ["L", 350],
  ["XL", 200],
];

export const DEMO_SIZES: PoSizeQuantity[] = SIZE_SPLIT.map(([size_code, quantity], i) => ({
  id: `${DEMO_PREFIX}size-${size_code}`,
  po_id: DEMO_PO_ID,
  size_code,
  sort_order: i,
  quantity,
  created_at: "2026-01-01T00:00:00Z",
}));

export const DEMO_LOTS: ProductionLot[] = [
  {
    id: `${DEMO_PREFIX}lot-1`,
    order_id: DEMO_ORDER_ID,
    po_id: DEMO_PO_ID,
    lot_no: "LOT-001",
    fabric_type: "Single Jersey",
    notes: null,
    created_by: null,
    created_at: "2026-06-01T00:00:00Z",
  },
  {
    id: `${DEMO_PREFIX}lot-2`,
    order_id: DEMO_ORDER_ID,
    po_id: DEMO_PO_ID,
    lot_no: "LOT-002",
    fabric_type: "Single Jersey",
    notes: null,
    created_by: null,
    created_at: "2026-06-04T00:00:00Z",
  },
];

const REQUIREMENT_SPEC: [string, "yarn" | "fabric", number][] = [
  ["40s", "yarn", 260],
  ["30s", "yarn", 180],
  ["Single Jersey", "fabric", 420],
];

export const DEMO_REQUIREMENTS: MaterialRequirement[] = REQUIREMENT_SPEC.map(
  ([name, category, required_qty], i) => ({
    id: `${DEMO_PREFIX}req-${i}`,
    order_id: DEMO_ORDER_ID,
    po_id: DEMO_PO_ID,
    category,
    name,
    required_qty,
    unit: "KG" as const,
    supplier: "Sample Spinning Mills",
    sort_order: i,
    is_completed: i === 0,
    notes: null,
    created_by: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_by: null,
    updated_at: "2026-05-01T00:00:00Z",
  }),
);

/** Two deliveries per material -  enough to show the ledger accumulating rather
 * than a single tidy row that hides the point. Only the two entry types the
 * simplified flow actually uses: "dc" (Purchase Quantity, entered on Purchase
 * Order to Suppliers) and "inward" (Inward Confirmation, entered on Raw
 * Material Inward) -  Raw Material Planning records nothing beyond the
 * requirement itself. */
export const DEMO_MATERIAL_ENTRIES: MaterialEntry[] = DEMO_REQUIREMENTS.flatMap((r, ri) => {
  const first = Math.round(r.required_qty * 0.6);
  const second = r.required_qty - first;
  return (["dc", "inward"] as const).flatMap((entry_type, ti) =>
    [first, second].map((qty, bi) => ({
      id: `${DEMO_PREFIX}mat-${ri}-${ti}-${bi}`,
      requirement_id: r.id,
      entry_type,
      qty,
      entry_date: `2026-05-${String(10 + bi * 5).padStart(2, "0")}`,
      supplier: "Sample Spinning Mills",
      doc_no: entry_type === "dc" ? `DC-100${bi + 1}` : null,
      doc_date: entry_type === "dc" ? `2026-05-${String(10 + bi * 5).padStart(2, "0")}` : null,
      lot_ref: null,
      notes: bi === 1 && entry_type === "inward" ? "Balance delivery -  weighed at gate." : null,
      entered_by: "demo-user",
      created_at: "2026-05-10T00:00:00Z",
      updated_by: null,
      updated_at: "2026-05-10T00:00:00Z",
    })),
  );
});

/** Loss per fabric stage -  small and plausible, so the chain reads like a real
 * run rather than round numbers that never lose anything. */
const KG_FLOW: [string, number][] = [
  [STAGE.knitting, 0.015],
  [STAGE.dyeing, 0.02],
  [STAGE.brushing, 0.012],
  [STAGE.compacting, 0.01],
  [STAGE.fabricInhouse, 0.004],
  [STAGE.fabricInspection, 0.006],
];

const PCS_FLOW: [string, number][] = [
  [STAGE.panelChecking, 0.006],
  [STAGE.embroidery, 0.002],
  [STAGE.sewing, 0.011],
  [STAGE.checking, 0.008],
  [STAGE.ironing, 0.001],
  [STAGE.packing, 0.001],
];

let seq = 0;
function txn(over: Partial<ProductionTxn> & { section_id: string; unit: "KG" | "PCS" }): ProductionTxn {
  seq += 1;
  return {
    id: `${DEMO_PREFIX}txn-${seq}`,
    order_id: DEMO_ORDER_ID,
    po_id: DEMO_PO_ID,
    lot_id: null,
    size_code: null,
    txn_type: "process",
    qty_in: 0,
    qty_out: 0,
    qty_rejected: 0,
    qty_rework: 0,
    ref_name: null,
    doc_no: null,
    entry_date: "2026-06-10",
    notes: null,
    entered_by: "demo-user",
    created_at: "2026-06-10T00:00:00Z",
    updated_by: null,
    updated_at: "2026-06-10T00:00:00Z",
    ...over,
  };
}

/**
 * Walks the same chain a real order does, so whichever stage is previewed
 * already has an input carried down to it and a short history above the entry
 * form. Without this, every stage would open showing zeroes and the carry-over
 * -  the thing most worth demonstrating -  would be invisible.
 */
export function buildDemoTxns(stages: WorkflowStage[]): ProductionTxn[] {
  seq = 0;
  const rows: ProductionTxn[] = [];
  const byKey = new Map(stages.map((s) => [s.key, s]));

  const yarnKg = DEMO_REQUIREMENTS.reduce((sum, r) => sum + r.required_qty, 0);
  const carry = [Math.round(yarnKg * 0.55), yarnKg - Math.round(yarnKg * 0.55)];

  for (const [key, loss] of KG_FLOW) {
    const stage = byKey.get(key);
    if (!stage) continue;
    DEMO_LOTS.forEach((lot, i) => {
      const qtyIn = carry[i];
      const rejected = key === STAGE.fabricInspection ? Math.round(qtyIn * 0.004) : 0;
      const qtyOut = Math.round(qtyIn * (1 - loss)) - rejected;
      carry[i] = qtyOut;
      rows.push(
        txn({
          section_id: stage.id,
          unit: "KG",
          lot_id: lot.id,
          qty_in: qtyIn,
          qty_out: qtyOut,
          qty_rejected: rejected,
          ref_name: key === STAGE.knitting ? (i === 0 ? "JKR" : "Texwell") : null,
        }),
      );
    });
  }

  const storeStage = byKey.get(STAGE.fabricStore);
  const inStore = carry[0] + carry[1];
  if (storeStage) {
    rows.push(txn({ section_id: storeStage.id, unit: "KG", qty_in: inStore, qty_out: inStore }));
  }

  // Cutting: half of each size per lot, with a little lay wastage.
  const cutStage = byKey.get(STAGE.cutting);
  const cutBySize = new Map<string, number[]>();
  if (cutStage) {
    for (const s of DEMO_SIZES) {
      const total = Math.floor(s.quantity * 0.995);
      const perLot = [Math.ceil(total / 2), total - Math.ceil(total / 2)];
      cutBySize.set(s.size_code, perLot);
      DEMO_LOTS.forEach((lot, i) => {
        rows.push(
          txn({
            section_id: cutStage.id,
            unit: "PCS",
            lot_id: lot.id,
            size_code: s.size_code,
            qty_out: perLot[i],
          }),
        );
      });
    }
  }

  let pcsCarry = cutBySize;
  for (const [key, reject] of PCS_FLOW) {
    const stage = byKey.get(key);
    if (!stage) continue;
    const next = new Map<string, number[]>();
    for (const [sizeCode, perLot] of pcsCarry) {
      next.set(
        sizeCode,
        perLot.map((qtyIn, i) => {
          const rejected = Math.round(qtyIn * reject);
          const qtyOut = qtyIn - rejected;
          rows.push(
            txn({
              section_id: stage.id,
              unit: "PCS",
              lot_id: DEMO_LOTS[i].id,
              size_code: sizeCode,
              // Embroidery's own form splits send/receive; a single processed
              // row keeps the other stages' history readable.
              txn_type: key === STAGE.embroidery ? "receive" : "process",
              qty_in: qtyIn,
              qty_out: qtyOut,
              qty_rejected: rejected,
              ref_name: key === STAGE.sewing ? (i === 0 ? "Line 01" : "Line 02") : null,
            }),
          );
          return qtyOut;
        }),
      );
    }
    pcsCarry = next;
  }

  return rows;
}
