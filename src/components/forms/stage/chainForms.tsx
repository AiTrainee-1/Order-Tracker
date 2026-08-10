import { useRef } from "react";
import { useToast } from "../../../context/ToastContext";
import { useStageChain } from "../../../hooks/useProductionChain";
import { STAGE, type ChainStage } from "../../../lib/chain";
import { Loader } from "../../ui/Loader";
import { Badge } from "../../ui/Badge";
import { StageActions } from "./shared";
import { useStageEntryBuilder } from "../../../hooks/useStageEntryBuilder";
import {
  ChainStrip,
  LotSummaryTable,
  Section,
  StageLedger,
  QtyBox,
  type LedgerConfig,
  type StageLedgerHandle,
} from "./chainShared";
import type { StageFormProps } from "./types";

/**
 * The quantity-recording stages.
 *
 * Knitting through Packing all do the same thing — take a quantity in, send a
 * quantity out, lose a little — so they're one component driven by a
 * LedgerConfig rather than fourteen near-identical files. What genuinely
 * differs between them (a lot vs a size, a vendor vs a sewing line, one
 * quantity column vs three) is exactly what the config expresses.
 */

// ---------------------------------------------------------------------------
// The wrapper every chain stage shares
// ---------------------------------------------------------------------------

function ChainStageForm({
  props,
  config,
  intro,
  extra,
}: {
  props: StageFormProps;
  config: LedgerConfig;
  intro?: string;
  /** Rendered above the ledger — used where a stage needs context its
   * neighbours don't, like Fabric Store's whole-journey roll-up. */
  extra?: (cs: ChainStage, chain: NonNullable<ReturnType<typeof useStageChain>["chain"]>) => React.ReactNode;
}) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const { chain, cs, lots, sizes, isLoading, isError } = useStageChain(
    order.id,
    assignment.po_id,
    assignment.section_id,
  );
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);
  const ledger = useRef<StageLedgerHandle>(null);
  const toast = useToast();

  if (isLoading) return <Loader label="Loading this stage…" />;
  if (isError || !cs || !chain) return <p className="text-sm text-status-bad">Couldn't load this stage's data.</p>;

  /**
   * Forwarding writes a stage_entry purely so the gating layer knows this stage
   * has moved. The quantities on it are a DELTA against what earlier entries
   * already logged, so progress.ts's running sum always equals the ledger's
   * output — the two layers stay in step instead of double-counting when a
   * stage is forwarded more than once.
   *
   * Pending rows are committed first. Forwarding a stage while a typed-but-
   * unsaved row sat above it would hand on a quantity the next stage can't see.
   */
  async function forward(isFinal: boolean) {
    if (!(await ledger.current?.save())) return;
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qty_received: cs!.input,
        qty_completed_today: Math.max(cs!.output - alreadyLogged, 0),
        qty_forwarded: Math.max(cs!.output - alreadyLogged, 0),
        qty_rejected: Math.max(cs!.rejected - (stageProgress?.qtyRejected ?? 0), 0),
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  /** Records what's been entered and stops. Nothing moves on, so the stage
   * shows as in progress rather than partial. */
  async function savePlan() {
    const hadPending = ledger.current?.hasPending() ?? false;
    if (!(await ledger.current?.save())) return;
    await submitMovement({
      base: { qty_received: cs!.input, qty_forwarded: 0, notes: "Plan saved — nothing forwarded." },
      action: "plan",
    });
    onForwarded();
    if (!hadPending) toast.show("Progress saved. Nothing moved on.", "success");
  }

  return (
    <div className="space-y-5">
      {intro && <p className="text-xs leading-relaxed text-ink-500">{intro}</p>}

      <StageLedger
        ref={ledger}
        orderId={order.id}
        poId={assignment.po_id}
        sectionId={assignment.section_id}
        unit={cs.unit}
        cs={cs}
        lots={lots}
        sizes={sizes}
        config={config}
        onSaved={onForwarded}
      >
        {extra?.(cs, chain)}
      </StageLedger>

      <StageActions
        sectionLabel={assignment.section?.label ?? "This stage"}
        unitType={cs.unit}
        balance={cs.balance}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fabric processing — KG, lot-wise
// ---------------------------------------------------------------------------

export function KnittingForm(props: StageFormProps) {
  return (
    <ChainStageForm
      props={props}
      intro="Fabric is knitted here and becomes a physical batch. Raise a lot for each batch — every stage after this one, right through to Packing, is traced by that lot number."
      config={{
        lot: "required",
        size: "none",
        inLabel: "Yarn Issued",
        outLabel: "Fabric Out",
        rejectedLabel: "Wastage",
        reworkLabel: false,
        ref: {
          label: "Knitting Unit",
          presets: ["JKR", "Texwell"],
          placeholder: "JKR / Texwell / new unit",
        },
        docLabel: false,
        txnType: "process",
      }}
    />
  );
}

/** Dyeing, Setting, Raising, Compacting and In-House are the same shape: a lot
 * goes in, a slightly lighter lot comes out. */
export function LotProcessForm(props: StageFormProps) {
  const key = props.assignment.section?.key;
  const intro =
    key === STAGE.dyeing
      ? "Each lot is dyed separately. Record what went into the bath and what came back, per lot — the difference is this stage's process loss."
      : key === STAGE.fabricInhouse
        ? "Fabric coming back into the factory. Record what was actually received against each lot so any shortfall in transit is visible."
        : "Record each lot's input and output. The difference is this stage's process loss and it carries through to the Output summary.";

  return (
    <ChainStageForm
      props={props}
      intro={intro}
      config={{
        lot: "required",
        size: "none",
        inLabel: "Input",
        outLabel: "Output",
        rejectedLabel: "Rejected",
        reworkLabel: false,
        ref: { label: "Unit / Party", presets: [], placeholder: "In-house or vendor" },
        docLabel: false,
        txnType: "process",
      }}
    />
  );
}

export function LotInspectionForm(props: StageFormProps) {
  return (
    <ChainStageForm
      props={props}
      intro="Four-point inspection, lot by lot. Accepted plus rejected should equal what was inspected — anything left over is unaccounted and shows as balance."
      config={{
        lot: "required",
        size: "none",
        inLabel: "Inspected",
        outLabel: "Accepted",
        rejectedLabel: "Rejected",
        reworkLabel: false,
        ref: false,
        docLabel: false,
        txnType: "process",
      }}
    />
  );
}

/**
 * Fabric Store is a reckoning, not a process: it states what actually reached
 * the store against everything the fabric passed through to get there. It still
 * takes an entry, because the store's own count is the one that matters for
 * Cutting.
 */
export function FabricStoreForm(props: StageFormProps) {
  return (
    <ChainStageForm
      props={props}
      intro="What finally reached the store. The journey below shows where every kilo went between the yarn plan and this shelf."
      config={{
        lot: "optional",
        size: "none",
        inLabel: "Received",
        outLabel: "Issued to Cutting",
        rejectedLabel: false,
        reworkLabel: false,
        ref: false,
        docLabel: false,
        txnType: "process",
      }}
      extra={(_cs, chain) => <FabricJourney chain={chain} />}
    />
  );
}

function FabricJourney({ chain }: { chain: NonNullable<ReturnType<typeof useStageChain>["chain"]> }) {
  const keys = [
    STAGE.knitting,
    STAGE.dyeing,
    STAGE.setting,
    STAGE.raising,
    STAGE.compacting,
    STAGE.fabricInhouse,
    STAGE.fabricInspection,
  ];
  const rows = keys.map((k) => chain.byKey.get(k)).filter((s): s is ChainStage => !!s);
  const planned = chain.materialTotals.all.required;
  const finalOut = rows[rows.length - 1]?.output ?? 0;
  const loss = Math.max(planned - finalOut, 0);

  return (
    <Section title="Fabric journey" subtitle="Every processing stage, from the yarn plan to this store.">
      <div className="grid grid-cols-3 gap-2">
        <QtyBox label="Planned" value={planned} unit="KG" />
        <QtyBox label="Reached store" value={finalOut} unit="KG" tone="good" />
        <QtyBox label="Total process loss" value={loss} unit="KG" tone={loss > 0 ? "bad" : "good"} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-ink-100">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
              <th className="px-3 py-2 text-left font-semibold">Stage</th>
              <th className="px-3 py-2 text-right font-semibold">Input</th>
              <th className="px-3 py-2 text-right font-semibold">Output</th>
              <th className="px-3 py-2 text-right font-semibold">Loss</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((s) => {
              const stageLoss = Math.max(s.input - s.output - s.rejected, 0);
              return (
                <tr key={s.stage.id} className="bg-white">
                  <td className="px-3 py-2 font-medium text-ink-900">{s.stage.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.input.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-status-good">{s.output.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${stageLoss > 0 ? "text-status-bad" : "text-ink-400"}`}>
                    {stageLoss.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Garment production — PCS, lot + size
// ---------------------------------------------------------------------------

/**
 * Cutting is where the unit changes. Everything before it is weighed in KG;
 * everything after is counted in pieces, size by size. Cutting is done lot by
 * lot rather than against the whole PO, so the size grid is entered per lot.
 */
export function CuttingForm(props: StageFormProps) {
  return (
    <ChainStageForm
      props={props}
      intro="Fabric becomes pieces here — KG stops, PCS begins. Cut one lot at a time and enter the pieces for each size; the balance against the PO's size breakdown updates as you go."
      config={{
        lot: "required",
        size: "required",
        inLabel: false,
        outLabel: "Cut",
        rejectedLabel: false,
        reworkLabel: false,
        ref: false,
        docLabel: false,
        txnType: "process",
        sizeGrid: true,
      }}
    />
  );
}

export function PanelCheckForm(props: StageFormProps) {
  return (
    <ChainStageForm
      props={props}
      intro="Cut panels are checked before they reach the line. Record what was checked, what passed, and what was rejected — per lot and size."
      config={{
        lot: "required",
        size: "required",
        inLabel: "Checked",
        outLabel: "Accepted",
        rejectedLabel: "Rejected",
        reworkLabel: "Rework",
        ref: false,
        docLabel: false,
        txnType: "process",
      }}
    />
  );
}

/** Embroidery goes out and comes back, so it gets two ledgers over one stage —
 * dispatch and return each accumulating separately, with the gap between them
 * being what's still with the vendor. */
export function EmbroideryForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const { cs, lots, sizes, isLoading, isError } = useStageChain(
    order.id,
    assignment.po_id,
    assignment.section_id,
  );
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);
  const sendLedger = useRef<StageLedgerHandle>(null);
  const returnLedger = useRef<StageLedgerHandle>(null);
  const toast = useToast();

  if (isLoading) return <Loader label="Loading this stage…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn't load this stage's data.</p>;

  const sent = cs.txns.filter((t) => t.txn_type === "send").reduce((s, t) => s + t.qty_out, 0);
  const received = cs.txns.filter((t) => t.txn_type === "receive").reduce((s, t) => s + t.qty_out, 0);
  const withVendor = Math.max(sent - received, 0);

  /** Both directions commit together — a dispatch and its return are often
   * entered in the same sitting. */
  async function saveBoth(): Promise<boolean> {
    if (!(await sendLedger.current?.save())) return false;
    return (await returnLedger.current?.save()) ?? true;
  }

  async function forward(isFinal: boolean) {
    if (!(await saveBoth())) return;
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qty_received: cs!.input,
        qty_completed_today: Math.max(received - alreadyLogged, 0),
        qty_forwarded: Math.max(received - alreadyLogged, 0),
        qty_rejected: Math.max(cs!.rejected - (stageProgress?.qtyRejected ?? 0), 0),
        is_sent_outside: true,
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  async function savePlan() {
    const hadPending =
      (sendLedger.current?.hasPending() ?? false) || (returnLedger.current?.hasPending() ?? false);
    if (!(await saveBoth())) return;
    await submitMovement({
      base: { qty_received: cs!.input, qty_forwarded: 0, notes: "Plan saved — nothing forwarded." },
      action: "plan",
    });
    onForwarded();
    if (!hadPending) toast.show("Progress saved. Nothing moved on.", "success");
  }

  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-ink-500">
        Panels go out to the embroidery unit and come back. Record both directions — what's still
        with the vendor is the difference.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <QtyBox label="Sent out" value={sent} unit="PCS" />
        <QtyBox label="Received back" value={received} unit="PCS" tone="good" />
        <QtyBox label="With vendor" value={withVendor} unit="PCS" tone={withVendor > 0 ? "warn" : "good"} />
      </div>

      {cs.byLot.length > 0 && (
        <Section title="Lot-wise position">
          <LotSummaryTable cs={cs} />
        </Section>
      )}

      <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="external">Dispatch</Badge>
          <span className="text-xs font-semibold text-ink-700">Sending to the embroidery unit</span>
        </div>
        <StageLedger
          ref={sendLedger}
          orderId={order.id}
          poId={assignment.po_id}
          sectionId={assignment.section_id}
          unit="PCS"
          cs={cs}
          lots={lots}
          sizes={sizes}
          onSaved={onForwarded}
          config={{
            lot: "required",
            size: "required",
            inLabel: false,
            outLabel: "Qty Sent",
            rejectedLabel: false,
            reworkLabel: false,
            ref: { label: "Embroidery Unit", presets: [], placeholder: "Vendor name" },
            docLabel: "DC No",
            txnType: "send",
            filterByTxnType: true,
          }}
        />
      </div>

      <div className="rounded-2xl border border-green-100 bg-green-50/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="good">Return</Badge>
          <span className="text-xs font-semibold text-ink-700">Received back in-house</span>
        </div>
        <StageLedger
          ref={returnLedger}
          orderId={order.id}
          poId={assignment.po_id}
          sectionId={assignment.section_id}
          unit="PCS"
          cs={cs}
          lots={lots}
          sizes={sizes}
          onSaved={onForwarded}
          config={{
            lot: "required",
            size: "required",
            inLabel: false,
            outLabel: "Qty Received",
            rejectedLabel: "Rejected",
            reworkLabel: false,
            ref: { label: "Embroidery Unit", presets: [], placeholder: "Vendor name" },
            docLabel: "DC No",
            txnType: "receive",
            filterByTxnType: true,
          }}
        />
      </div>

      <StageActions
        sectionLabel={assignment.section?.label ?? "Embroidery"}
        unitType="PCS"
        balance={withVendor}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}

export function SewingForm(props: StageFormProps) {
  return (
    <ChainStageForm
      props={props}
      intro="Line input and line output, lot by lot and size by size. Enter each feed and each output as its own record — the gap between them is work in progress on the line, not a loss."
      config={{
        lot: "required",
        size: "required",
        inLabel: "Line Input",
        outLabel: "Line Output",
        rejectedLabel: "Rejected",
        reworkLabel: "Rework",
        ref: { label: "Sewing Line", presets: ["Line 01", "Line 02", "Line 03"], placeholder: "e.g. Line 01" },
        docLabel: false,
        txnType: "process",
      }}
    />
  );
}

export function GarmentQcForm(props: StageFormProps) {
  return (
    <ChainStageForm
      props={props}
      intro="Inspection after sewing. Accepted moves on; rejected and rework stay behind and both show in the Output shortage analysis."
      config={{
        lot: "required",
        size: "required",
        inLabel: "Checked",
        outLabel: "Accepted",
        rejectedLabel: "Rejected",
        reworkLabel: "Rework",
        ref: false,
        docLabel: false,
        txnType: "process",
      }}
    />
  );
}

export function GarmentProcessForm(props: StageFormProps) {
  return (
    <ChainStageForm
      props={props}
      config={{
        lot: "required",
        size: "required",
        inLabel: "Input",
        outLabel: "Output",
        rejectedLabel: "Damaged",
        reworkLabel: false,
        ref: false,
        docLabel: false,
        txnType: "process",
      }}
    />
  );
}

export function PackingForm(props: StageFormProps) {
  return (
    <ChainStageForm
      props={props}
      intro="The last stage. What's packed here is the figure the Output dashboard compares against the original order."
      config={{
        lot: "required",
        size: "required",
        inLabel: "Input",
        outLabel: "Packed",
        rejectedLabel: "Damaged",
        reworkLabel: false,
        ref: false,
        docLabel: "Carton / Ref",
        txnType: "process",
      }}
      extra={(cs) => <PackedAgainstOrder cs={cs} />}
    />
  );
}

function PackedAgainstOrder({ cs }: { cs: ChainStage }) {
  const ordered = cs.bySize.reduce((total, s) => total + s.poQty, 0);
  const packed = cs.output;
  return (
    <Section title="Against the order">
      <div className="grid grid-cols-3 gap-2">
        <QtyBox label="Ordered" value={ordered} unit="PCS" />
        <QtyBox label="Packed" value={packed} unit="PCS" tone="good" />
        <QtyBox
          label="Short"
          value={Math.max(ordered - packed, 0)}
          unit="PCS"
          tone={ordered - packed > 0 ? "warn" : "good"}
        />
      </div>
    </Section>
  );
}

export { ChainStrip };
