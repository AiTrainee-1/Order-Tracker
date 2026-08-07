/**
 * Demo data bootstrap: one example user per production section, two NEW
 * sample orders (each with two POs) added alongside whatever orders already
 * exist — including the 4 original demo orders from supabase/schema.sql,
 * which this script never touches — and realistic mock movement mirroring
 * exactly what each stage's real form would write.
 *
 * Run AFTER supabase/schema.sql and every migration through
 * 010_po_tracking_and_sections.sql have been applied (that migration reshapes
 * workflow_stages to 15 rows — this script depends on that shape, but does
 * NOT touch orders/purchase_orders):
 *
 *   npm run seed:demo
 *
 * Safe to re-run: auth accounts are looked up by email and reused, and orders
 * are looked up by (io_no, style) before creating — nothing is duplicated.
 *
 * Data design (see the PLAN comment block below function main for the full
 * per-PO walkthrough): one sample order is carried, PO by PO, all the way
 * through every one of the 15 stages exactly as a real production run would
 * be entered — including the small, realistic losses that accumulate at
 * Cutting, Embroidery, and Stitching's inline QC. The other sample order is
 * left genuinely mid-production: one PO stalls partway through Stitching (the
 * app's "moved on without completing" orange state), the other hasn't left
 * Raw Material Planning yet.
 */
import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  { sectionKey: "fabric_processing", name: "Karthik Rajan", username: "karthik", role: "Fabric Processing Supervisor", phone: "+91 98765 10005" },
  { sectionKey: "fabric_store", name: "Meena Iyer", username: "meena", role: "Fabric Store Keeper", phone: "+91 98765 10006" },
  { sectionKey: "pattern_marker", name: "Arjun Mehta", username: "arjun", role: "Pattern Master", phone: "+91 98765 10007" },
  { sectionKey: "cutting", name: "Vikram Singh", username: "vikram", role: "Cutting Master", phone: "+91 98765 10008" },
  { sectionKey: "printing_embroidery", name: "Lakshmi Devi", username: "lakshmi", role: "Embroidery Supervisor", phone: "+91 98765 10009" },
  { sectionKey: "stitching", name: "Deepak Nair", username: "deepak", role: "Sewing Line Supervisor", phone: "+91 98765 10010" },
  { sectionKey: "checking", name: "Priya Reddy", username: "priya", role: "QC Checker", phone: "+91 98765 10011" },
  { sectionKey: "ironing", name: "Ramesh Babu", username: "ramesh", role: "Ironing Supervisor", phone: "+91 98765 10012" },
  { sectionKey: "line_packing", name: "Sunita Rao", username: "sunita", role: "Packing Supervisor", phone: "+91 98765 10013" },
  { sectionKey: "finishing", name: "Manoj Verma", username: "manoj", role: "Finishing Supervisor", phone: "+91 98765 10014" },
  { sectionKey: "packing", name: "Geeta Krishnan", username: "geeta", role: "Packing & Dispatch Manager", phone: "+91 98765 10015" },
];

const DEMO_PASSWORD = "demo123";

interface StageRow {
  id: string;
  key: string;
  sequence_no: number;
  unit_type: "KG" | "PCS";
  form_type: string;
  typical_duration_days: number;
}

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

// ---------------------------------------------------------------------------
// Per-stage writers — each mirrors exactly what the real form in
// src/components/forms/stage/*.tsx submits for that form_type, so the seeded
// rows are indistinguishable from a real production entry.
// ---------------------------------------------------------------------------

interface Ctx {
  admin: SupabaseClient;
  orderId: string;
  poId: string;
  entryDate: string;
  userId: string;
}

interface EntryFields {
  section_id: string;
  entry_date: string;
  unit_type: "KG" | "PCS";
  qty_received: number;
  qty_completed_today: number;
  qty_forwarded: number;
  qty_shortage?: number;
  qty_rejected?: number;
  qty_returned?: number;
  is_external?: boolean;
  external_unit_name?: string | null;
  is_sent_outside?: boolean;
  is_returned?: boolean;
  is_completed: boolean;
  branch?: string | null;
  unit_name?: string | null;
  transfer_type?: "none" | "branch" | "unit" | "outside" | "others";
  transfer_to?: string | null;
  notes?: string | null;
  entered_by: string;
}

async function insertEntry(admin: SupabaseClient, orderId: string, poId: string, f: EntryFields) {
  const { error } = await admin.from("stage_entries").insert({
    order_id: orderId,
    po_id: poId,
    section_id: f.section_id,
    entry_date: f.entry_date,
    unit_type: f.unit_type,
    qty_received: f.qty_received,
    qty_completed_today: f.qty_completed_today,
    qty_forwarded: f.qty_forwarded,
    qty_shortage: f.qty_shortage ?? 0,
    qty_rejected: f.qty_rejected ?? 0,
    qty_returned: f.qty_returned ?? 0,
    is_external: f.is_external ?? false,
    external_unit_name: f.external_unit_name ?? null,
    is_sent_outside: f.is_sent_outside ?? false,
    is_returned: f.is_returned ?? false,
    is_completed: f.is_completed,
    branch: f.branch ?? null,
    unit_name: f.unit_name ?? null,
    transfer_type: f.transfer_type ?? "none",
    transfer_to: f.transfer_to ?? null,
    notes: f.notes ?? null,
    entered_by: f.entered_by,
    forwarded_to_user_id: null,
  });
  if (error) throw new Error(`Failed to insert stage_entries (${f.section_id}): ${error.message}`);
}

