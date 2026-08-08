import { useStageChain } from "../../../hooks/useProductionChain";
import { buildRequirementFlow } from "../../../lib/chain";
import { Loader } from "../../ui/Loader";
import { MaterialLedger } from "./MaterialLedger";
import { StageActions, useStageEntryBuilder } from "./shared";
import { ChainStrip } from "./chainShared";
import type { StageFormProps } from "./types";

/**
 * Raw Material Planning — the first KG stage, and the origin of every fabric
 * number downstream.
 *
 * It owns the yarn counts and fabric types themselves (add / rename / remove),
 * their required kilos, and the actual receipts against them. Purchase Order to
 * Suppliers and Raw Material Inward then write further entries against these
 * same rows rather than starting their own lists — which is what keeps
 * "required 500, received 350, balance 150" true on all three screens at once.
 *
 * Trims and accessories are deliberately absent: they were removed from this
 * stage as not part of the fabric chain.
 */
export function MaterialPlanningForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const { cs, requirements, materialEntries, isLoading, isError } = useStageChain(
    order.id,
    assignment.po_id,
    assignment.section_id,
  );
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);

  if (isLoading) return <Loader label="Loading the material plan…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn't load the material plan.</p>;

  const flows = requirements.map((r) => buildRequirementFlow(r, materialEntries));

  async function forward(isFinal: boolean) {
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qty_received: cs!.input,
        qty_completed_today: Math.max(cs!.output - alreadyLogged, 0),
        qty_forwarded: Math.max(cs!.output - alreadyLogged, 0),
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  /** Requirements and receipts are written as they're entered above, so this
   * records that planning progressed without handing anything to procurement. */
  async function savePlan() {
    await submitMovement({
      base: { qty_received: cs!.input, qty_forwarded: 0, notes: "Plan saved — nothing forwarded." },
      action: "plan",
    });
    onForwarded();
  }

  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-ink-500">
        Plan what this order needs, then record what actually arrives. Three planners can work here
        at once — each marks their own lines complete as they finish.
      </p>

      <ChainStrip cs={cs} inputHint="total required" />

      <MaterialLedger
        orderId={order.id}
        poId={assignment.po_id}
        sectionId={assignment.section_id}
        flows={flows}
        categories={["yarn", "fabric"]}
        canEditRequirements
        entryTypes={["plan", "receipt"]}
        onSaved={onForwarded}
      />

      <StageActions
        sectionLabel={assignment.section?.label ?? "Raw Material Planning"}
        unitType="KG"
        balance={cs.balance}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
      {flows.length === 0 && (
        <p className="text-center text-[11px] text-amber-700">
          No yarn counts or fabric added yet — procurement will have nothing to buy against.
        </p>
      )}
    </div>
  );
}
