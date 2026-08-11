import { useMemo } from "react";
import { DemoModeProvider, useDemoStore } from "../../../context/DemoModeContext";
import { buildOrderProgress } from "../../../lib/progress";
import { DEMO_ORDER, DEMO_PO } from "../../../lib/demoData";
import { Button } from "../../ui/Button";
import { StageFormRouter } from "./StageFormRouter";
import type { AssignmentWithDetails, WorkflowStage } from "../../../lib/types";

/**
 * The Preview sandbox -  the real stage form, wired to memory instead of the
 * database.
 *
 * This renders the SAME component the floor uses. Not a screenshot, not a
 * simplified copy: <StageFormRouter/> picks exactly the form it would pick for
 * this stage on a real order. Every field, every table, every button behaves as
 * it does in production, and the numbers move as entries are added.
 *
 * What makes it safe is DemoModeProvider. Inside it, every hook that reads or
 * writes production data finds a demo store and uses that instead of Supabase - 
 * the guards live in the mutations themselves (useProductionChain.ts,
 * useStageEntries.ts), so nothing here has to remember to be careful.
 */
export function StagePreviewSandbox({
  stage,
  allStages,
}: {
  stage: WorkflowStage;
  allStages: WorkflowStage[];
}) {
  return (
    <DemoModeProvider stages={allStages}>
      <SandboxBody stage={stage} allStages={allStages} />
    </DemoModeProvider>
  );
}

function SandboxBody({ stage, allStages }: { stage: WorkflowStage; allStages: WorkflowStage[] }) {
  const demo = useDemoStore()!;

  /** A stand-in assignment so the form believes it's scoped to a real PO. */
  const assignment = useMemo<AssignmentWithDetails>(
    () => ({
      id: "demo-assignment",
      user_id: "demo-user",
      order_id: DEMO_ORDER.id,
      po_id: DEMO_PO.id,
      section_id: stage.id,
      unit_name: null,
      can_enter_data: true,
      created_at: new Date().toISOString(),
      order: DEMO_ORDER,
      po: DEMO_PO,
      section: stage,
    }),
    [stage],
  );

  /** Gating progress for the sandbox, built from its own in-memory entries so
   * pressing Move Forward visibly changes the stage's state. */
  const stageProgress = useMemo(() => {
    const progress = buildOrderProgress(DEMO_ORDER, allStages, demo.stageEntries, {
      totalQty: DEMO_PO.quantity,
      cutQuantity: DEMO_PO.cut_quantity,
    });
    return progress.stages.find((s) => s.stage.id === stage.id);
  }, [allStages, demo.stageEntries, stage.id]);

  const movedOn = stageProgress?.isPartial || stageProgress?.isCompleted;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-blue-900">Practice mode -  nothing here is saved</p>
          <p className="text-[11px] leading-relaxed text-blue-800">
            This is the real {stage.label} form running on a sample order. Type in it, add entries,
            press the buttons -  none of it touches your orders or reaches the database.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={demo.reset}>
          Reset practice data
        </Button>
      </div>

      {movedOn && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900">
          You just moved this practice stage on
          {stageProgress?.isCompleted ? " and marked it complete" : " without completing it"}. On a
          real order the next stage would now unlock. Press <b>Reset practice data</b> to try again.
        </p>
      )}

      {/* The genuine article. Same component, same props shape, same behaviour.
          Always shown in full -  the Preview exists to demonstrate the form,
          so there's nothing to collapse behind a "View Details" toggle here. */}
      <StageFormRouter
        order={DEMO_ORDER}
        assignment={assignment}
        stageProgress={stageProgress}
        onForwarded={() => {
          /* The demo store re-renders on its own; there's nothing to refetch. */
        }}
        showDetails
      />
    </div>
  );
}
