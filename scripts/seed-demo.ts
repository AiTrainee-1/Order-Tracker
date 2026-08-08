/**
 * Demo data bootstrap.
 *
 * Creates one example user per production section, then two sample orders with
 * size-wise POs and walks realistic production through the whole chain —
 * material requirements and receipts, lots raised at knitting, kilos losing a
 * little at every fabric process, then pieces cut size by size and carried
 * through to packing.
 *
 * Run AFTER supabase/schema.sql and every migration through
 * 011_production_chain.sql have been applied:
 *
 *   npm run seed:demo
 *
 * Safe to re-run. Auth accounts are looked up by email and reused; a sample
 * order that already exists has its production data cleared and rebuilt, so the
 * result is the same whether it's the first run or the fifth. Orders you
 * created yourself are never touched.
 *
 * WHAT IT SEEDS
 *
 *   Order A — MCKTM 18001-010 Classic Crew Sweatshirt, Navy.
 *     Both POs carried fully complete through all 20 stages. Losses are the
 *     ones a real run actually accumulates: a few kilos at each fabric process,
 *     ~0.5% cutting wastage, a small embroidery reject in job-work transit, and
 *     sequential QC rejects down the sewing line.
 *
 *   Order B — MCKTM 18045-022 Zip Hoodie Fleece, Charcoal.
 *     Deliberately mid-production. One PO stalls partway through Sewing — the
 *     line has been fed but hasn't finished, which is the app's orange "moved
 *     on, not completed" state. The other hasn't left Order Confirmation.
 */
import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEMO_PASSWORD = "demo123";
const EXPECTED_STAGES = 20;

interface SectionUser {
  sectionKey: string;
  name: string;
  username: string;
  role: string;
  phone: string;
}

const SECTION_USERS: SectionUser[] = [
  { sectionKey: "order_confirmation", name: "Ravi Kumar", username: "ravi", role: "Merchandiser", phone: "+91 98765 10001" },
  { sectionKey: "raw_material_planning", name: "Anita Sharma", username: "anita", role: "Raw Material Planner", phone: "+91 98765 10002" },
  { sectionKey: "po_to_suppliers", name: "Suresh Patel", username: "suresh", role: "Purchase Officer", phone: "+91 98765 10003" },
  { sectionKey: "raw_material_inward", name: "Divya Nair", username: "divya", role: "Store Inward Officer", phone: "+91 98765 10004" },
  { sectionKey: "knitting", name: "Karthik Rajan", username: "karthik", role: "Knitting Supervisor", phone: "+91 98765 10005" },
  { sectionKey: "dyeing", name: "Nandini Bose", username: "nandini", role: "Dyeing Supervisor", phone: "+91 98765 10006" },
  { sectionKey: "setting", name: "Imran Khan", username: "imran", role: "Setting Operator", phone: "+91 98765 10007" },
  { sectionKey: "raising", name: "Joseph Thomas", username: "joseph", role: "Raising Operator", phone: "+91 98765 10008" },
  { sectionKey: "compacting", name: "Bhavna Shah", username: "bhavna", role: "Compacting Operator", phone: "+91 98765 10009" },
  { sectionKey: "fabric_inhouse", name: "Rajesh Pillai", username: "rajesh", role: "Fabric Receiving", phone: "+91 98765 10010" },
  { sectionKey: "fabric_inspection", name: "Shalini Menon", username: "shalini", role: "Fabric Inspector", phone: "+91 98765 10011" },
  { sectionKey: "fabric_store", name: "Meena Iyer", username: "meena", role: "Fabric Store Keeper", phone: "+91 98765 10012" },
  { sectionKey: "pattern_marker", name: "Arjun Mehta", username: "arjun", role: "Pattern Master", phone: "+91 98765 10013" },
  { sectionKey: "cutting", name: "Vikram Singh", username: "vikram", role: "Cutting Master", phone: "+91 98765 10014" },
  { sectionKey: "panel_checking", name: "Fatima Sheikh", username: "fatima", role: "Panel Checker", phone: "+91 98765 10015" },
  { sectionKey: "embroidery", name: "Lakshmi Devi", username: "lakshmi", role: "Embroidery Supervisor", phone: "+91 98765 10016" },
  { sectionKey: "sewing", name: "Deepak Nair", username: "deepak", role: "Sewing Line Supervisor", phone: "+91 98765 10017" },
  { sectionKey: "checking", name: "Priya Reddy", username: "priya", role: "QC Checker", phone: "+91 98765 10018" },
  { sectionKey: "ironing", name: "Ramesh Babu", username: "ramesh", role: "Ironing Supervisor", phone: "+91 98765 10019" },
  { sectionKey: "packing", name: "Geeta Krishnan", username: "geeta", role: "Packing & Dispatch Manager", phone: "+91 98765 10020" },
];

