import { useStageChain } from "../../../hooks/useProductionChain";
import { buildRequirementFlow } from "../../../lib/chain";
import { Loader } from "../../ui/Loader";
import { Badge } from "../../ui/Badge";
import { MaterialLedger } from "./MaterialLedger";
import { StageActions } from "./shared";
import { useStageEntryBuilder } from "../../../hooks/useStageEntryBuilder";
import { QtyBox, Section } from "./chainShared";
import type { StageFormProps } from "./types";

/**
 * Raw Material Inward — the consolidated view of everything procurement did.
 *
 * The table below is the whole point of the shared material ledger: planned,
 * dispatched, received and taken into store, per material, side by side, none
 * of it re-typed here. The storekeeper's only job on this screen is the last
 * column — confirming what physically entered the store.
 */
export function MaterialInwardForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const { cs, requirements, materialEntries, isLoading, isError } = useStageChain(
    order.id,
    assignment.po_id,
    assignment.section_id,
  );
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);

  if (isLoading) return <Loader label="Loading inward position…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn't load inward data.</p>;

  const flows = requirements.map((r) => buildRequirementFlow(r, materialEntries));
  const totals = flows.reduce(
    (acc, f) => ({
      required: acc.required + f.totals.required,
      dc: acc.dc + f.totals.dc,
      received: acc.received + f.totals.received,
      inward: acc.inward + f.totals.inward,
    }),
    { required: 0, dc: 0, received: 0, inward: 0 },
  );
  const pending = Math.max(totals.required - totals.inward, 0);

  async function forward(isFinal: boolean) {
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    const moved = totals.inward > 0 ? totals.inward : totals.received;
    await submitMovement({
      base: {
        qty_received: totals.received,
        qty_completed_today: Math.max(moved - alreadyLogged, 0),
        qty_forwarded: Math.max(moved - alreadyLogged, 0),
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  /** Inward rows are written as they're entered above, so this records that the
   * store progressed without releasing anything to knitting. */
  async function savePlan() {
    await submitMovement({
      base: {
        qty_received: totals.received,
        qty_forwarded: 0,
        notes: "Plan saved — nothing forwarded.",
      },
      action: "plan",
    });
    onForwarded();
  }

  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-ink-500">
        The full material position for this order — planned through to what's on the shelf. Record
        store inward against each material; everything else is carried in from the earlier stages.
      </p>

      <Section title="Material position">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <QtyBox label="Planned" value={totals.required} unit="KG" />
          <QtyBox label="Dispatched" value={totals.dc} unit="KG" />
          <QtyBox label="Received" value={totals.received} unit="KG" />
          <QtyBox label="Store inward" value={totals.inward} unit="KG" tone="good" />
          <QtyBox label="Pending" value={pending} unit="KG" tone={pending > 0 ? "warn" : "good"} />
        </div>
      </Section>

      {flows.length > 0 && (
        <Section
          title="Planned → Purchased → Dispatched → Received → Balance"
          subtitle="Every material, end to end. Nothing on this table is typed twice."
        >
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2 text-left font-semibold">Material</th>
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Planned</th>
                  <th className="px-3 py-2 text-right font-semibold">DC</th>
                  <th className="px-3 py-2 text-right font-semibold">Received</th>
                  <th className="px-3 py-2 text-right font-semibold">Inward</th>
                  <th className="px-3 py-2 text-right font-semibold">Balance</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {flows.map((f) => {
                  const balance = Math.max(f.totals.required - f.totals.inward, 0);
                  return (
                    <tr key={f.requirement.id} className="bg-white">
                      <td className="px-3 py-2 font-semibold text-ink-900">{f.requirement.name}</td>
                      <td className="px-3 py-2 capitalize text-ink-500">{f.requirement.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.totals.required.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.totals.dc.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.totals.received.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-status-good">
                        {f.totals.inward.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${balance > 0 ? "text-amber-600" : "text-status-good"}`}>
                        {balance.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={balance === 0 ? "good" : f.totals.inward > 0 ? "warn" : "neutral"}>
                          {balance === 0 ? "Complete" : f.totals.inward > 0 ? "Partial" : "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-ink-50 text-xs font-bold text-ink-800">
                  <td className="px-3 py-2" colSpan={2}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.required.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.dc.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.received.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.inward.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pending.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
      )}

      {flows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">
          No materials planned for this order yet.
        </p>
      ) : (
        <MaterialLedger
          orderId={order.id}
          poId={assignment.po_id}
          sectionId={assignment.section_id}
          flows={flows}
          categories={["yarn", "fabric"]}
          canEditRequirements={false}
          entryTypes={["inward"]}
          onSaved={onForwarded}
        />
      )}

      <StageActions
        sectionLabel={assignment.section?.label ?? "Raw Material Inward"}
        unitType="KG"
        balance={pending}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}
