import { useEntryUser } from "./useEntryUser";
import { useCreateStageEntry, type CreateStageEntryInput } from "./useStageEntries";
import type { AssignmentWithDetails, Order } from "../lib/types";

/**
 * Writes the gating row that says a stage moved.
 *
 * stage_entries answers only "has this stage moved, and is it finished". The
 * quantities that matter live in production_txns; the numbers written here are
 * a summary alongside them, kept as a delta so the two layers' running totals
 * never diverge.
 *
 * Lives in hooks/ rather than beside StageActions so that module exports only
 * components — a file mixing components with hooks can't be hot-swapped by
 * React Fast Refresh, and every edit to it forces a full reload during dev.
 */

/**
 * Which of the three buttons was pressed.
 *
 * A single discriminator rather than two booleans, because two booleans can be
 * combined into states that don't exist — and one of those bugs shipped: "Save
 * Plan" and "Not Complete – Move Forward" both wrote `is_completed: false` with
 * no quantity, became indistinguishable, and the next stage never unlocked.
 * Three actions, three row shapes, no fourth possibility.
 */
export type StageAction = "plan" | "forward" | "complete";

export function useStageEntryBuilder(order: Order, assignment: AssignmentWithDetails) {
  const appUser = useEntryUser();
  const createEntry = useCreateStageEntry();

  function buildEntry(
    overrides: Partial<CreateStageEntryInput>,
    action: StageAction,
  ): CreateStageEntryInput {
    return {
      order_id: order.id,
      po_id: assignment.po_id,
      section_id: assignment.section_id,
      entry_date: new Date().toISOString().slice(0, 10),
      unit_type: assignment.section?.unit_type ?? "PCS",
      qty_received: 0,
      qty_completed_today: 0,
      qty_forwarded: 0,
      qty_shortage: 0,
      qty_rejected: 0,
      qty_returned: 0,
      is_external: false,
      external_unit_name: null,
      is_sent_outside: false,
      is_returned: false,
      is_forwarded: action !== "plan",
      is_completed: action === "complete",
      branch: null,
      unit_name: assignment.unit_name,
      transfer_type: "none",
      transfer_to: null,
      notes: null,
      entered_by: appUser?.id ?? "",
      forwarded_to_user_id: null,
      ...overrides,
    };
  }

  /**
   * Records that this stage moved. One row per forward action — the per-unit
   * and per-vendor split that used to live here is now `ref_name` on the
   * individual production_txns rows, where it belongs alongside the quantity it
   * describes.
   */
  async function submitMovement({
    base,
    action,
  }: {
    base: Partial<CreateStageEntryInput>;
    action: StageAction;
  }) {
    await createEntry.mutateAsync(buildEntry(base, action));
  }

  return { buildEntry, submitMovement, isPending: createEntry.isPending, appUser };
}
