export type UnitType = "KG" | "PCS";

export interface AppUser {
  id: string;
  name: string;
  username: string;
  password_plain: string;
  role: string;
  is_monitor_only: boolean;
  is_active: boolean;
  last_activity_at: string | null;
  created_at: string;
}

export interface WorkflowStage {
  id: string;
  key: string;
  label: string;
  sequence_no: number;
  unit_type: UnitType;
  typical_duration_days: number;
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