interface SubItemRow {
  key: string;
  label: string;
  planned: number;
  completed: number;
  isCompleted: boolean;
}

async function upsertSubItems(
  admin: SupabaseClient,
  orderId: string,
  sectionId: string,
  unitType: "KG" | "PCS",
  rows: SubItemRow[],
  userId: string,
) {
  const { error } = await admin.from("stage_sub_items").upsert(
    rows.map((r) => ({
      order_id: orderId,
      section_id: sectionId,
      item_key: r.key,
      item_label: r.label,
      planned_qty: r.planned,
      completed_qty: r.completed,
      unit_type: unitType,
      is_completed: r.isCompleted,
      notes: null,
      updated_by: userId,
    })),
    { onConflict: "order_id,section_id,item_key" },
  );
  if (error) throw new Error(`Failed to upsert stage_sub_items (${sectionId}): ${error.message}`);
}

/** order_confirmation (ConfirmationForm) — always confirms the PO's full quantity. */
async function writeConfirmation(ctx: Ctx, stage: StageRow, poQty: number, notes: string) {
  await insertEntry(ctx.admin, ctx.orderId, ctx.poId, {
    section_id: stage.id,
    entry_date: ctx.entryDate,
    unit_type: stage.unit_type,
    qty_received: poQty,
    qty_completed_today: poQty,
    qty_forwarded: poQty,
    is_completed: true,
    entered_by: ctx.userId,
    notes,
  });
}

/** raw_material_planning (MaterialPlanningForm) — plans each material; the
 * form never tracks completion per item here, only the total moves forward. */
async function writeMaterialPlanning(
  ctx: Ctx,
  stage: StageRow,
  planned: { yarn: number; fabric: number; trims: number; accessories: number },
  notes: string,
) {
  const rows: SubItemRow[] = [
    { key: "yarn", label: "Yarn", planned: planned.yarn, completed: 0, isCompleted: false },
    { key: "fabric", label: "Fabric", planned: planned.fabric, completed: 0, isCompleted: false },
    { key: "trims", label: "Trims", planned: planned.trims, completed: 0, isCompleted: false },
    { key: "accessories", label: "Accessories", planned: planned.accessories, completed: 0, isCompleted: false },
  ];
  await upsertSubItems(ctx.admin, ctx.orderId, stage.id, "KG", rows, ctx.userId);
  const total = planned.yarn + planned.fabric + planned.trims + planned.accessories;
  await insertEntry(ctx.admin, ctx.orderId, ctx.poId, {
    section_id: stage.id,
    entry_date: ctx.entryDate,
    unit_type: "KG",
    qty_received: total,
    qty_completed_today: total,
    qty_forwarded: total,
    is_completed: true,
    entered_by: ctx.userId,
    notes,
  });
  return total;
}

/** po_to_suppliers / pattern_marker / ironing / line_packing (SimpleConfirmForm)
 * — a pure confirmation against the PO's own quantity, no independent qty field. */
async function writeSimpleConfirm(ctx: Ctx, stage: StageRow, poQty: number, notes: string) {
  await insertEntry(ctx.admin, ctx.orderId, ctx.poId, {
    section_id: stage.id,
    entry_date: ctx.entryDate,
    unit_type: stage.unit_type,
    qty_received: poQty,
    qty_completed_today: poQty,
    qty_forwarded: poQty,
    is_completed: true,
    entered_by: ctx.userId,
    notes,
  });
}

/** raw_material_inward (MaterialInwardForm) — confirms arrival against what
 * Raw Material Planning actually planned per material. */
async function writeMaterialInward(
  ctx: Ctx,
  stage: StageRow,
  planned: { yarn: number; fabric: number; trims: number; accessories: number },
  received: { yarn: number; fabric: number; trims: number; accessories: number },
  notes: string,
) {
  const keys: (keyof typeof planned)[] = ["yarn", "fabric", "trims", "accessories"];
  const labels = { yarn: "Yarn", fabric: "Fabric", trims: "Trims", accessories: "Accessories" };
  const rows: SubItemRow[] = keys.map((k) => ({
    key: k,
    label: labels[k],
    planned: planned[k],
    completed: received[k],
    isCompleted: received[k] >= planned[k],
  }));
  await upsertSubItems(ctx.admin, ctx.orderId, stage.id, "KG", rows, ctx.userId);
  const totalPlanned = keys.reduce((s, k) => s + planned[k], 0);
  const totalReceived = keys.reduce((s, k) => s + received[k], 0);
  const shortage = Math.max(totalPlanned - totalReceived, 0);
  await insertEntry(ctx.admin, ctx.orderId, ctx.poId, {
    section_id: stage.id,
    entry_date: ctx.entryDate,
    unit_type: "KG",
    qty_received: totalPlanned,
    qty_completed_today: totalReceived,
    qty_forwarded: totalReceived,
    qty_shortage: shortage,
    is_completed: true,
    entered_by: ctx.userId,
    notes,
  });
  return totalReceived;
}

/** fabric_processing (FabricProcessingForm) — five processing steps against
 * the fabric-only planned figure; forwarded is the slowest step (bottleneck). */
