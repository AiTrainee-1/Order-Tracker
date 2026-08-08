import { useStageChain } from "../../../hooks/useProductionChain";
import { buildRequirementFlow } from "../../../lib/chain";
import { Loader } from "../../ui/Loader";
import { MaterialLedger } from "./MaterialLedger";
import { StageActions, useStageEntryBuilder } from "./shared";
import { QtyBox, Section } from "./chainShared";
import type { StageFormProps } from "./types";

/**
 * Purchase Order to Suppliers — the two halves of procurement on one screen.
 *
 *   Dispatch   what the supplier sent, under which DC, on what date
 *   Received   what actually turned up against those dispatches
 *
 * Both write against the requirements Raw Material Planning created, so the
 * planned figure here is never re-typed and can never drift. The gap between
 * dispatched and received is material in transit or short-supplied — worth
 * seeing on its own, which is why it's a column rather than a subtraction the
 * buyer has to do in their head.
 */
export function SupplierDcForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const { cs, requirements, materialEntries, isLoading, isError } = useStageChain(
    order.id,
    assignment.po_id,
    assignment.section_id,
  );
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);

  if (isLoading) return <Loader label="Loading supplier dispatches…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn't load supplier data.</p>;

  const flows = requirements.map((r) => buildRequirementFlow(r, materialEntries));
  const totals = flows.reduce(
    (acc, f) => ({
      required: acc.required + f.totals.required,
      dc: acc.dc + f.totals.dc,
      received: acc.received + f.totals.received,
    }),
    { required: 0, dc: 0, received: 0 },
  );
  const inTransit = Math.max(totals.dc - totals.received, 0);

  async function forward(isFinal: boolean) {
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qty_received: totals.dc,
        qty_completed_today: Math.max(totals.received - alreadyLogged, 0),
        qty_forwarded: Math.max(totals.received - alreadyLogged, 0),
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  /** DC and receipt rows are written as they're entered above, so this records
   * that procurement progressed without handing anything to the store. */
  async function savePlan() {
    await submitMovement({
      base: { qty_received: totals.dc, qty_forwarded: 0, notes: "Plan saved — nothing forwarded." },
      action: "plan",
    });
    onForwarded();
  }

  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-ink-500">
        Record each supplier dispatch against its DC, then confirm what was received. The planned
        figures come straight from Raw Material Planning — nothing to re-enter.
      </p>

      <Section title="Procurement position">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <QtyBox label="Planned" value={totals.required} unit="KG" />
          <QtyBox label="Dispatched" value={totals.dc} unit="KG" />
          <QtyBox label="Received" value={totals.received} unit="KG" tone="good" />
          <QtyBox
            label="In transit"
            value={inTransit}
            unit="KG"
            tone={inTransit > 0 ? "warn" : "good"}
            hint="sent, not yet confirmed"
          />
        </div>
      </Section>

      {flows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">
          Nothing to purchase yet — Raw Material Planning hasn't added any yarn counts or fabric.
        </p>
      ) : (
        <MaterialLedger
          orderId={order.id}
          poId={assignment.po_id}
          sectionId={assignment.section_id}
          flows={flows}
          categories={["yarn", "fabric"]}
          canEditRequirements={false}
          entryTypes={["dc", "receipt"]}
          onSaved={onForwarded}
        />
      )}

      <StageActions
        sectionLabel={assignment.section?.label ?? "Purchase Order to Suppliers"}
        unitType="KG"
        balance={Math.max(totals.required - totals.received, 0)}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}
