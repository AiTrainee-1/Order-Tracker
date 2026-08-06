import type { AssignmentWithDetails, Order } from "../../../lib/types";

/** Shared props every specialized stage form receives. */
export interface StageFormProps {
  order: Order;
  assignment: AssignmentWithDetails;
  onForwarded: () => void;
}