async function writeFabricProcessing(
  ctx: Ctx,
  stage: StageRow,
  plannedFabricQty: number,
  steps: { knitting: number; dyeing: number; compacting: number; relaxing: number; fabric_inspection: number },
  notes: string,
  transfer?: { type: "unit" | "branch" | "outside" | "others"; to: string },
) {
  const labels: Record<string, string> = {
    knitting: "Knitting",
    dyeing: "Dyeing",
    compacting: "Compacting",
    relaxing: "Relaxing",
    fabric_inspection: "Fabric Inspection (4 Point)",
  };
  const entries = Object.entries(steps) as [string, number][];
  const rows: SubItemRow[] = entries.map(([key, completed]) => ({
    key,
    label: labels[key],
    planned: plannedFabricQty,
    completed,
    isCompleted: completed >= plannedFabricQty,
  }));
  await upsertSubItems(ctx.admin, ctx.orderId, stage.id, "KG", rows, ctx.userId);
  const forwarded = Math.min(...entries.map(([, v]) => v));
  await insertEntry(ctx.admin, ctx.orderId, ctx.poId, {
    section_id: stage.id,
    entry_date: ctx.entryDate,
    unit_type: "KG",
    qty_received: plannedFabricQty,
    qty_completed_today: forwarded,
    qty_forwarded: forwarded,
    qty_shortage: Math.max(plannedFabricQty - forwarded, 0),
    is_completed: true,
    entered_by: ctx.userId,
    notes,
    transfer_type: transfer?.type,
    transfer_to: transfer?.to,
  });
  return forwarded;
}

/** fabric_store (StoreCheckForm) — verifies what physically reached the store. */
async function writeStoreCheck(ctx: Ctx, stage: StageRow, plannedFabricQty: number, receivedQty: number, notes: string) {
  await insertEntry(ctx.admin, ctx.orderId, ctx.poId, {
    section_id: stage.id,
    entry_date: ctx.entryDate,
    unit_type: "KG",
    qty_received: plannedFabricQty,
    qty_completed_today: receivedQty,
    qty_forwarded: receivedQty,
    qty_shortage: Math.max(plannedFabricQty - receivedQty, 0),
    is_completed: true,
    entered_by: ctx.userId,
    notes,
  });
  return receivedQty;
}

/** cutting (CuttingForm) — converts KG planning into the fixed PCS baseline
 * for this PO; sets purchase_orders.cut_quantity, exactly as the real form does. */
async function writeCutting(ctx: Ctx, stage: StageRow, plannedPieces: number, cutPieces: number, forwardedPieces: number, notes: string) {
  await insertEntry(ctx.admin, ctx.orderId, ctx.poId, {
    section_id: stage.id,
    entry_date: ctx.entryDate,
    unit_type: "PCS",
    qty_received: plannedPieces,
    qty_completed_today: cutPieces,
    qty_forwarded: forwardedPieces,
    qty_shortage: Math.max(plannedPieces - forwardedPieces, 0),
    is_completed: true,
    entered_by: ctx.userId,
    notes,
  });
  const { error } = await ctx.admin.from("purchase_orders").update({ cut_quantity: forwardedPieces }).eq("id", ctx.poId);
  if (error) throw new Error(`Failed to set cut_quantity: ${error.message}`);
  return forwardedPieces;
}

/** printing_embroidery (DispatchReturnForm) — two-phase send/return against an
 * outside job worker. Pass returnedQty=null to leave it out sent (not modelled
 * here; every lane in this seed completes the return before moving on). */
async function writeEmbroidery(
  ctx: Ctx,
  stage: StageRow,
  poQty: number,
  sentQty: number,
  sentDate: string,
  vendor: string,
  location: string,
  sendNotes: string,
  returnedQty: number,
  returnDate: string,
  returnNotes: string,
) {
  await insertEntry(ctx.admin, ctx.orderId, ctx.poId, {
    section_id: stage.id,
    entry_date: sentDate,
    unit_type: "PCS",
    qty_received: poQty,
    qty_completed_today: sentQty,
    qty_forwarded: 0,
    is_external: true,
    external_unit_name: vendor,
    is_sent_outside: true,
    branch: vendor,
    transfer_type: "outside",
    transfer_to: vendor,
    is_completed: false,
    entered_by: ctx.userId,
    notes: `Location: ${location}. ${sendNotes}`,
  });
  await insertEntry(ctx.admin, ctx.orderId, ctx.poId, {
    section_id: stage.id,
    entry_date: returnDate,
    unit_type: "PCS",
    qty_received: poQty,
    qty_completed_today: returnedQty,
    qty_forwarded: returnedQty,
    qty_returned: returnedQty,
    qty_shortage: Math.max(sentQty - returnedQty, 0),
    is_external: true,
    external_unit_name: vendor,
    is_sent_outside: true,
    is_returned: true,
    branch: vendor,
    transfer_type: "outside",
    transfer_to: vendor,
    is_completed: true,
    entered_by: ctx.userId,
    notes: returnNotes,
  });
  return returnedQty;
}

/** checking / finishing / packing (SubStepsForm) — several sequential
 * checkpoints against the PO's fixed cut quantity; forwarded is the slowest
 * checkpoint. isFinal=false leaves it open (the orange "moved on, not
 * completed" state) with whatever's been keyed in so far. */
async function writeSubSteps(
  ctx: Ctx,
  stage: StageRow,
  items: { key: string; label: string }[],
  fixedQty: number,
  completedByKey: Record<string, number>,
  isFinal: boolean,
  notes: string,
) {
  const rows: SubItemRow[] = items.map((item) => {
    const completed = completedByKey[item.key] ?? 0;
    return {
      key: item.key,
      label: item.label,
      planned: fixedQty,
      completed,
      isCompleted: isFinal && completed >= fixedQty,
    };
  });
  await upsertSubItems(ctx.admin, ctx.orderId, stage.id, "PCS", rows, ctx.userId);
  const forwarded = Math.min(...items.map((item) => completedByKey[item.key] ?? 0));
  await insertEntry(ctx.admin, ctx.orderId, ctx.poId, {
    section_id: stage.id,
    entry_date: ctx.entryDate,
    unit_type: "PCS",
    qty_received: fixedQty,
    qty_completed_today: forwarded,
    qty_forwarded: forwarded,
    qty_shortage: isFinal ? Math.max(fixedQty - forwarded, 0) : 0,
    is_completed: isFinal,
    entered_by: ctx.userId,
    notes,
  });
  return forwarded;
}

