import type { AssignmentWithDetails, Order } from "../../../lib/types";
import type { StageProgress } from "../../../lib/progress";

/** Shared props every specialized stage form receives. */
export interface StageFormProps {
  order: Order;
  assignment: AssignmentWithDetails;
  /** Live progress for this stage -  carries the quantity inherited from the
   * previous stage plus what's already been forwarded, so a form always knows
   * the real inbound number even when nothing was typed into it yet. */
  stageProgress?: StageProgress;
  onForwarded: () => void;
  /** Whether reference/summary content (order info, quantity banners, chain
   * strips, position tables) should render. False keeps only the page's
   * actual entry controls on screen -  the "View Details" toggle in
   * DataInputPage owns this; the Preview sandbox always passes true, since
   * it exists to show the whole form off. */
  showDetails: boolean;
}