/** A second and third planner on Raw Material Planning — the spec calls for
 * three people sharing that stage, and the app supports it by simply assigning
 * more than one user to the same section. */
const EXTRA_PLANNERS: SectionUser[] = [
  { sectionKey: "raw_material_planning", name: "Vinod Chandra", username: "vinod", role: "Yarn Planner", phone: "+91 98765 10021" },
  { sectionKey: "raw_material_planning", name: "Sneha Kulkarni", username: "sneha", role: "Fabric Planner", phone: "+91 98765 10022" },
];

const ALL_USERS = [...SECTION_USERS, ...EXTRA_PLANNERS];

interface StageRow {
  id: string;
  key: string;
  sequence_no: number;
  unit_type: "KG" | "PCS";
  typical_duration_days: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureAuthUser(admin: SupabaseClient, email: string, password: string): Promise<string> {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!createError) return created.user!.id;

  if (!/already been registered|already exists/i.test(createError.message)) {
    throw new Error(`Failed to create auth user ${email}: ${createError.message}`);
  }
  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw new Error(`Failed to look up existing user ${email}: ${listError.message}`);
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`Could not find existing auth user for ${email}.`);
  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, { password });
  if (updateError) throw new Error(`Failed to sync password for ${email}: ${updateError.message}`);
  return existing.id;
}

/** Walks a production calendar forward so entry dates read like a schedule
 * rather than every row landing on the same day. */
function calendar(startIso: string) {
  let current = new Date(startIso);
  return {
    today: () => current.toISOString().slice(0, 10),
    advance(days: number) {
      current = new Date(current.getTime() + days * 86_400_000);
      return current.toISOString().slice(0, 10);
    },
  };
}

