import { useRef, useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { useStageChain } from "../../../hooks/useProductionChain";
import { STAGE, type ChainStage } from "../../../lib/chain";
import { stageQtyLabels } from "../../../lib/stageLabels";
import { Loader } from "../../ui/Loader";
import { Badge } from "../../ui/Badge";
import { StageActions } from "./shared";
import { useStageEntryBuilder } from "../../../hooks/useStageEntryBuilder";
import {
  ChainStrip,
  DirectionPanel,
  LotSummaryTable,
  Section,
  SizeSummaryTable,
  StageLedger,
  QtyBox,
  type LedgerConfig,
  type StageLedgerHandle,
} from "./chainShared";
import { Button } from "../../ui/Button";
import type { StageFormProps } from "./types";

/**
 * The quantity-recording stages.
 *
 * Knitting through Packing all do the same thing -  take a quantity in, send a
 * quantity out, lose a little -  so they're one component driven by a
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
  /** Rendered above the ledger -  used where a stage needs context its
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
   * output -  the two layers stay in step instead of double-counting when a
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
      base: { qty_received: cs!.input, qty_forwarded: 0, notes: "Plan saved -  nothing forwarded." },
      action: "plan",
    });
    onForwarded();
    if (!hadPending) toast.show("Progress saved. Nothing moved on.", "success");
  }

  return (
    <div className="space-y-5">
      {props.showDetails && intro && <p className="text-xs leading-relaxed text-ink-500">{intro}</p>}

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
        showDetails={props.showDetails}
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
// Fabric processing -  KG, lot-wise
// ---------------------------------------------------------------------------

/** Fabric In-House is the one stage of this shape left: a lot goes in, a
 * slightly lighter lot comes out (Knitting/Dyeing/Compacting moved to
 * LotSendReceiveForm below -  see migration 018). */
export function LotProcessForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Fabric coming back into the factory. Record what was actually received against each lot so any shortfall in transit is visible."
      config={{
        lot: "required",
        size: "none",
        inLabel: labels.in,
        outLabel: labels.out,
        rejectedLabel: labels.rejected,
        reworkLabel: labels.rework,
        ref: { label: "Unit / Party", presets: [], placeholder: "In-house or vendor" },
        docLabel: false,
        txnType: "process",
        // Compacting's received quantity for this lot is what should be
        // arriving back here -  carried forward rather than re-typed.
        lotAvailable: true,
      }}
    />
  );
}

/**
 * Knitting, Dyeing and Compacting are all the same shape: material physically
 * leaves this point to a processing unit (Sending), and comes back lighter
 * (Receiving) -  two events, not one, and both worth recording. This is the
 * same pattern EmbroideryForm already uses (two ledgers, txn_type 'send' and
 * 'receive'), generalized so the other three round-trip stages share it
 * instead of re-implementing it.
 *
 * Sending writes to qty_in (this is genuinely what the stage "received in and
 * sent onward" -  the chain's normal recordedIn), Receiving writes to qty_out
 * (what's actually available to the next stage). Keeping them on SEPARATE
 * columns is what lets the chain's ordinary carry-over and mismatch banner work
 * here: the next stage inherits Receiving's total, not Sending-plus-Receiving
 * combined. Embroidery once had both directions on qty_out and consequently
 * reported a round trip as two productions -  200 sent plus the same 200 back
 * read as 400. Every round-trip stage now follows this split.
 *
 * Only Knitting's Sending ledger may raise a brand new lot (migration 018
 * enforces this server-side too) -  Dyeing and Compacting always pick from the
 * existing register.
 */
