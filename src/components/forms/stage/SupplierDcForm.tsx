import { useStageChain } from "../../../hooks/useProductionChain";
import { buildRequirementFlow } from "../../../lib/chain";
import { Loader } from "../../ui/Loader";
import { MaterialLedger } from "./MaterialLedger";
import { StageActions } from "./shared";
import { useStageEntryBuilder } from "../../../hooks/useStageEntryBuilder";
import { QtyBox, Section } from "./chainShared";
import type { StageFormProps } from "./types";

/**
 * Purchase Order to Suppliers -  Planned Quantity: how much yarn is planned
 * against the requirement?
 *
 * One responsibility only: for each material Raw Material Planning listed,
 * how much is being planned/ordered against it. The required figure comes
 * straight from Planning -  nothing to re-enter -  so this screen is a single
 * comparison:
 *
 *     Required Quantity → Planned Quantity
 *
 * No dispatch, no receipt -  those don't belong here. Raw Material Inward
 * reads the planned quantity set here as its own input, the same way this
 * screen reads Planning's, and is solely responsible for the actual received
 * quantity once material arrives.
 */
export function SupplierDcForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const { cs, requirements, materialEntries, isLoading, isError } = useStageChain(
    order.id,
    assignment.po_id,
    assignment.section_id,
  );
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);

  if (isLoading) return <Loader label="Loading planned quantities…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn't load supplier data.</p>;

  const flows = requirements.map((r) => buildRequirementFlow(r, materialEntries));
  const totals = flows.reduce(
    (acc, f) => ({ required: acc.required + f.totals.required, planned: acc.planned + f.totals.dc }),
    { required: 0, planned: 0 },
  );
  const balance = Math.max(totals.required - totals.planned, 0);

  async function forward(isFinal: boolean) {
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qty_received: totals.required,
        qty_completed_today: Math.max(totals.planned - alreadyLogged, 0),
        qty_forwarded: Math.max(totals.planned - alreadyLogged, 0),
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  /** Planned-quantity rows are written as they're entered above, so this
   * records that procurement progressed without handing anything to the store. */
  async function savePlan() {
    await submitMovement({
      base: { qty_received: totals.required, qty_forwarded: 0, notes: "Plan saved -  nothing forwarded." },
      action: "plan",
    });
    onForwarded();
  }

  return (
    <div className="space-y-6">
      {props.showDetails && (
        <>
          <p className="text-xs leading-relaxed text-ink-500">
            Planned Quantity -  for each material, enter how much yarn is being planned against the
            required quantity Raw Material Planning set. That's the only figure this screen owns.
          </p>

          <Section title="Planned Quantity">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <QtyBox label="Required" value={totals.required} unit="KG" />
              <QtyBox label="Planned" value={totals.planned} unit="KG" tone="good" />
              <QtyBox label="Balance" value={balance} unit="KG" tone={balance > 0 ? "warn" : "good"} />
            </div>
          </Section>
        </>
      )}

      {flows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">
          Nothing to plan yet -  Raw Material Planning hasn't added any yarn counts or fabric.
        </p>
      ) : (
        <MaterialLedger
          orderId={order.id}
          poId={assignment.po_id}
          sectionId={assignment.section_id}
          flows={flows}
          categories={["yarn", "fabric"]}
          canEditRequirements={false}
          entryTypes={["dc"]}
          onSaved={onForwarded}
        />
      )}

      <StageActions
        sectionLabel={assignment.section?.label ?? "Purchase Order to Suppliers"}
        unitType="KG"
        balance={balance}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}
