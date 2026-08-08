export type UnitType = "KG" | "PCS";

/** How a stage entry's goods moved: kept in-house, or transferred to another
 * branch, another production unit, an outside party, or a custom-named
 * destination that doesn't fit those categories. */
export type TransferType = "none" | "branch" | "unit" | "outside" | "others";

export type StageFormType =
  | "confirmation"
  | "material_planning"
  | "supplier_dc"
  | "material_inward"
  | "knitting"
  | "lot_process"
  | "lot_inspection"
  | "fabric_store"
  | "simple_confirm"
  | "cutting"
  | "panel_check"
  | "embroidery"
  | "sewing"
  | "garment_qc"
  | "garment_process"
  | "packing";

export interface AppUser {
  id: string;
  name: string;
  username: string;
  password_plain: string;
  role: string;
  phone: string | null;
  is_monitor_only: boolean;
  is_active: boolean;
  last_activity_at: string | null;
  created_at: string;
}

/** Safe, narrow view of another user — never includes username/password/role. */
export interface UserContact {
  id: string;
  name: string;
  phone: string | null;
}

export interface WorkflowStage {
  id: string;
  key: string;
  label: string;
  sequence_no: number;
  unit_type: UnitType;
  typical_duration_days: number;
  form_type: StageFormType;
}

export interface Order {
  id: string;
  io_no: string;
  style: string;
  description: string | null;
  color: string | null;
  fabric: string | null;
  image_path: string | null;
  total_qty: number;
  /** Fixed PCS baseline set when Cutting completes; every later stage compares against this. */
  cut_quantity: number | null;
  delivery_date: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  order_id: string;
  po_number: string;
  quantity: number;
  /** Fixed PCS baseline for THIS PO, set when Cutting completes for a
   * PO-scoped assignment — mirrors orders.cut_quantity but per PO, so every
   * PO's downstream stages compare against its own fixed number. */
  cut_quantity: number | null;
  delivery_date: string | null;
  created_at: string;
}

export interface UserAssignment {
  id: string;
  user_id: string;
  order_id: string;
  po_id: string | null;
  section_id: string;
  unit_name: string | null;
  can_enter_data: boolean;
  created_at: string;
}

export interface StageEntry {
  id: string;
  order_id: string;
  po_id: string | null;
  section_id: string;
  entry_date: string;
  unit_type: UnitType;
  qty_received: number;
  qty_completed_today: number;
  qty_forwarded: number;
  qty_shortage: number;
  qty_rejected: number;
  qty_returned: number;
  is_external: boolean;
  external_unit_name: string | null;
  is_sent_outside: boolean;
  is_returned: boolean;
  /** The operator moved this stage on. Deliberately independent of quantity —
   * a stage can be forwarded with nothing counted yet (planning before the
   * material arrives) and the next stage still has to unlock. */
  is_forwarded: boolean;
  /** Forwarded AND finished. Implies is_forwarded. */
  is_completed: boolean;
  branch: string | null;
  unit_name: string | null;
  transfer_type: TransferType;
  transfer_to: string | null;
  notes: string | null;
  entered_by: string;
  forwarded_to_user_id: string | null;
  created_at: string;
}

/** Joined view used across assignment tables/forms. */
export interface AssignmentWithDetails extends UserAssignment {
  order?: Order;
  po?: PurchaseOrder | null;
  section?: WorkflowStage;
  user?: AppUser;
}

/** Global stage-role default: a user set as the default assignee for a stage
 * across every order (expanded into implicit per-order assignments by the app). */
export interface StageAssignment {
  id: string;
  user_id: string;
  section_id: string;
  can_enter_data: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Production chain (migration 011)
//
// These are the QUANTITY layer. stage_entries above remains the GATING layer —
// it says whether a stage is open, partial or complete; these say how much
// actually moved. Keeping them apart lets a figure be corrected without
// disturbing which stages are unlocked.
// ---------------------------------------------------------------------------

/** One size row of a purchase order — the base every downstream PCS figure
 * (cut, checked, embroidered, sewn, packed) is compared against. */
export interface PoSizeQuantity {
  id: string;
  po_id: string;
  size_code: string;
  sort_order: number;
  quantity: number;
  created_at: string;
}

/** A physical batch of fabric, created at Knitting or Dyeing and referenced by
 * every stage after it. po_id null = the lot serves the whole order. */
export interface ProductionLot {
  id: string;
  order_id: string;
  po_id: string | null;
  lot_no: string;
  fabric_type: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type MaterialCategory = "yarn" | "fabric";

/** One user-defined yarn count ("40s") or fabric type ("Single Jersey") with
 * its required quantity. Yarn counts are never hard-coded — the planner adds,
 * renames and removes them per order. */
export interface MaterialRequirement {
  id: string;
  order_id: string;
  po_id: string | null;
  category: MaterialCategory;
  name: string;
  required_qty: number;
  unit: UnitType;
  supplier: string | null;
  sort_order: number;
  is_completed: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

/** Which link of the procurement chain an entry represents. All four write
 * against the SAME requirement, which is how Planning → Suppliers → Inward
 * stay reconciled without any stage re-typing another's numbers. */
export type MaterialEntryType = "plan" | "dc" | "receipt" | "inward";

export interface MaterialEntry {
  id: string;
  requirement_id: string;
  entry_type: MaterialEntryType;
  qty: number;
  entry_date: string;
  supplier: string | null;
  doc_no: string | null;
  doc_date: string | null;
  lot_ref: string | null;
  notes: string | null;
  entered_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

/** 'process' for ordinary stages; 'send'/'receive' split Embroidery's dispatch
 * from its return so both directions accumulate separately. */
export type TxnType = "process" | "send" | "receive";

/**
 * One thing that happened at one stage. Every stage from Knitting to Packing
 * writes here and reads its predecessor's rows from here.
 *
 * A row may carry only qty_in (a sewing line feed), only qty_out (that line's
 * output later the same day), or both (a dyeing lot in and back). Each column
 * sums independently, which is what makes repeat entries accumulate instead of
 * overwriting one another.
 */
export interface ProductionTxn {
  id: string;
  order_id: string;
  po_id: string | null;
  section_id: string;
  lot_id: string | null;
  /** Null for KG stages; set from Cutting onwards. */
  size_code: string | null;
  txn_type: TxnType;
  unit: UnitType;
  qty_in: number;
  qty_out: number;
  qty_rejected: number;
  qty_rework: number;
  /** Knitting unit, embroidery vendor, or sewing line. */
  ref_name: string | null;
  doc_no: string | null;
  entry_date: string;
  notes: string | null;
  entered_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

/** Append-only history. Written by the app on every create/update so a
 * corrected figure keeps its trail rather than silently replacing the old one. */
export interface AuditLogRow {
  id: string;
  order_id: string | null;
  po_id: string | null;
  section_id: string | null;
  entity: string;
  entity_id: string | null;
  action: "create" | "update" | "delete";
  summary: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  notes: string | null;
  user_id: string;
  created_at: string;
}

/** A named material/sub-step row within a stage (Yarn/Fabric/Trims/Accessories
 * under Raw Material Planning, Line Feeding/Inline QC/... under Checking, etc). */
export interface StageSubItem {
  id: string;
  order_id: string;
  section_id: string;
  item_key: string;
  item_label: string;
  planned_qty: number;
  completed_qty: number;
  unit_type: UnitType;
  is_completed: boolean;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
}
