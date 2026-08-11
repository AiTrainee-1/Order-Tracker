import { useConfirm } from "../../../context/ConfirmContext";
import { Button } from "../../ui/Button";
import type { UnitType } from "../../../lib/types";

/**
 * The three buttons that close every stage form.
 *
 * This module exports components only. The hook that writes the gating row
 * moved to hooks/useStageEntryBuilder.ts -  React Fast Refresh cannot hot-swap a
 * module that mixes components with other exports, and every edit here was
 * forcing a full page reload during development.
 */

// ---------------------------------------------------------------------------
// Confirmations -  both actions change what other people can do, so both ask.
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
              {balance.qty.toLocaleString()} {balance.unit} balance remains -  it will be recorded as
              a shortage.
            </p>
          ) : null}
        </>
      ),
      confirmLabel: "Yes, forward & complete",
      cancelLabel: "Go back",
    });
}

/** Moving on WITHOUT finishing -  the orange handoff. Goods that have arrived go
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
// Completing is never a prerequisite for the next stage -  "Not Complete – Move
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
          // Inline so the amber wins outright -  `bg-*` and `text-*` utilities
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
        <b>Not Complete</b> sends what's ready and leaves this stage open -  shown in orange, with the
        balance still owed. The next stage unlocks either way.
      </p>
    </div>
  );
}
