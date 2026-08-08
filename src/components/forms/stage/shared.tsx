import { useAuth } from "../../../context/AuthContext";
import { useConfirm } from "../../../context/ConfirmContext";
import { useCreateStageEntry, type CreateStageEntryInput } from "../../../hooks/useStageEntries";
import { Button } from "../../ui/Button";
import type { AssignmentWithDetails, Order, UnitType } from "../../../lib/types";

/**
 * The gating layer's shared pieces.
 *
 * Everything here writes to stage_entries, which answers only "has this stage
 * moved, and is it finished". The quantities that matter live in
 * production_txns and are handled by chainShared.tsx — a stage_entry's numbers
 * are a summary written alongside, kept as a delta so the two layers' running
 * totals never diverge.
 */

// ---------------------------------------------------------------------------
// Confirmations — both actions change what other people can do, so both ask.
// ---------------------------------------------------------------------------

/** Completing a stage unlocks the ones after it and can't be undone. */
function useForwardConfirm() {
  const confirm = useConfirm();
  return (sectionLabel: string, balance?: { qty: number; unit: string }) =>
    confirm({
      title: "Forward & Complete?",
      message: (
        <>
          <p>
            This marks <b>{sectionLabel}</b> complete and forwards it to the next stage. The
            following stage(s) will unlock, and this can't be undone.
          </p>
          {balance && balance.qty > 0 ? (
            <p className="mt-2 font-medium text-status-bad">
              {balance.qty.toLocaleString()} {balance.unit} balance remains — it will be recorded as
              a shortage.
            </p>
          ) : null}
        </>
      ),
      confirmLabel: "Yes, forward & complete",
      cancelLabel: "Go back",
    });
}

/** Moving on WITHOUT finishing — the orange handoff. Goods that have arrived go
 * forward so the next stage isn't blocked, but this stage stays open so the
 * balance can be entered later when the rest turns up. */
function usePartialConfirm() {
  const confirm = useConfirm();
  return (sectionLabel: string, balance?: { qty: number; unit: string }) =>
    confirm({
      title: "Move forward without completing?",
      message: (
        <>
          <p>
            This forwards what's ready so the next stage can start, but leaves{" "}
            <b>{sectionLabel}</b> open. It stays flagged in the workflow until you come back and
            complete it.
          </p>
          {balance && balance.qty > 0 ? (
            <p className="mt-2 font-medium text-status-warn">
              {balance.qty.toLocaleString()} {balance.unit} will remain outstanding here.
            </p>
          ) : null}
        </>
      ),
      confirmLabel: "Yes, move forward",
      cancelLabel: "Go back",
    });
}

// ---------------------------------------------------------------------------
// Stage actions
//
// The same three buttons close every stage's form, in the same order, with the
// same meanings:
//
//   Save Plan ..................... record what's been entered. Move nothing.
//   Not Complete – Move Forward ... send it on; this stage stays OPEN (orange)
//   Completed – Move Forward ...... send it on and close this stage (green)
//
// Completing is never a prerequisite for the next stage — "Not Complete – Move
// Forward" unlocks it just the same. That's the point: a stage waiting on a
// balance must never hold up the line. All three stay enabled at all times, so
// the choice is always the operator's rather than the form's.
// ---------------------------------------------------------------------------

export function StageActions({
  sectionLabel,
  unitType,
  balance,
  isLoading,
  onSavePlan,
  onMoveForward,
  onComplete,
  savePlanLabel = "Save Plan",
  moveForwardLabel = "Not Complete – Move Forward",
  completeLabel = "Completed – Move Forward",
  disabled = false,
}: {
  sectionLabel: string;
  unitType: UnitType;
  balance: number;
  isLoading: boolean;
  onSavePlan: () => void | Promise<void>;
  onMoveForward: () => void | Promise<void>;
  onComplete: () => void | Promise<void>;
  savePlanLabel?: string;
  moveForwardLabel?: string;
  completeLabel?: string;
  disabled?: boolean;
}) {
  const confirmPartial = usePartialConfirm();
  const confirmComplete = useForwardConfirm();

  async function handleMoveForward() {
    if (!(await confirmPartial(sectionLabel, { qty: balance, unit: unitType }))) return;
    await onMoveForward();
  }

  async function handleComplete() {
    if (!(await confirmComplete(sectionLabel, { qty: balance, unit: unitType }))) return;
    await onComplete();
  }

  return (
    <div className="space-y-2 border-t border-ink-100 pt-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onSavePlan}
          isLoading={isLoading}
          disabled={disabled}
        >
          {savePlanLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleMoveForward}
          isLoading={isLoading}
          disabled={disabled}
          // Inline so the amber wins outright — `bg-*` and `text-*` utilities
          // passed through className race the variant's own rules on stylesheet
          // order and lose, leaving the orange only half-applied.
          style={{
            backgroundImage: "linear-gradient(120deg, #FEF3C7 0%, #FDE68A 100%)",
            color: "#78350F",
          }}
          className="border-amber-300/80 hover:brightness-[0.97]"
        >
          {moveForwardLabel}
        </Button>
      </div>
      <Button
        type="button"
        onClick={handleComplete}
        isLoading={isLoading}
        disabled={disabled}
        className="w-full"
        size="lg"
      >
        {completeLabel} →
      </Button>
      <p className="text-center text-[11px] text-ink-500">
        <b>Save Plan</b> keeps your entries here without moving anything on.{" "}
        <b>Not Complete</b> sends what's ready and leaves this stage open — shown in orange, with the
        balance still owed. The next stage unlocks either way.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry builder
// ---------------------------------------------------------------------------

/**
 * Which of the three buttons was pressed.
 *
 * A single discriminator rather than two booleans, because the two booleans
 * could be combined into states that don't exist — and one of those bugs
 * shipped: "Save Plan" and "Not Complete – Move Forward" both wrote
 * `is_completed: false` with no quantity, became indistinguishable, and the
 * next stage never unlocked. Three actions, three row shapes, no fourth
 * possibility.
 */
export type StageAction = "plan" | "forward" | "complete";

export function useStageEntryBuilder(order: Order, assignment: AssignmentWithDetails) {
  const { appUser } = useAuth();
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