// ---------------------------------------------------------------------------

interface OrderSeed {
  io_no: string;
  style: string;
  description: string;
  color: string;
  fabric: string;
  delivery_date: string;
  pos: { po_number: string; quantity: number; delivery_date: string }[];
}

interface CreatedOrder {
  id: string;
  pos: { id: string; po_number: string; quantity: number }[];
}

async function ensureOrder(admin: SupabaseClient, seed: OrderSeed): Promise<CreatedOrder> {
  const { data: existing } = await admin
    .from("orders")
    .select("id")
    .eq("io_no", seed.io_no)
    .eq("style", seed.style)
    .maybeSingle();

  let orderId: string;
  if (existing) {
    orderId = existing.id as string;
    console.log(`  · Order ${seed.io_no} / ${seed.style} already exists — reusing it.`);
  } else {
    const totalQty = seed.pos.reduce((sum, p) => sum + p.quantity, 0);
    const { data: order, error } = await admin
      .from("orders")
      .insert({
        io_no: seed.io_no,
        style: seed.style,
        description: seed.description,
        color: seed.color,
        fabric: seed.fabric,
        total_qty: totalQty,
        delivery_date: seed.delivery_date,
      })
      .select("id")
      .single();
    if (error || !order) throw new Error(`Failed to create order ${seed.style}: ${error?.message}`);
    orderId = order.id as string;

    const { error: poError } = await admin.from("purchase_orders").insert(
      seed.pos.map((p) => ({
        order_id: orderId,
        po_number: p.po_number,
        quantity: p.quantity,
        delivery_date: p.delivery_date,
      })),
    );
    if (poError) throw new Error(`Failed to create POs for ${seed.style}: ${poError.message}`);
    console.log(`  ✓ Created order ${seed.io_no} / ${seed.style} with ${seed.pos.length} POs`);
  }

  const { data: pos, error: posError } = await admin
    .from("purchase_orders")
    .select("id, po_number, quantity")
    .eq("order_id", orderId)
    .order("po_number", { ascending: true });
  if (posError || !pos) throw new Error(`Failed to load POs for order ${orderId}: ${posError?.message}`);

  return { id: orderId, pos: pos as CreatedOrder["pos"] };
}

/** A running production calendar for one PO — each call advances by a
 * stage's typical_duration_days, so entry dates read like a real schedule
 * instead of a flat +N-days-per-row loop. */