export function LotSendReceiveForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const key = assignment.section?.key;
  const { cs, lots, sizes, isLoading, isError } = useStageChain(order.id, assignment.po_id, assignment.section_id);
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);
  const sendLedger = useRef<StageLedgerHandle>(null);
  const receiveLedger = useRef<StageLedgerHandle>(null);
  const toast = useToast();

  if (isLoading) return <Loader label="Loading this stage…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn't load this stage's data.</p>;

  const copy = SEND_RECEIVE_COPY[key ?? ""] ?? SEND_RECEIVE_COPY.default;
  const labels = stageQtyLabels(key);
  const sent = cs.txns.filter((t) => t.txn_type === "send").reduce((s, t) => s + t.qty_in, 0);
  const received = cs.txns.filter((t) => t.txn_type === "receive").reduce((s, t) => s + t.qty_out, 0);
  const withParty = Math.max(sent - received, 0);
  const rejected = cs.txns.filter((t) => t.txn_type === "receive").reduce((s, t) => s + t.qty_rejected, 0);

  async function saveBoth(): Promise<boolean> {
    if (!(await sendLedger.current?.save())) return false;
    return (await receiveLedger.current?.save()) ?? true;
  }

  async function forward(isFinal: boolean) {
    if (!(await saveBoth())) return;
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qty_received: cs!.input,
        qty_completed_today: Math.max(received - alreadyLogged, 0),
        qty_forwarded: Math.max(received - alreadyLogged, 0),
        qty_rejected: Math.max(rejected - (stageProgress?.qtyRejected ?? 0), 0),
        is_sent_outside: true,
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  async function savePlan() {
    const hadPending = (sendLedger.current?.hasPending() ?? false) || (receiveLedger.current?.hasPending() ?? false);
    if (!(await saveBoth())) return;
    await submitMovement({
      base: { qty_received: cs!.input, qty_forwarded: 0, notes: "Plan saved -  nothing forwarded." },
      action: "plan",
    });
    onForwarded();
    if (!hadPending) toast.show("Progress saved. Nothing moved on.", "success");
  }

  return (
    <div className="space-y-6">
      {props.showDetails && (
        <>
          <p className="text-xs leading-relaxed text-ink-500">{copy.intro}</p>

          <ChainStrip cs={cs} inputHint="sent so far" />

          <div className="grid grid-cols-3 gap-2">
            <QtyBox label="Sent" value={sent} unit={cs.unit} />
            <QtyBox label="Received back" value={received} unit={cs.unit} tone="good" />
            <QtyBox label={copy.withPartyLabel} value={withParty} unit={cs.unit} tone={withParty > 0 ? "warn" : "good"} />
          </div>

          {cs.byLot.length > 0 && (
            <Section title="Lot-wise position">
              <LotSummaryTable cs={cs} />
            </Section>
          )}
        </>
      )}

      <DirectionPanel direction="out" step={1} title="Sending Out" subtitle={copy.sendingHeading}>
        <StageLedger
          ref={sendLedger}
          orderId={order.id}
          poId={assignment.po_id}
          sectionId={assignment.section_id}
          unit={cs.unit}
          cs={cs}
          lots={lots}
          sizes={sizes}
          onSaved={onForwarded}
          showDetails={props.showDetails}
          config={{
            lot: "required",
            size: "none",
            inLabel: labels.in,
            outLabel: false,
            rejectedLabel: false,
            reworkLabel: false,
            ref: { label: "Sent To", presets: copy.presets, placeholder: "Unit / vendor name" },
            docLabel: "Doc / DC No",
            txnType: "send",
            filterByTxnType: true,
            allowCreateLot: copy.allowCreateLot,
            // Knitting originates a lot's quantity, so there is nothing
            // upstream to ration it against. From Dyeing onward the lot can
            // only send on what the previous section received for it.
            lotAvailable: !copy.allowCreateLot,
          }}
        />
      </DirectionPanel>

      <DirectionPanel direction="in" step={2} title="Receiving Back" subtitle={copy.receivingHeading}>
        <StageLedger
          ref={receiveLedger}
          orderId={order.id}
          poId={assignment.po_id}
          sectionId={assignment.section_id}
          unit={cs.unit}
          cs={cs}
          lots={lots}
          sizes={sizes}
          onSaved={onForwarded}
          showDetails={props.showDetails}
          config={{
            lot: "required",
            size: "none",
            inLabel: false,
            outLabel: labels.out,
            rejectedLabel: labels.rejected,
            reworkLabel: false,
            ref: { label: "Received From", presets: copy.presets, placeholder: "Unit / vendor name" },
            docLabel: "Doc / DC No",
            txnType: "receive",
            filterByTxnType: true,
            allowCreateLot: false,
          }}
        />
      </DirectionPanel>

      <StageActions
        sectionLabel={assignment.section?.label ?? "This stage"}
        unitType={cs.unit}
        balance={withParty}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}

interface SendReceiveCopy {
  intro: string;
  sendingHeading: string;
  receivingHeading: string;
  withPartyLabel: string;
  rejectedLabel: string;
  presets: string[];
  allowCreateLot: boolean;
}

const SEND_RECEIVE_COPY: Record<string, SendReceiveCopy> = {
  [STAGE.knitting]: {
    intro:
      "Yarn is sent out to be knitted and fabric comes back as a physical batch. Raise a lot when you send it -  every stage after this one, right through to Packing, is traced by that lot number.",
    sendingHeading: "Sending yarn to the knitting unit",
    receivingHeading: "Fabric received back",
    withPartyLabel: "With Knitter",
    rejectedLabel: "Wastage",
    presets: ["JKR", "Texwell"],
    allowCreateLot: true,
  },
  [STAGE.dyeing]: {
    intro: "Each lot is sent out to be dyed and comes back a slightly lighter lot -  the difference is this stage's process loss.",
    sendingHeading: "Sending to the dyeing unit",
    receivingHeading: "Dyed fabric received back",
    withPartyLabel: "With Dyer",
    rejectedLabel: "Rejected",
    presets: [],
    allowCreateLot: false,
  },
  [STAGE.brushing]: {
    intro:
      "Each dyed lot is sent out to be brushed -  the fleece is raised on the back of the fabric -  and comes back a slightly lighter lot. It sits between Dyeing and Compacting, so what it receives is what the dyer returned, and what it returns is what the compactor gets.",
    sendingHeading: "Sending to the brushing unit",
    receivingHeading: "Brushed fabric received back",
    withPartyLabel: "With Brusher",
    rejectedLabel: "Rejected",
    presets: [],
    allowCreateLot: false,
  },
  [STAGE.compacting]: {
    intro: "Each lot is sent out for compacting to its final GSM and width, and comes back a slightly lighter lot.",
    sendingHeading: "Sending to the compacting unit",
    receivingHeading: "Compacted fabric received back",
    withPartyLabel: "With Compactor",
    rejectedLabel: "Rejected",
    presets: [],
    allowCreateLot: false,
  },
  default: {
    intro: "Record what was sent out and what came back -  the difference is this stage's process loss.",
    sendingHeading: "Sending out",
    receivingHeading: "Received back",
    withPartyLabel: "Outstanding",
    rejectedLabel: "Rejected",
    presets: [],
    allowCreateLot: false,
  },
};

/** Passed + Rejected should equal what was sent for testing -  the passed
 * quantity (qty_out) is what carries forward to Fabric Store; rejected never
 * does, since it's excluded from output by construction. */
export function LotInspectionForm(props: StageFormProps) {
  const { order, assignment } = props;
  const labels = stageQtyLabels(assignment.section?.key);
  const { cs, isLoading, isError } = useStageChain(order.id, assignment.po_id, assignment.section_id);

  return (
    <ChainStageForm
      props={props}
      intro="Four-point inspection, lot by lot. Passed plus rejected should equal what was sent for testing -  anything left over is unaccounted and shows as balance. Only the passed quantity moves on to the store."
      config={{
        lot: "required",
        size: "none",
        inLabel: labels.in,
        outLabel: labels.out,
        rejectedLabel: labels.rejected,
        reworkLabel: labels.rework,
        ref: false,
        docLabel: false,
        txnType: "process",
        // Only what Fabric In-House received for this lot can be sent for
        // testing.
        lotAvailable: true,
      }}
      extra={() =>
        !isLoading && !isError && cs && cs.byLot.length > 0 ? <LotStatusStrip cs={cs} /> : null
      }
    />
  );
}

export function lotStatus(l: ChainStage["byLot"][number]): { label: string; tone: "good" | "bad" | "warn" | "neutral" } {
  if (l.qtyIn === 0) return { label: "Not Started", tone: "neutral" };
  if (l.qtyOut > 0 && l.qtyRejected === 0 && l.balance === 0) return { label: "Passed", tone: "good" };
  if (l.qtyOut === 0 && l.qtyRejected > 0) return { label: "Rejected", tone: "bad" };
  return { label: "Partial", tone: "warn" };
}

function LotStatusStrip({ cs }: { cs: ChainStage }) {
  return (
    <Section title="Lot status">
      <div className="flex flex-wrap gap-2">
        {cs.byLot.map((l) => {
          const status = lotStatus(l);
          return (
            <div
              key={l.lotId}
              className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2"
            >
              <span className="text-xs font-semibold text-ink-900">{l.lotNo}</span>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/**
 * Fabric Store is a simple record, not a re-count: it states the final
 * approved quantity for each passed lot (visible above, from Fabric
 * Inspection's own Lot-wise position table, via showDetails) and which unit
 * or location is holding it. One entry per lot -  no separate "issued to
 * Cutting" step, since Cutting reads this stage's output the same way every
 * other stage reads its predecessor's.
 */
export function FabricStoreForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Record the final approved quantity for each lot -  check the Lot-wise position above for what Fabric Inspection passed -  and which unit or location is holding it."
      config={{
        lot: "optional",
        size: "none",
        inLabel: false,
        outLabel: labels.out,
        rejectedLabel: false,
        reworkLabel: false,
        ref: { label: "Stored At", presets: [], placeholder: "Unit / location" },
        docLabel: false,
        txnType: "process",
        allowCreateLot: false,
        // What Fabric Inspection passed for this lot is the final approved
        // quantity -  shown on selecting the lot so it isn't looked up by hand,
        // and the ceiling for what can be recorded into store.
        lotAvailable: true,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Garment production -  PCS, lot + size
// ---------------------------------------------------------------------------

/**
 * Cutting is where the unit changes. Everything before it is weighed in KG;
 * everything after is counted in pieces, size by size. Cutting is done lot by
 * lot rather than against the whole PO, so the size grid is entered per lot.
 */
export function CuttingForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Fabric becomes pieces here -  KG stops, PCS begins. Cut one lot at a time and enter the pieces for each size. What you enter here becomes the fixed reference quantity every stage after this one measures against."
      config={{
        lot: "required",
        size: "required",
        inLabel: false,
        outLabel: labels.out,
        rejectedLabel: false,
        reworkLabel: false,
        ref: false,
        docLabel: false,
        txnType: "process",
        sizeGrid: true,
        // Cutting originates the size axis -  it measures against the PO, not
        // against an upstream cell.
        sizeGridOrigin: true,
      }}
    />
  );
}

export function PanelCheckForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Cut panels are checked before they reach the line. Pick the lot -  its sizes and quantities carry over from Cutting -  then record what was checked, accepted, rejected and sent for rework."
      config={{
        lot: "required",
        size: "required",
        inLabel: labels.in,
        outLabel: labels.out,
        rejectedLabel: labels.rejected,
        reworkLabel: labels.rework,
        ref: false,
        docLabel: false,
        txnType: "process",
        sizeGrid: true,
      }}
    />
  );
}

/** Embroidery goes out and comes back, so it gets two ledgers over one stage - 
 * dispatch and return each accumulating separately, with the gap between them
 * being what's still with the vendor. */
export function EmbroideryForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const labels = stageQtyLabels(assignment.section?.key);
  const { cs, lots, sizes, isLoading, isError } = useStageChain(
    order.id,
    assignment.po_id,
    assignment.section_id,
  );
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);
  const sendLedger = useRef<StageLedgerHandle>(null);
  const returnLedger = useRef<StageLedgerHandle>(null);
  const toast = useToast();
  const [showSizeDetail, setShowSizeDetail] = useState(false);

  if (isLoading) return <Loader label="Loading this stage…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn't load this stage's data.</p>;

  // Dispatch is recorded on qty_in, the return on qty_out -  see the send
  // ledger's config below for why they must not share a column.
  const sent = cs.txns.filter((t) => t.txn_type === "send").reduce((s, t) => s + t.qty_in, 0);
  const received = cs.txns.filter((t) => t.txn_type === "receive").reduce((s, t) => s + t.qty_out, 0);
  const withVendor = Math.max(sent - received, 0);

  /** Both directions commit together -  a dispatch and its return are often
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
      base: { qty_received: cs!.input, qty_forwarded: 0, notes: "Plan saved -  nothing forwarded." },
      action: "plan",
    });
    onForwarded();
    if (!hadPending) toast.show("Progress saved. Nothing moved on.", "success");
  }

  return (
    <div className="space-y-6">
      {props.showDetails && (
        <>
          <p className="text-xs leading-relaxed text-ink-500">
            Panels go out to the embroidery unit and come back. Record both directions -  what's still
            with the vendor is the difference.
          </p>

          <div className="grid grid-cols-3 gap-2">
            <QtyBox label="Sent out" value={sent} unit="PCS" />
            <QtyBox label="Received back" value={received} unit="PCS" tone="good" />
            <QtyBox label="With vendor" value={withVendor} unit="PCS" tone={withVendor > 0 ? "warn" : "good"} />
          </div>

          {/* Lot level first -  it's the figure people actually quote. The
              size-wise split is real detail but it multiplies the row count by
              the number of sizes, so it stays behind a click. */}
          {cs.byLot.length > 0 && (
            <Section title="Lot-wise position" subtitle="Completed / approved pieces per lot.">
              <LotSummaryTable cs={cs} />
              <div className="pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowSizeDetail((v) => !v)}
                >
                  {showSizeDetail ? "Hide size-wise details" : "View size-wise details"}
                </Button>
              </div>
              {showSizeDetail && (
                <div className="pt-2">
                  <SizeSummaryTable cs={cs} />
                </div>
              )}
            </Section>
          )}
        </>
      )}

      <DirectionPanel direction="out" step={1} title="Sending Out" subtitle="Panels going out to the embroidery unit">
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
          showDetails={props.showDetails}
          config={{
            lot: "required",
            size: "required",
            // Dispatch writes qty_IN, the return writes qty_OUT.
            //
            // Both used to write qty_out, which made the stage's output the sum
            // of the two: 200 sent plus the same 200 received read as 400. That
            // then became Sewing's available quantity and showed as 200% yield
            // on the Output report. Send and return are one round trip, not two
            // productions -  the pieces are only produced once, on the way back.
            inLabel: labels.in,
            outLabel: false,
            rejectedLabel: false,
            reworkLabel: false,
            ref: { label: "Sent To", presets: [], placeholder: "Vendor name" },
            docLabel: "DC No",
            txnType: "send",
            filterByTxnType: true,
            // Panel Checking's accepted quantity for this (lot, size) is what
            // can go to the vendor -  shown on selection, capped on save.
            lotSizeAvailable: true,
          }}
        />
      </DirectionPanel>

      <DirectionPanel direction="in" step={2} title="Receiving Back" subtitle="Embroidered panels coming back in-house">
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
          showDetails={props.showDetails}
          config={{
            lot: "required",
            size: "required",
            inLabel: false,
            outLabel: labels.out,
            rejectedLabel: labels.rejected,
            reworkLabel: false,
            ref: { label: "Received From", presets: [], placeholder: "Vendor name" },
            docLabel: "DC No",
            txnType: "receive",
            filterByTxnType: true,
          }}
        />
      </DirectionPanel>

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
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Line input and line output, lot by lot. Sizes and quantities carry over from Cutting. The gap between input and output is work in progress on the line, not a loss."
      config={{
        lot: "required",
        size: "required",
        inLabel: labels.in,
        outLabel: labels.out,
        rejectedLabel: labels.rejected,
        reworkLabel: labels.rework,
        ref: { label: "Sewing Line", presets: ["Line 01", "Line 02", "Line 03"], placeholder: "e.g. Line 01" },
        docLabel: false,
        txnType: "process",
        sizeGrid: true,
      }}
    />
  );
}

export function GarmentQcForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Inspection after sewing. Accepted moves on; rejected is a permanent loss and rework stays here until it's repaired."
      config={{
        lot: "required",
        size: "required",
        inLabel: labels.in,
        outLabel: labels.out,
        rejectedLabel: labels.rejected,
        reworkLabel: labels.rework,
        ref: false,
        docLabel: false,
        txnType: "process",
        sizeGrid: true,
      }}
    />
  );
}

export function GarmentProcessForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Pressing, lot by lot. Sizes and quantities carry over from the stage before."
      config={{
        lot: "required",
        size: "required",
        inLabel: labels.in,
        outLabel: labels.out,
        rejectedLabel: labels.rejected,
        reworkLabel: labels.rework,
        ref: false,
        docLabel: false,
        txnType: "process",
        sizeGrid: true,
      }}
    />
  );
}

export function PackingForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="The last stage. What's packed here is the figure the Output dashboard compares against the original order."
      config={{
        lot: "required",
        size: "required",
        inLabel: labels.in,
        outLabel: labels.out,
        rejectedLabel: labels.rejected,
        reworkLabel: labels.rework,
        ref: false,
        docLabel: "Carton / Ref",
        txnType: "process",
        sizeGrid: true,
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
