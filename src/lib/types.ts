export type UnitType = "KG" | "PCS";

export type StageFormType =
  | "confirmation"
  | "material_planning"
  | "simple_confirm"
  | "material_inward"
  | "fabric_processing"
  | "store_check"
  | "cutting"
  | "dispatch_return"
  | "sub_steps";

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
  is_completed: boolean;
  branch: string | null;
  unit_name: string | null;
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

/** A named material/sub-step row within a stage (Yarn/Fabric/Trims/Accessories
 * under Raw Material Planning, Line Feeding/Inline QC/... under Sewing, etc). */
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