function dateCursor(startIso: string) {
  let current = new Date(startIso);
  return {
    current: () => current.toISOString().slice(0, 10),
    advance: (days: number) => {
      current = new Date(current.getTime() + days * 86_400_000);
      return current.toISOString().slice(0, 10);
    },
  };
}

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
    .select("id, key, sequence_no, unit_type, form_type, typical_duration_days")
    .order("sequence_no", { ascending: true });
  if (stagesError) throw new Error(`Failed to load workflow_stages: ${stagesError.message}`);
  if (!stageRows || stageRows.length !== 15) {
    throw new Error(
      `Expected 15 workflow_stages (found ${stageRows?.length ?? 0}). Run migration ` +
        "010_po_tracking_and_sections.sql before seeding demo data.",
    );
  }
  const stageByKey = new Map((stageRows as StageRow[]).map((s) => [s.key, s]));
  const stage = (key: string): StageRow => {
    const s = stageByKey.get(key);
    if (!s) throw new Error(`Missing workflow_stages row for key "${key}"`);
    return s;
  };

  console.log(`Creating ${SECTION_USERS.length} example users…`);
  const userIdByUsername = new Map<string, string>();
  for (const u of SECTION_USERS) {
    const email = `${u.username}@${emailDomain}`;
    const userId = await ensureAuthUser(admin, email, DEMO_PASSWORD);
    const { error: profileError } = await admin.from("app_users").upsert({
      id: userId,
      name: u.name,
      username: u.username,
      password_plain: DEMO_PASSWORD,
      role: u.role,
      phone: u.phone,
      is_monitor_only: false,
      is_active: true,
    });
    if (profileError) throw new Error(`Failed to upsert app_users row for ${u.username}: ${profileError.message}`);
    userIdByUsername.set(u.username, userId);
    console.log(`  ✓ ${u.name} (@${u.username}) — ${u.role}`);
  }
  const userFor = (sectionKey: string): string => {
    const su = SECTION_USERS.find((s) => s.sectionKey === sectionKey);
    const id = su && userIdByUsername.get(su.username);
    if (!id) throw new Error(`No user configured for section ${sectionKey}`);
    return id;
  };

  console.log("Wiring each user to their section (Stage Roles) — applies to every order, old and new…");
  for (const su of SECTION_USERS) {
    const s = stageByKey.get(su.sectionKey);
    const userId = userIdByUsername.get(su.username);
    if (!s || !userId) continue;
    const { error } = await admin
      .from("stage_assignments")
      .upsert({ user_id: userId, section_id: s.id, can_enter_data: true }, { onConflict: "user_id,section_id" });
    if (error) throw new Error(`Failed to assign ${su.username} to ${su.sectionKey}: ${error.message}`);
  }

  // =========================================================================
  // PLAN
  //
  // Order A — MCKTM 18001-010, Classic Crew Sweatshirt, Navy — CARRIED FULLY
  // COMPLETE through all 15 stages, both its POs. Fabric consumption ~0.42
  // kg/pc for a basic crew (no hood/zip). Small realistic losses accumulate
  // at Cutting (~0.5% wastage), Embroidery (~0.2% reject in job-work transit),
  // and Stitching's inline QC (sequential small rejects) — everything
  // upstream of Cutting (materials) arrives in full, which is the realistic
  // case for a well-managed supplier relationship. Checking, Ironing and the
  // interim Packing are each a quick pass/fail confirmation, as they would be
  // on the real floor.
  //
  // Order B — MCKTM 18045-022, Zip Hoodie Fleece, Charcoal Grey — left
  // genuinely PARTIAL. PO 01700010 is carried the same way as Order A through
  // Embroidery, then stalls partway through Stitching: the line has fed the
  // whole batch and is progressing through its four checkpoints at different
  // speeds (a completely normal, sequential sewing-line QC bottleneck) —
  // moved forward without completing, so it shows the orange "not completed"
  // state and Checking unlocks with nothing entered yet. PO 01700011 hasn't
  // gone past Order Confirmation — Raw Material Planning is sitting
  // untouched, exactly as it would if the planner simply hasn't gotten to it
  // yet.
  // =========================================================================

  console.log("Creating sample orders…");
  const orderA = await ensureOrder(admin, {
    io_no: "95/26",
    style: "MCKTM 18001-010",
    description: "CLASSIC CREW SWEATSHIRT",
    color: "NAVY",
    fabric: "Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM",
    delivery_date: "2026-11-10",
    pos: [
      { po_number: "01700001", quantity: 6000, delivery_date: "2026-10-20" },
      { po_number: "01700002", quantity: 4200, delivery_date: "2026-11-10" },
    ],
  });
  const orderB = await ensureOrder(admin, {
    io_no: "96/26",
    style: "MCKTM 18045-022",
    description: "ZIP HOODIE FLEECE",
    color: "CHARCOAL GREY",
    fabric: "Brushed Back Fleece 65% Cotton 35% Poly - 320GSM",
    delivery_date: "2026-11-24",
    pos: [
      { po_number: "01700010", quantity: 5200, delivery_date: "2026-11-05" },
      { po_number: "01700011", quantity: 3100, delivery_date: "2026-11-24" },
    ],
  });

  console.log("Writing realistic production movement…");

  // --- Order A / PO 01700001 (6000 pcs) — fully completed ------------------
  {
    const po = orderA.pos.find((p) => p.po_number === "01700001")!;
    const d = dateCursor("2026-08-10");
    let ctx: Ctx = { admin, orderId: orderA.id, poId: po.id, entryDate: d.current(), userId: userFor("order_confirmation") };
    await writeConfirmation(ctx, stage("order_confirmation"), po.quantity, "PO received and confirmed with buyer techpack. Ex-factory 20 Oct.");

    ctx = { ...ctx, entryDate: d.advance(stage("order_confirmation").typical_duration_days), userId: userFor("raw_material_planning") };
    const planned = { yarn: 0, fabric: 2520, trims: 90, accessories: 15 };
    await writeMaterialPlanning(ctx, stage("raw_material_planning"), planned, "Sourcing finished fabric — no in-house knitting for this style. Fabric @0.42kg/pc incl. wastage allowance.");

    ctx = { ...ctx, entryDate: d.advance(stage("raw_material_planning").typical_duration_days), userId: userFor("po_to_suppliers") };
    await writeSimpleConfirm(ctx, stage("po_to_suppliers"), po.quantity, "POs raised with fabric mill and trims vendor as per material plan.");

    ctx = { ...ctx, entryDate: d.advance(stage("po_to_suppliers").typical_duration_days), userId: userFor("raw_material_inward") };
    await writeMaterialInward(ctx, stage("raw_material_inward"), planned, planned, "Full delivery received against PO — fabric, rib trims and hardware all matched the material plan.");

    ctx = { ...ctx, entryDate: d.advance(stage("raw_material_inward").typical_duration_days), userId: userFor("fabric_processing") };
    const fabricForwarded = await writeFabricProcessing(
      ctx,
      stage("fabric_processing"),
      planned.fabric,
      { knitting: 2520, dyeing: 2520, compacting: 2520, relaxing: 2520, fabric_inspection: 2520 },
      "Piece-dyed navy, compacted and relaxed 24hrs before inspection. No shade bands found.",
      { type: "unit", to: "Unit 2 — Wet Processing" },
    );

    ctx = { ...ctx, entryDate: d.advance(stage("fabric_processing").typical_duration_days), userId: userFor("fabric_store") };
    await writeStoreCheck(ctx, stage("fabric_store"), planned.fabric, fabricForwarded, "Fabric rolls counted in and shade-sorted at store.");

    ctx = { ...ctx, entryDate: d.advance(stage("fabric_store").typical_duration_days), userId: userFor("pattern_marker") };
    await writeSimpleConfirm(ctx, stage("pattern_marker"), po.quantity, "Marker efficiency 84% across size ratio. Approved for cutting.");

    ctx = { ...ctx, entryDate: d.advance(stage("pattern_marker").typical_duration_days), userId: userFor("cutting") };
    const cutQty = await writeCutting(ctx, stage("cutting"), po.quantity, 5985, 5970, "30 pcs cutting wastage (fabric flaws at roll ends) — within 1% tolerance.");

    ctx = { ...ctx, entryDate: d.advance(stage("cutting").typical_duration_days), userId: userFor("printing_embroidery") };
    const embroideryReturned = await writeEmbroidery(
      ctx,
      stage("printing_embroidery"),
      po.quantity,
      cutQty,
      ctx.entryDate,
      "Sunrise Embroidery Works, Tirupur",
      "Tirupur",
      "Chest logo, navy thread, 3500 stitch count.",
      5960,
      d.advance(stage("printing_embroidery").typical_duration_days),
      "10 pcs rejected for thread breaks/misalignment — recut not required, absorbed as embroidery loss.",
    );

    ctx = { ...ctx, entryDate: d.advance(stage("printing_embroidery").typical_duration_days), userId: userFor("stitching") };
    const stitchingItems = [
      { key: "line_feeding", label: "Line Feeding" },
      { key: "inline_qc", label: "Inline QC" },
      { key: "end_line_qc", label: "End Line QC" },
      { key: "measurement_check", label: "Measurement Check" },
    ];
    const stitchingForwarded = await writeSubSteps(
      ctx,
      stage("stitching"),
      stitchingItems,
      cutQty,
      { line_feeding: embroideryReturned, inline_qc: 5950, end_line_qc: 5945, measurement_check: 5940 },
      true,
      "Full batch stitched. 30 pcs rejected across inline/end-line QC checkpoints (seam/measurement).",
    );

    ctx = { ...ctx, entryDate: d.advance(stage("stitching").typical_duration_days), userId: userFor("checking") };
    await writeSimpleConfirm(ctx, stage("checking"), po.quantity, "100% garment checking passed — AQL 1.5 sample cleared.");

    ctx = { ...ctx, entryDate: d.advance(stage("checking").typical_duration_days), userId: userFor("ironing") };
    await writeSimpleConfirm(ctx, stage("ironing"), po.quantity, "Steam-pressed, folded ready for pack.");

    ctx = { ...ctx, entryDate: d.advance(stage("ironing").typical_duration_days), userId: userFor("line_packing") };
    await writeSimpleConfirm(ctx, stage("line_packing"), po.quantity, "Poly-bagged at line, staged for finishing.");

    ctx = { ...ctx, entryDate: d.advance(stage("line_packing").typical_duration_days), userId: userFor("finishing") };
    const finishingItems = [
      { key: "thread_trimming", label: "Thread Trimming" },
      { key: "ironing", label: "Ironing" },
      { key: "spot_cleaning", label: "Spot Cleaning" },
      { key: "final_inspection", label: "Final Inspection" },
      { key: "metal_detection", label: "Metal Detection" },
    ];
    const finishingForwarded = await writeSubSteps(
      ctx,
      stage("finishing"),
      finishingItems,
      cutQty,
      { thread_trimming: stitchingForwarded, ironing: stitchingForwarded, spot_cleaning: 5938, final_inspection: 5935, metal_detection: 5935 },
      true,
      "5 pcs held at final inspection for spot stains, cleared after rework — 5935 pcs cleared metal detection.",
    );

    ctx = { ...ctx, entryDate: d.advance(stage("packing").typical_duration_days), userId: userFor("packing") };
    const packingItems = [
      { key: "folding", label: "Folding" },
      { key: "poly_bag", label: "Poly Bag" },
      { key: "barcode", label: "Barcode" },
      { key: "carton_packing", label: "Carton Packing" },
      { key: "carton_qc", label: "Carton QC" },
    ];
    await writeSubSteps(
      ctx,
      stage("packing"),
      packingItems,
      cutQty,
      { folding: finishingForwarded, poly_bag: finishingForwarded, barcode: finishingForwarded, carton_packing: finishingForwarded, carton_qc: finishingForwarded },
      true,
      "5935 pcs carton-packed, 199 cartons @30pcs avg. Ready for dispatch — PO complete.",
    );
    console.log(`  ✓ Order A / PO ${po.po_number} — fully completed, ${finishingForwarded.toLocaleString()} pcs shipped-ready`);
  }

  // --- Order A / PO 01700002 (4200 pcs) — fully completed -------------------
  {
    const po = orderA.pos.find((p) => p.po_number === "01700002")!;
    const d = dateCursor("2026-08-10");
    let ctx: Ctx = { admin, orderId: orderA.id, poId: po.id, entryDate: d.current(), userId: userFor("order_confirmation") };
    await writeConfirmation(ctx, stage("order_confirmation"), po.quantity, "PO received and confirmed with buyer techpack. Ex-factory 20 Oct.");

    ctx = { ...ctx, entryDate: d.advance(stage("order_confirmation").typical_duration_days), userId: userFor("raw_material_planning") };
    const planned = { yarn: 0, fabric: 1764, trims: 60, accessories: 10 };
    await writeMaterialPlanning(ctx, stage("raw_material_planning"), planned, "Second PO of the same style/colour — material plan scaled to 4200 pcs.");

    ctx = { ...ctx, entryDate: d.advance(stage("raw_material_planning").typical_duration_days), userId: userFor("po_to_suppliers") };
    await writeSimpleConfirm(ctx, stage("po_to_suppliers"), po.quantity, "Added to the same supplier POs as PO 01700001 — combined delivery.");

    ctx = { ...ctx, entryDate: d.advance(stage("po_to_suppliers").typical_duration_days), userId: userFor("raw_material_inward") };
    await writeMaterialInward(ctx, stage("raw_material_inward"), planned, planned, "Full delivery received, matched to material plan.");

    ctx = { ...ctx, entryDate: d.advance(stage("raw_material_inward").typical_duration_days), userId: userFor("fabric_processing") };
    const fabricForwarded = await writeFabricProcessing(
      ctx,
      stage("fabric_processing"),
      planned.fabric,
      { knitting: 1764, dyeing: 1764, compacting: 1764, relaxing: 1764, fabric_inspection: 1764 },
      "Same dye lot as PO 01700001 — processed in the same batch.",
      { type: "unit", to: "Unit 2 — Wet Processing" },
    );

    ctx = { ...ctx, entryDate: d.advance(stage("fabric_processing").typical_duration_days), userId: userFor("fabric_store") };
    await writeStoreCheck(ctx, stage("fabric_store"), planned.fabric, fabricForwarded, "Fabric rolls counted in and shade-sorted at store.");

    ctx = { ...ctx, entryDate: d.advance(stage("fabric_store").typical_duration_days), userId: userFor("pattern_marker") };
    await writeSimpleConfirm(ctx, stage("pattern_marker"), po.quantity, "Same marker as PO 01700001, re-graded for this PO's size ratio.");

    ctx = { ...ctx, entryDate: d.advance(stage("pattern_marker").typical_duration_days), userId: userFor("cutting") };
    const cutQty = await writeCutting(ctx, stage("cutting"), po.quantity, 4190, 4180, "20 pcs cutting wastage — within tolerance.");

    ctx = { ...ctx, entryDate: d.advance(stage("cutting").typical_duration_days), userId: userFor("printing_embroidery") };
    const embroideryReturned = await writeEmbroidery(
      ctx,
      stage("printing_embroidery"),
      po.quantity,
      cutQty,
      ctx.entryDate,
      "Sunrise Embroidery Works, Tirupur",
      "Tirupur",
      "Chest logo, navy thread, 3500 stitch count — same job as PO 01700001.",
      4175,
      d.advance(stage("printing_embroidery").typical_duration_days),
      "5 pcs rejected for thread breaks.",
    );

    ctx = { ...ctx, entryDate: d.advance(stage("printing_embroidery").typical_duration_days), userId: userFor("stitching") };
    const stitchingItems = [
      { key: "line_feeding", label: "Line Feeding" },
      { key: "inline_qc", label: "Inline QC" },
      { key: "end_line_qc", label: "End Line QC" },
      { key: "measurement_check", label: "Measurement Check" },
    ];
    const stitchingForwarded = await writeSubSteps(
      ctx,
      stage("stitching"),
      stitchingItems,
      cutQty,
      { line_feeding: embroideryReturned, inline_qc: 4170, end_line_qc: 4165, measurement_check: 4160 },
      true,
      "Full batch stitched. 20 pcs rejected across inline/end-line QC checkpoints.",
    );

    ctx = { ...ctx, entryDate: d.advance(stage("stitching").typical_duration_days), userId: userFor("checking") };
    await writeSimpleConfirm(ctx, stage("checking"), po.quantity, "100% garment checking passed.");

    ctx = { ...ctx, entryDate: d.advance(stage("checking").typical_duration_days), userId: userFor("ironing") };
    await writeSimpleConfirm(ctx, stage("ironing"), po.quantity, "Steam-pressed, folded ready for pack.");

    ctx = { ...ctx, entryDate: d.advance(stage("ironing").typical_duration_days), userId: userFor("line_packing") };
    await writeSimpleConfirm(ctx, stage("line_packing"), po.quantity, "Poly-bagged at line, staged for finishing.");

    ctx = { ...ctx, entryDate: d.advance(stage("line_packing").typical_duration_days), userId: userFor("finishing") };
    const finishingItems = [
      { key: "thread_trimming", label: "Thread Trimming" },
      { key: "ironing", label: "Ironing" },
      { key: "spot_cleaning", label: "Spot Cleaning" },
      { key: "final_inspection", label: "Final Inspection" },
      { key: "metal_detection", label: "Metal Detection" },
    ];
    const finishingForwarded = await writeSubSteps(
      ctx,
      stage("finishing"),
      finishingItems,
      cutQty,
      { thread_trimming: stitchingForwarded, ironing: stitchingForwarded, spot_cleaning: 4158, final_inspection: 4155, metal_detection: 4155 },
      true,
      "5 pcs held for spot stains, cleared after rework.",
    );

    ctx = { ...ctx, entryDate: d.advance(stage("packing").typical_duration_days), userId: userFor("packing") };
    const packingItems = [
      { key: "folding", label: "Folding" },
      { key: "poly_bag", label: "Poly Bag" },
      { key: "barcode", label: "Barcode" },
      { key: "carton_packing", label: "Carton Packing" },
      { key: "carton_qc", label: "Carton QC" },
    ];
    await writeSubSteps(
      ctx,
      stage("packing"),
      packingItems,
      cutQty,
      { folding: finishingForwarded, poly_bag: finishingForwarded, barcode: finishingForwarded, carton_packing: finishingForwarded, carton_qc: finishingForwarded },
      true,
      "4155 pcs carton-packed, ready for dispatch — PO complete.",
    );
    console.log(`  ✓ Order A / PO ${po.po_number} — fully completed, ${finishingForwarded.toLocaleString()} pcs shipped-ready`);
  }

  // --- Order B / PO 01700010 (5200 pcs) — partial: stalls in Stitching ------
  {
    const po = orderB.pos.find((p) => p.po_number === "01700010")!;
    const d = dateCursor("2026-08-12");
    let ctx: Ctx = { admin, orderId: orderB.id, poId: po.id, entryDate: d.current(), userId: userFor("order_confirmation") };
    await writeConfirmation(ctx, stage("order_confirmation"), po.quantity, "PO received and confirmed. Zip hoodie — buyer approved hood/pocket construction sample.");

    ctx = { ...ctx, entryDate: d.advance(stage("order_confirmation").typical_duration_days), userId: userFor("raw_material_planning") };
    const planned = { yarn: 0, fabric: 3020, trims: 135, accessories: 45 };
    await writeMaterialPlanning(ctx, stage("raw_material_planning"), planned, "Hoodie needs more fabric (hood + pocket) and trims (zip tape, drawcord) than a crew style — 0.58kg/pc.");

    ctx = { ...ctx, entryDate: d.advance(stage("raw_material_planning").typical_duration_days), userId: userFor("po_to_suppliers") };
    await writeSimpleConfirm(ctx, stage("po_to_suppliers"), po.quantity, "POs raised — fabric, YKK zips, drawcord and hardware.");

    ctx = { ...ctx, entryDate: d.advance(stage("po_to_suppliers").typical_duration_days), userId: userFor("raw_material_inward") };
    await writeMaterialInward(ctx, stage("raw_material_inward"), planned, planned, "Full delivery received — fabric, zip tape and hardware all matched.");

    ctx = { ...ctx, entryDate: d.advance(stage("raw_material_inward").typical_duration_days), userId: userFor("fabric_processing") };
    const fabricForwarded = await writeFabricProcessing(
      ctx,
      stage("fabric_processing"),
      planned.fabric,
      { knitting: 3020, dyeing: 3020, compacting: 3020, relaxing: 3020, fabric_inspection: 3020 },
      "Charcoal grey, garment-dyed. No shade bands found.",
    );

    ctx = { ...ctx, entryDate: d.advance(stage("fabric_processing").typical_duration_days), userId: userFor("fabric_store") };
    await writeStoreCheck(ctx, stage("fabric_store"), planned.fabric, fabricForwarded, "Fabric rolls counted in and shade-sorted at store.");

    ctx = { ...ctx, entryDate: d.advance(stage("fabric_store").typical_duration_days), userId: userFor("pattern_marker") };
    await writeSimpleConfirm(ctx, stage("pattern_marker"), po.quantity, "5-panel hood + kangaroo pocket marker approved. Efficiency 81% (more complex nesting than a crew).");

    ctx = { ...ctx, entryDate: d.advance(stage("pattern_marker").typical_duration_days), userId: userFor("cutting") };
    const cutQty = await writeCutting(ctx, stage("cutting"), po.quantity, 5175, 5160, "40 pcs cutting wastage — more panels per garment than the crew style, slightly higher loss.");

    ctx = { ...ctx, entryDate: d.advance(stage("cutting").typical_duration_days), userId: userFor("printing_embroidery") };
    const embroideryReturned = await writeEmbroidery(
      ctx,
      stage("printing_embroidery"),
      po.quantity,
      cutQty,
      ctx.entryDate,
      "Classic Thread Embroidery, Tirupur",
      "Tirupur",
      "Left-chest logo on hood panel, grey-on-charcoal tonal thread.",
      5145,
      d.advance(stage("printing_embroidery").typical_duration_days),
      "15 pcs rejected — hood-panel embroidery placement slightly trickier than a flat crew panel.",
    );

    // Stitching: fed the full batch, but the four checkpoints are progressing
    // at different speeds — a normal sewing-line QC bottleneck. Moved forward
    // without completing so the balance can be finished once the line
    // catches up. Checking/Ironing/Packing/Finishing/Packing all stay
    // untouched — exactly the "remaining stages still pending" state.
    ctx = { ...ctx, entryDate: d.advance(stage("printing_embroidery").typical_duration_days), userId: userFor("stitching") };
    const stitchingItems = [
      { key: "line_feeding", label: "Line Feeding" },
      { key: "inline_qc", label: "Inline QC" },
      { key: "end_line_qc", label: "End Line QC" },
      { key: "measurement_check", label: "Measurement Check" },
    ];
    await writeSubSteps(
      ctx,
      stage("stitching"),
      stitchingItems,
      cutQty,
      { line_feeding: embroideryReturned, inline_qc: 4800, end_line_qc: 2600, measurement_check: 1800 },
      false,
      "Full batch fed to the line. Inline QC ahead of end-line, measurement checkpoint just started — will complete once the line catches up.",
    );
    console.log(`  ✓ Order B / PO ${po.po_number} — partial, stalled mid-Stitching (1,800 pcs cleared so far)`);
  }

  // --- Order B / PO 01700011 (3100 pcs) — barely started ---------------------
  {
    const po = orderB.pos.find((p) => p.po_number === "01700011")!;
    const ctx: Ctx = {
      admin,
      orderId: orderB.id,
      poId: po.id,
      entryDate: "2026-08-13",
      userId: userFor("order_confirmation"),
    };
    await writeConfirmation(
      ctx,
      stage("order_confirmation"),
      po.quantity,
      "Second PO of this style confirmed — material planning to follow once PO 01700010 clears fabric processing.",
    );
    console.log(`  ✓ Order B / PO ${po.po_number} — just started (Order Confirmation only)`);
  }

  console.log("\nDone. Demo users all share the password:", DEMO_PASSWORD);
  console.log("Sign in as any of:", SECTION_USERS.map((u) => u.username).join(", "));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