async function insert(admin: SupabaseClient, table: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin.from(table).insert(rows);
  if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Order scaffolding
// ---------------------------------------------------------------------------

interface PoSpec {
  po_number: string;
  delivery_date: string;
  /** size code → pieces */
  sizes: Record<string, number>;
}

interface OrderSpec {
  io_no: string;
  style: string;
  description: string;
  color: string;
  fabric: string;
  delivery_date: string;
  /** Kilos of finished fabric per garment — a crew needs less than a hoodie. */
  kgPerPiece: number;
  pos: PoSpec[];
}

interface CreatedPo {
  id: string;
  po_number: string;
  quantity: number;
  sizes: { size_code: string; quantity: number }[];
}

interface CreatedOrder {
  id: string;
  spec: OrderSpec;
  pos: CreatedPo[];
}

/**
 * Creates the order if it's missing, then clears and rebuilds its production
 * data. Clearing is scoped to this one order, which is what makes re-running
 * safe without touching anything the user entered on their own orders.
 */
async function ensureOrder(admin: SupabaseClient, spec: OrderSpec): Promise<CreatedOrder> {
  const { data: existing, error: findError } = await admin
    .from("orders")
    .select("id")
    .eq("io_no", spec.io_no)
    .eq("style", spec.style)
    .maybeSingle();
  if (findError) throw new Error(`Failed to look up order ${spec.style}: ${findError.message}`);

  const totalQty = spec.pos.reduce(
    (sum, po) => sum + Object.values(po.sizes).reduce((a, b) => a + b, 0),
    0,
  );

  let orderId: string;
  if (existing) {
    orderId = (existing as { id: string }).id;
    // Wipe this order's production data so the walkthrough below is rebuilt
    // from a known-empty state. production_txns and material_entries cascade
    // from their parents, so lots/requirements/POs are enough.
    for (const table of ["production_txns", "stage_entries", "audit_log", "production_lots", "material_requirements"]) {
      const { error } = await admin.from(table).delete().eq("order_id", orderId);
      if (error) throw new Error(`Failed to clear ${table} for ${spec.style}: ${error.message}`);
    }
    const { error: poDeleteError } = await admin.from("purchase_orders").delete().eq("order_id", orderId);
    if (poDeleteError) throw new Error(`Failed to clear POs for ${spec.style}: ${poDeleteError.message}`);
    const { error: updateError } = await admin
      .from("orders")
      .update({ total_qty: totalQty, cut_quantity: null })
      .eq("id", orderId);
    if (updateError) throw new Error(`Failed to reset ${spec.style}: ${updateError.message}`);
  } else {
    const { data, error } = await admin
      .from("orders")
      .insert({
        io_no: spec.io_no,
        style: spec.style,
        description: spec.description,
        color: spec.color,
        fabric: spec.fabric,
        total_qty: totalQty,
        delivery_date: spec.delivery_date,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create ${spec.style}: ${error?.message}`);
    orderId = (data as { id: string }).id;
  }

  const { data: poRows, error: poError } = await admin
    .from("purchase_orders")
    .insert(
      spec.pos.map((po) => ({
        order_id: orderId,
        po_number: po.po_number,
        quantity: Object.values(po.sizes).reduce((a, b) => a + b, 0),
        delivery_date: po.delivery_date,
      })),
    )
    .select("id, po_number, quantity");
  if (poError || !poRows) throw new Error(`Failed to create POs for ${spec.style}: ${poError?.message}`);

  const pos: CreatedPo[] = [];
  for (const row of poRows as { id: string; po_number: string; quantity: number }[]) {
    const source = spec.pos.find((p) => p.po_number === row.po_number)!;
    const sizes = Object.entries(source.sizes).map(([size_code, quantity], i) => ({
      po_id: row.id,
      size_code,
      sort_order: i,
      quantity,
    }));
    await insert(admin, "po_size_quantities", sizes);
    pos.push({
      id: row.id,
      po_number: row.po_number,
      quantity: row.quantity,
      sizes: sizes.map((s) => ({ size_code: s.size_code, quantity: s.quantity })),
    });
  }

  return { id: orderId, spec, pos };
}

// ---------------------------------------------------------------------------
// The production walkthrough
// ---------------------------------------------------------------------------

interface SeedCtx {
  admin: SupabaseClient;
  stage: (key: string) => StageRow;
  userFor: (sectionKey: string) => string;
}

/** How far through the workflow a PO should be carried. */
type Depth = "confirmation_only" | "stall_at_sewing" | "complete";

/** Writes the gating row that tells progress.ts a stage moved. The quantity
 * layer holds the real numbers; this only has to be consistent with them. */
async function closeStage(
  ctx: SeedCtx,
  order: CreatedOrder,
  po: CreatedPo,
  stageKey: string,
  date: string,
  qty: { received: number; forwarded: number; rejected?: number },
  isCompleted: boolean,
  notes: string | null,
) {
  const s = ctx.stage(stageKey);
  await insert(ctx.admin, "stage_entries", [
    {
      order_id: order.id,
      po_id: po.id,
      section_id: s.id,
      entry_date: date,
      unit_type: s.unit_type,
      qty_received: Math.round(qty.received),
      qty_completed_today: Math.round(qty.forwarded),
      qty_forwarded: Math.round(qty.forwarded),
      qty_rejected: Math.round(qty.rejected ?? 0),
      // Every seeded row is a forward — either a completion or the deliberate
      // "moved on, not finished" state. Nothing here is a Save Plan.
      is_forwarded: true,
      is_completed: isCompleted,
      transfer_type: "none",
      notes,
      entered_by: ctx.userFor(stageKey),
    },
  ]);
}

async function seedPo(ctx: SeedCtx, order: CreatedOrder, po: CreatedPo, depth: Depth) {
  const { admin, stage, userFor } = ctx;
  const cal = calendar("2026-06-01");
  const pieces = po.quantity;

  // ---- 1. Order Confirmation --------------------------------------------
  await closeStage(ctx, order, po, "order_confirmation", cal.today(), { received: pieces, forwarded: pieces }, true,
    `PO ${po.po_number} confirmed — ${pieces.toLocaleString()} pcs across ${po.sizes.length} sizes.`);
  if (depth === "confirmation_only") return;

  // ---- 2. Raw Material Planning ------------------------------------------
  // Fabric needed for the garment, plus 4% for cutting wastage and process
  // loss. Yarn runs 3% above fabric because knitting and dyeing both shed some.
  const fabricKg = Math.round(pieces * order.spec.kgPerPiece * 1.04);
  const yarnKg = Math.round(fabricKg * 1.03);

  const yarnSplit = [
    { name: "40s", share: 0.55 },
    { name: "30s", share: 0.3 },
    { name: "20s", share: 0.15 },
  ];
  const fabricSplit = [
    { name: "Single Jersey", share: 0.82 },
    { name: "Rib 1x1", share: 0.18 },
  ];

  const planningDate = cal.advance(2);
  const requirementRows = [
    ...yarnSplit.map((y, i) => ({
      order_id: order.id,
      po_id: po.id,
      category: "yarn",
      name: y.name,
      required_qty: Math.round(yarnKg * y.share),
      unit: "KG",
      supplier: "Sri Lakshmi Spinning Mills",
      sort_order: i,
      is_completed: true,
      created_by: userFor("raw_material_planning"),
      updated_by: userFor("raw_material_planning"),
    })),
    ...fabricSplit.map((f, i) => ({
      order_id: order.id,
      po_id: po.id,
      category: "fabric",
      name: f.name,
      required_qty: Math.round(fabricKg * f.share),
      unit: "KG",
      supplier: "In-house knitting",
      sort_order: i,
      is_completed: true,
      created_by: userFor("raw_material_planning"),
      updated_by: userFor("raw_material_planning"),
    })),
  ];

  const { data: reqRows, error: reqError } = await admin
    .from("material_requirements")
    .insert(requirementRows)
    .select("id, name, required_qty, category");
  if (reqError || !reqRows) throw new Error(`Failed to seed requirements: ${reqError?.message}`);

  // Each requirement arrives in three batches — never one clean delivery,
  // which is the whole point of the multi-entry ledger.
  const entryRows: unknown[] = [];
  for (const r of reqRows as { id: string; name: string; required_qty: number; category: string }[]) {
    const total = r.required_qty;
    const batches = [Math.round(total * 0.4), Math.round(total * 0.35), 0];
    batches[2] = total - batches[0] - batches[1];

    entryRows.push({
      requirement_id: r.id,
      entry_type: "plan",
      qty: total,
      entry_date: planningDate,
      supplier: "Sri Lakshmi Spinning Mills",
      notes: `Production plan raised for ${r.name}.`,
      entered_by: userFor("raw_material_planning"),
    });

    batches.forEach((qty, i) => {
      const day = cal.advance(i === 0 ? 3 : 2);
      const docNo = `DC-${po.po_number.slice(-4)}-${i + 1}`;
      entryRows.push({
        requirement_id: r.id,
        entry_type: "dc",
        qty,
        entry_date: day,
        supplier: "Sri Lakshmi Spinning Mills",
        doc_no: docNo,
        doc_date: day,
        notes: `Batch ${i + 1} of 3 dispatched.`,
        entered_by: userFor("po_to_suppliers"),
      });
      entryRows.push({
        requirement_id: r.id,
        entry_type: "receipt",
        qty,
        entry_date: day,
        supplier: "Sri Lakshmi Spinning Mills",
        doc_no: docNo,
        notes: i === 1 ? "Weighed at gate — matched DC." : null,
        entered_by: userFor("po_to_suppliers"),
      });
      entryRows.push({
        requirement_id: r.id,
        entry_type: "inward",
        qty,
        entry_date: day,
        notes: null,
        entered_by: userFor("raw_material_inward"),
      });
    });
  }
  await insert(admin, "material_entries", entryRows);

  await closeStage(ctx, order, po, "raw_material_planning", planningDate,
    { received: yarnKg + fabricKg, forwarded: yarnKg + fabricKg }, true,
    "Yarn counts and fabric planned; all lines marked complete.");
  await closeStage(ctx, order, po, "po_to_suppliers", cal.today(),
    { received: yarnKg + fabricKg, forwarded: yarnKg + fabricKg }, true,
    "All DCs raised and received in full.");
  await closeStage(ctx, order, po, "raw_material_inward", cal.advance(1),
    { received: yarnKg + fabricKg, forwarded: yarnKg + fabricKg }, true,
    "Full quantity taken into store.");

  // ---- 3. Lots -----------------------------------------------------------
  // The batch sizes a knitting floor actually runs — two lots per PO here.
  const { data: lotRows, error: lotError } = await admin
    .from("production_lots")
    .insert([
      {
        order_id: order.id,
        po_id: po.id,
        lot_no: `LOT-${po.po_number.slice(-4)}-A`,
        fabric_type: "Single Jersey",
        created_by: userFor("knitting"),
      },
      {
        order_id: order.id,
        po_id: po.id,
        lot_no: `LOT-${po.po_number.slice(-4)}-B`,
        fabric_type: "Single Jersey",
        created_by: userFor("knitting"),
      },
    ])
    .select("id, lot_no");
  if (lotError || !lotRows) throw new Error(`Failed to create lots: ${lotError?.message}`);
  const lots = lotRows as { id: string; lot_no: string }[];

  // ---- 4. Fabric processing, lot by lot ----------------------------------
  // Every stage shaves a little off. These are the loss rates a well-run floor
  // actually sees, not round numbers.
  const FABRIC_STAGES: { key: string; loss: number; ref?: string }[] = [
    { key: "knitting", loss: 0.015, ref: "JKR" },
    { key: "dyeing", loss: 0.02 },
    { key: "setting", loss: 0.008 },
    { key: "raising", loss: 0.012 },
    { key: "compacting", loss: 0.01 },
    { key: "fabric_inhouse", loss: 0.004 },
    { key: "fabric_inspection", loss: 0.006 },
  ];

  // Split the yarn between the two lots, 55/45.
  const lotInput = [Math.round(yarnKg * 0.55), yarnKg - Math.round(yarnKg * 0.55)];
  const lotCarry = [...lotInput];
  const txnRows: unknown[] = [];

  for (const [stageIndex, fs] of FABRIC_STAGES.entries()) {
    const s = stage(fs.key);
    const date = cal.advance(s.typical_duration_days);
    let stageIn = 0;
    let stageOut = 0;

    lots.forEach((lot, i) => {
      const qtyIn = lotCarry[i];
      const rejected = fs.key === "fabric_inspection" ? Math.round(qtyIn * 0.004) : 0;
      const qtyOut = Math.round(qtyIn * (1 - fs.loss)) - rejected;
      lotCarry[i] = qtyOut;
      stageIn += qtyIn;
      stageOut += qtyOut;

      txnRows.push({
        order_id: order.id,
        po_id: po.id,
        section_id: s.id,
        lot_id: lot.id,
        txn_type: "process",
        unit: "KG",
        qty_in: qtyIn,
        qty_out: qtyOut,
        qty_rejected: rejected,
        ref_name: fs.ref ?? (i === 0 ? "JKR" : "Texwell"),
        entry_date: date,
        notes:
          stageIndex === 0
            ? `${lot.lot_no} knitted — ${qtyOut.toLocaleString()} KG greige.`
            : fs.key === "fabric_inspection" && rejected > 0
              ? `${rejected} KG held back on 4-point — barré marks on two rolls.`
              : null,
        entered_by: userFor(fs.key),
      });
    });

    await closeStage(ctx, order, po, fs.key, date, { received: stageIn, forwarded: stageOut }, true, null);
  }
  await insert(admin, "production_txns", txnRows);

  const inStoreKg = lotCarry.reduce((a, b) => a + b, 0);

  // ---- 5. Fabric Store + Pattern -----------------------------------------
  const storeDate = cal.advance(1);
  await insert(admin, "production_txns", [
    {
      order_id: order.id,
      po_id: po.id,
      section_id: stage("fabric_store").id,
      txn_type: "process",
      unit: "KG",
      qty_in: inStoreKg,
      qty_out: inStoreKg,
      entry_date: storeDate,
      notes: `${inStoreKg.toLocaleString()} KG on the shelf against a ${fabricKg.toLocaleString()} KG plan.`,
      entered_by: userFor("fabric_store"),
    },
  ]);
  await closeStage(ctx, order, po, "fabric_store", storeDate, { received: inStoreKg, forwarded: inStoreKg }, true, null);
  await closeStage(ctx, order, po, "pattern_marker", cal.advance(2), { received: inStoreKg, forwarded: inStoreKg }, true,
    "Marker planned — 6 sizes, 1:2:3:3:2:1 ratio.");

  // ---- 6. Cutting onwards, in pieces --------------------------------------
  // Each lot cuts roughly half of every size. Wastage is taken off the top and
  // the remainder is split so the sizes still add up to what was actually cut.
  const CUT_YIELD = 0.995;
  const cuttingDate = cal.advance(3);
  const cutTxns: unknown[] = [];
  const cutBySize = new Map<string, number>();

  for (const size of po.sizes) {
    const cutTotal = Math.floor(size.quantity * CUT_YIELD);
    const perLot = [Math.ceil(cutTotal / 2), cutTotal - Math.ceil(cutTotal / 2)];
    cutBySize.set(size.size_code, cutTotal);
    lots.forEach((lot, i) => {
      if (perLot[i] <= 0) return;
      cutTxns.push({
        order_id: order.id,
        po_id: po.id,
        section_id: stage("cutting").id,
        lot_id: lot.id,
        size_code: size.size_code,
        txn_type: "process",
        unit: "PCS",
        qty_in: 0,
        qty_out: perLot[i],
        entry_date: cuttingDate,
        entered_by: userFor("cutting"),
      });
    });
  }
  await insert(admin, "production_txns", cutTxns);

  const cutTotal = [...cutBySize.values()].reduce((a, b) => a + b, 0);
  await closeStage(ctx, order, po, "cutting", cuttingDate, { received: pieces, forwarded: cutTotal }, true,
    `${cutTotal.toLocaleString()} pcs cut against ${pieces.toLocaleString()} ordered — 0.5% lay wastage.`);

  const { error: cutQtyError } = await admin
    .from("purchase_orders")
    .update({ cut_quantity: cutTotal })
    .eq("id", po.id);
  if (cutQtyError) throw new Error(`Failed to set cut_quantity: ${cutQtyError.message}`);

  /**
   * Every PCS stage after Cutting is the same move: take what the previous
   * stage produced for each lot/size, lose a small percentage, pass it on.
   */
  async function garmentStage(
    key: string,
    carry: Map<string, number[]>,
    rejectRate: number,
    opts: { txnType?: "process" | "send" | "receive"; ref?: (i: number) => string; note?: string; complete?: boolean } = {},
  ): Promise<Map<string, number[]>> {
    const s = stage(key);
    const date = cal.advance(s.typical_duration_days);
    const rows: unknown[] = [];
    const next = new Map<string, number[]>();
    let stageIn = 0;
    let stageOut = 0;
    let stageRejected = 0;

    for (const [sizeCode, perLot] of carry) {
      const outPerLot = perLot.map((qtyIn, i) => {
        const rejected = Math.round(qtyIn * rejectRate);
        const qtyOut = qtyIn - rejected;
        stageIn += qtyIn;
        stageOut += qtyOut;
        stageRejected += rejected;
        rows.push({
          order_id: order.id,
          po_id: po.id,
          section_id: s.id,
          lot_id: lots[i].id,
          size_code: sizeCode,
          txn_type: opts.txnType ?? "process",
          unit: "PCS",
          qty_in: opts.txnType === "send" ? 0 : qtyIn,
          qty_out: qtyOut,
          qty_rejected: rejected,
          ref_name: opts.ref?.(i) ?? null,
          entry_date: date,
          entered_by: userFor(key),
        });
        return qtyOut;
      });
      next.set(sizeCode, outPerLot);
    }

    await insert(admin, "production_txns", rows);
    await closeStage(ctx, order, po, key, date,
      { received: stageIn, forwarded: stageOut, rejected: stageRejected },
      opts.complete ?? true, opts.note ?? null);
    return next;
  }

  let carry = new Map<string, number[]>();
  for (const size of po.sizes) {
    const total = cutBySize.get(size.size_code) ?? 0;
    carry.set(size.size_code, [Math.ceil(total / 2), total - Math.ceil(total / 2)]);
  }

  carry = await garmentStage("panel_checking", carry, 0.006, {
    note: "Panels checked lot-wise — a handful rejected for shade variation.",
  });

  // Embroidery goes out and comes back, so both directions are written.
  const embroideryStage = stage("embroidery");
  const sendDate = cal.advance(1);
  const sendRows: unknown[] = [];
  for (const [sizeCode, perLot] of carry) {
    perLot.forEach((qty, i) => {
      sendRows.push({
        order_id: order.id,
        po_id: po.id,
        section_id: embroideryStage.id,
        lot_id: lots[i].id,
        size_code: sizeCode,
        txn_type: "send",
        unit: "PCS",
        qty_in: 0,
        qty_out: qty,
        ref_name: "Sri Venkateswara Embroidery",
        doc_no: `EMB-DC-${po.po_number.slice(-4)}`,
        entry_date: sendDate,
        entered_by: userFor("embroidery"),
      });
    });
  }
  await insert(admin, "production_txns", sendRows);

  carry = await garmentStage("embroidery", carry, 0.002, {
    txnType: "receive",
    ref: () => "Sri Venkateswara Embroidery",
    note: "Received back from job work — small transit reject.",
  });

  if (depth === "stall_at_sewing") {
    // The line has been fed and is producing, but the batch isn't finished —
    // the app's orange "moved on, not completed" state.
    const s = stage("sewing");
    const date = cal.advance(4);
    const rows: unknown[] = [];
    let fedIn = 0;
    let outSoFar = 0;

    for (const [sizeCode, perLot] of carry) {
      perLot.forEach((qtyIn, i) => {
        const done = Math.round(qtyIn * 0.62);
        fedIn += qtyIn;
        outSoFar += done;
        rows.push({
          order_id: order.id,
          po_id: po.id,
          section_id: s.id,
          lot_id: lots[i].id,
          size_code: sizeCode,
          txn_type: "process",
          unit: "PCS",
          qty_in: qtyIn,
          qty_out: done,
          ref_name: i === 0 ? "Line 01" : "Line 02",
          entry_date: date,
          entered_by: userFor("sewing"),
        });
      });
    }
    await insert(admin, "production_txns", rows);
    await closeStage(ctx, order, po, "sewing", date, { received: fedIn, forwarded: outSoFar }, false,
      "Whole batch fed to the line; end-line QC still working through it. Balance to follow.");
    return;
  }

  carry = await garmentStage("sewing", carry, 0.011, {
    ref: (i) => (i === 0 ? "Line 01" : "Line 02"),
    note: "Both lines completed — sequential inline QC rejects.",
  });
  carry = await garmentStage("checking", carry, 0.008, { note: "Final inspection pass." });
  carry = await garmentStage("ironing", carry, 0.001, {});
  carry = await garmentStage("packing", carry, 0.001, { note: "Cartons sealed and ready for dispatch." });
}

// ---------------------------------------------------------------------------

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const emailDomain = process.env.VITE_AUTH_EMAIL_DOMAIN || "uktextiles.local";

  if (!url || !serviceRoleKey) {
    throw new Error(
      "VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env before seeding.",
    );
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: stageRows, error: stagesError } = await admin
    .from("workflow_stages")
    .select("id, key, sequence_no, unit_type, typical_duration_days")
    .order("sequence_no", { ascending: true });
  if (stagesError) throw new Error(`Failed to load workflow_stages: ${stagesError.message}`);
  if (!stageRows || stageRows.length !== EXPECTED_STAGES) {
    throw new Error(
      `Expected ${EXPECTED_STAGES} workflow_stages (found ${stageRows?.length ?? 0}). ` +
        "Run migration 011_production_chain.sql before seeding demo data.",
    );
  }

  const stageByKey = new Map((stageRows as StageRow[]).map((s) => [s.key, s]));
  const stage = (key: string): StageRow => {
    const s = stageByKey.get(key);
    if (!s) throw new Error(`Missing workflow_stages row for key "${key}"`);
    return s;
  };

  console.log(`Creating ${ALL_USERS.length} example users…`);
  const userIdByUsername = new Map<string, string>();
  for (const u of ALL_USERS) {
    const email = `${u.username}@${emailDomain}`;
    const userId = await ensureAuthUser(admin, email, DEMO_PASSWORD);
    const { error } = await admin.from("app_users").upsert({
      id: userId,
      name: u.name,
      username: u.username,
      password_plain: DEMO_PASSWORD,
      role: u.role,
      phone: u.phone,
      is_monitor_only: false,
      is_active: true,
    });
    if (error) throw new Error(`Failed to upsert app_users row for ${u.username}: ${error.message}`);
    userIdByUsername.set(u.username, userId);
    console.log(`  ✓ ${u.name} (@${u.username}) — ${u.role}`);
  }

  const userFor = (sectionKey: string): string => {
    const su = SECTION_USERS.find((s) => s.sectionKey === sectionKey);
    const id = su && userIdByUsername.get(su.username);
    if (!id) throw new Error(`No user configured for section ${sectionKey}`);
    return id;
  };

  console.log("Wiring users to their sections (Stage Roles) — applies to every order…");
  for (const u of ALL_USERS) {
    const s = stageByKey.get(u.sectionKey);
    const userId = userIdByUsername.get(u.username);
    if (!s || !userId) continue;
    const { error } = await admin
      .from("stage_assignments")
      .upsert({ user_id: userId, section_id: s.id, can_enter_data: true }, { onConflict: "user_id,section_id" });
    if (error) throw new Error(`Failed to assign ${u.username}: ${error.message}`);
  }
  console.log("  ✓ Raw Material Planning has three planners sharing it.");

  const ctx: SeedCtx = { admin, stage, userFor };

  console.log("Creating sample orders…");
  const orderA = await ensureOrder(admin, {
    io_no: "95/26",
    style: "MCKTM 18001-010",
    description: "CLASSIC CREW SWEATSHIRT",
    color: "NAVY",
    fabric: "Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM",
    delivery_date: "2026-11-20",
    kgPerPiece: 0.42,
    pos: [
      { po_number: "01700001", delivery_date: "2026-10-30", sizes: { XS: 420, S: 1180, M: 1960, L: 1740, XL: 890, "2XL": 310 } },
      { po_number: "01700002", delivery_date: "2026-11-14", sizes: { XS: 260, S: 720, M: 1210, L: 1080, XL: 540, "2XL": 190 } },
    ],
  });

  const orderB = await ensureOrder(admin, {
    io_no: "96/26",
    style: "MCKTM 18045-022",
    description: "ZIP THROUGH HOODIE FLEECE",
    color: "CHARCOAL GREY",
    fabric: "Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 320GSM",
    delivery_date: "2026-12-05",
    kgPerPiece: 0.58,
    pos: [
      { po_number: "01700010", delivery_date: "2026-11-25", sizes: { XS: 340, S: 980, M: 1620, L: 1440, XL: 760, "2XL": 260 } },
      { po_number: "01700011", delivery_date: "2026-12-05", sizes: { XS: 180, S: 510, M: 860, L: 770, XL: 400, "2XL": 140 } },
    ],
  });

  console.log(`Walking ${orderA.spec.style} through all ${EXPECTED_STAGES} stages…`);
  for (const po of orderA.pos) {
    await seedPo(ctx, orderA, po, "complete");
    console.log(`  ✓ PO ${po.po_number} — complete through Packing`);
  }

  console.log(`Walking ${orderB.spec.style} to a realistic mid-production state…`);
  await seedPo(ctx, orderB, orderB.pos[0], "stall_at_sewing");
  console.log(`  ✓ PO ${orderB.pos[0].po_number} — stalled partway through Sewing`);
  await seedPo(ctx, orderB, orderB.pos[1], "confirmation_only");
  console.log(`  ✓ PO ${orderB.pos[1].po_number} — confirmed, awaiting material planning`);

  console.log("\nDone. Sign in as any example user with the password 'demo123'.");
  console.log("Admins can see the full picture at Orders → open an order → Production Output & Reports.");
}

main().catch((err) => {
  console.error(`\nSeeding failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
