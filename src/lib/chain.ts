import type {
  MaterialEntry,
  MaterialEntryType,
  MaterialRequirement,
  ProductionLot,
  ProductionTxn,
  UnitType,
  WorkflowStage,
} from "./types";

/**
 * The production chain.
 *
 * One calculation, run once per (order, PO), that turns the raw ledgers into
 * every number the app shows: what each stage received, what it sent on, what
 * it lost, and what it still owes -  broken down by lot and by size.
 *
 * The rule the whole system rests on is:
 *
 *     a stage's input = the previous comparable stage's output
 *
 * unless that stage physically counted something different in, in which case
 * what was counted wins and the difference is surfaced rather than hidden. That
 * is the only place "connect stage A to stage B" is implemented -  every form,
 * header and dashboard reads the result instead of re-deriving it, which is
 * what stops two screens disagreeing about the same quantity.
 *
 * Two things deliberately do NOT live here:
 *   - whether a stage is open/partial/complete -  that is stage_entries and
 *     src/lib/progress.ts, the gating layer.
 *   - who did what and when -  that is the audit log.
 */

// ---------------------------------------------------------------------------
// Stage keys. Referenced by name in several places, so they're constants rather
// than string literals scattered across forms.
// ---------------------------------------------------------------------------

export const STAGE = {
  orderConfirmation: "order_confirmation",
  rawMaterialPlanning: "raw_material_planning",
  poToSuppliers: "po_to_suppliers",
  rawMaterialInward: "raw_material_inward",
  knitting: "knitting",
  dyeing: "dyeing",
  compacting: "compacting",
  fabricInhouse: "fabric_inhouse",
  fabricInspection: "fabric_inspection",
  fabricStore: "fabric_store",
  patternMarker: "pattern_marker",
  cutting: "cutting",
  panelChecking: "panel_checking",
  embroidery: "embroidery",
  sewing: "sewing",
  checking: "checking",
  ironing: "ironing",
  packing: "packing",
} as const;

/** Stages whose numbers come from the material ledger rather than
 * production_txns -  procurement happens before anything is a physical batch. */
const MATERIAL_STAGES: string[] = [
  STAGE.rawMaterialPlanning,
  STAGE.poToSuppliers,
  STAGE.rawMaterialInward,
];

// ---------------------------------------------------------------------------
// Material totals
// ---------------------------------------------------------------------------

export interface MaterialTotals {
  /** Required Plan -  what Raw Material Planning says the order needs. */
  required: number;
  /** Unused by the current three-stage flow; kept only so old "plan" rows
   * (written before Planning was simplified to a single required_qty field)
   * still total correctly instead of vanishing. */
  planned: number;
  /** Purchase Quantity -  what Purchase Order to Suppliers raised against the
   * requirement. (Field name kept as `dc` for schema/type stability; the
   * stage no longer distinguishes a separate "received by buyer" step.) */
  dc: number;
  /** Unused by the current three-stage flow, for the same reason as `planned`. */
  received: number;
  /** Inward Confirmation -  what Raw Material Inward actually took into store
   * against the purchase quantity. */
  inward: number;
}

const ZERO_TOTALS: MaterialTotals = { required: 0, planned: 0, dc: 0, received: 0, inward: 0 };

const ENTRY_FIELD: Record<MaterialEntryType, keyof Omit<MaterialTotals, "required">> = {
  plan: "planned",
  dc: "dc",
  receipt: "received",
  inward: "inward",
};

export interface RequirementFlow {
  requirement: MaterialRequirement;
  entries: MaterialEntry[];
  totals: MaterialTotals;
  /** What Purchase Order to Suppliers raised against the requirement. */
  plannedQty: number;
  /**
   * What was actually RECEIVED into store.
   *
   * "Inward" and "Received" are the same physical event in the current flow,
   * recorded as entry_type 'inward'; 'receipt' is a legacy type from the older
   * four-step procurement chain that nothing writes any more. Both are folded
   * in here so a screen asking "how much came in?" gets the true figure rather
   * than reading one bucket and finding it empty -  which is exactly what made
   * the dashboard show Received as blank while Inward had data.
   */
  receivedQty: number;
  /** Planned − received. Positive = still owed by the supplier. */
  balance: number;
  /** Required − planned. Positive = still to be purchased. */
  toPurchase: number;
}

export function buildRequirementFlow(
  requirement: MaterialRequirement,
  allEntries: MaterialEntry[],
): RequirementFlow {
  const entries = allEntries
    .filter((e) => e.requirement_id === requirement.id)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));

  const totals: MaterialTotals = { ...ZERO_TOTALS, required: requirement.required_qty };
  for (const e of entries) totals[ENTRY_FIELD[e.entry_type]] += Number(e.qty) || 0;

  const plannedQty = totals.dc;
  const receivedQty = totals.inward + totals.received;

  return {
    requirement,
    entries,
    totals,
    plannedQty,
    receivedQty,
    balance: Math.max(plannedQty - receivedQty, 0),
    toPurchase: Math.max(totals.required - plannedQty, 0),
  };
}

function sumMaterialTotals(flows: RequirementFlow[]): MaterialTotals {
  return flows.reduce<MaterialTotals>(
    (acc, f) => ({
      required: acc.required + f.totals.required,
      planned: acc.planned + f.totals.planned,
      dc: acc.dc + f.totals.dc,
      received: acc.received + f.totals.received,
      inward: acc.inward + f.totals.inward,
    }),
    { ...ZERO_TOTALS },
  );
}

// ---------------------------------------------------------------------------
// Per-stage flow
// ---------------------------------------------------------------------------

export interface LotFlow {
  lotId: string;
  lotNo: string;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  qtyRework: number;
  /** in − out − rejected, floored at 0. */
  balance: number;
  /**
   * What the previous comparable stage passed on for THIS lot -  its qty_out.
   *
   * This is the KG-side equivalent of LotSizeCell.available, and it is what
   * makes the lot's quantity travel with its number: Knitting receives 19,500
   * back against lot-1, so Dyeing has 19,500 of lot-1 to send out, without
   * anyone re-typing it. 0 across the Cutting boundary, where kilograms stop
   * converting into pieces.
   */
  available: number;
  /**
   * How much of what this stage was handed it has not accounted for yet.
   *
   * "Accounted for" is qty_in where the stage records an intake (Dyeing sends
   * it out, In-House takes it in, Inspection sends it for testing), and
   * qty_out where it doesn't -  Fabric Store has no intake step, so the final
   * approved quantity it records IS its account of the lot.
   *
   * A lot can move in several batches, so this shrinks with each one rather
   * than showing the whole lot every time.
   */
  remainingAvailable: number;
  lastEntryDate: string | null;
  entryCount: number;
}

export interface SizeFlow {
  sizeCode: string;
  /** The PO's ordered quantity for this size -  the yardstick every PCS stage
   * is measured against. */
  poQty: number;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  balance: number;
}

export type CellStatus = "not_started" | "in_progress" | "complete";

/**
 * One (lot, size) cell at one stage -  the grain the garment floor actually
 * works in from Cutting onwards.
 *
 * This exists because byLot and bySize are each a projection that loses the
 * other axis, and the question every stage after Cutting has to answer is
 * about both at once: "for THIS lot in THIS size, how many did Cutting make,
 * how many did the stage before me hand over, and how many are left?"
 */
export interface LotSizeCell {
  lotId: string;
  lotNo: string;
  sizeCode: string;
  /** What Cutting produced for this cell -  the fixed reference every later
   * stage measures against, and the number that stops each one inventing its
   * own size quantity. */
  cutQty: number;
  /** What the previous PCS stage sent on for this cell; the cutQty at Cutting
   * itself. This is the ceiling a new entry is validated against. */
  available: number;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  qtyRework: number;
  /**
   * available − out − rejected. Rework is deliberately NOT subtracted: it is
   * work still owed at this stage, not a loss, and it becomes output once the
   * pieces are repaired. Subtracting it here would write it off; adding it to
   * output would count the same pieces twice when they are.
   */
  balance: number;
  status: CellStatus;
}

function cellKey(lotId: string, sizeCode: string): string {
  return `${lotId}::${sizeCode}`;
}

export interface ChainStage {
  stage: WorkflowStage;
  unit: UnitType;
  /** What the previous comparable stage sent on. 0 across a unit switch. */
  inherited: number;
  /** What was explicitly counted in here (sum of qty_in). */
  recordedIn: number;
  /** The figure this stage actually works against: counted if recorded,
   * otherwise inherited, otherwise the stage's own baseline. */
  input: number;
  /** Sum of qty_out -  what moved on to the next stage. */
  output: number;
  rejected: number;
  rework: number;
  /** input − output − rejected, floored at 0. Work still owed while the stage
   * is open; process loss once it closes. */
  balance: number;
  /** True when this stage counted in something different from what the previous
   * stage sent -  a discrepancy to reconcile, never silently overwritten. */
  hasMismatch: boolean;
  /** Whether anything at all has been recorded here. */
  isStarted: boolean;
  txns: ProductionTxn[];
  byLot: LotFlow[];
  bySize: SizeFlow[];
  /** Per (lot, size), for PCS stages. Empty for the KG stages, which have no
   * size axis until Cutting creates one. */
  byLotSize: LotSizeCell[];
  /** Populated for the three procurement stages only. */
  material: MaterialTotals | null;
  lastEntryDate: string | null;
}

export interface ChainInput {
  stages: WorkflowStage[];
  txns: ProductionTxn[];
  lots: ProductionLot[];
  requirements: MaterialRequirement[];
  materialEntries: MaterialEntry[];
  /** Ordered PCS baseline -  the PO's total, or the order's when unscoped. */
  totalPcs: number;
  /** Ordered quantity per size, in display order. */
  sizes: { size_code: string; quantity: number }[];
}

export interface ProductionChain {
  stages: ChainStage[];
  byKey: Map<string, ChainStage>;
  requirementFlows: RequirementFlow[];
  materialTotals: { yarn: MaterialTotals; fabric: MaterialTotals; all: MaterialTotals };
  totalPcs: number;
  sizes: { size_code: string; quantity: number }[];
  lots: ProductionLot[];
}

function emptyStage(stage: WorkflowStage): Omit<ChainStage, "inherited" | "input" | "hasMismatch"> {
  return {
    stage,
    unit: stage.unit_type,
    recordedIn: 0,
    output: 0,
    rejected: 0,
    rework: 0,
    balance: 0,
    isStarted: false,
    txns: [],
    byLot: [],
    bySize: [],
    byLotSize: [],
    material: null,
    lastEntryDate: null,
  };
}

/**
 * Rolls the ledgers up into one flow per stage.
 *
 * Order of resolution for a stage's input, highest priority first:
 *   1. what was physically counted in here (sum of qty_in)
 *   2. what the previous comparable stage sent on
 *   3. the stage's own baseline -  PO pieces for PCS stages, the material plan
 *      for the first KG stage, nothing for the rest
 *
 * Step 2 is why leaving one stage's form blank doesn't blank out the stages
 * after it. Step 3 only ever applies where a real external figure exists, so a
 * KG stage mid-chain can't invent a quantity out of nowhere.
 */
export function buildProductionChain(input: ChainInput): ProductionChain {
  const { stages, txns, lots, requirements, materialEntries, totalPcs, sizes } = input;

  const sorted = [...stages].sort((a, b) => a.sequence_no - b.sequence_no);
  const lotsById = new Map(lots.map((l) => [l.id, l]));

  const requirementFlows = requirements
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((r) => buildRequirementFlow(r, materialEntries));

  const yarnFlows = requirementFlows.filter((f) => f.requirement.category === "yarn");
  const fabricFlows = requirementFlows.filter((f) => f.requirement.category === "fabric");
  const materialTotals = {
    yarn: sumMaterialTotals(yarnFlows),
    fabric: sumMaterialTotals(fabricFlows),
    all: sumMaterialTotals(requirementFlows),
  };

  const result: ChainStage[] = [];

  // What Cutting produced per (lot, size). Captured when the loop reaches
  // Cutting -  which precedes every stage that reads it in sequence_no order -
  // and used from then on as the fixed reference, so no later stage has to
  // invent a size quantity or fall back to the PO's ordered figure.
  const cutByCell = new Map<string, number>();
  // The previous PCS stage's output per cell, i.e. what is actually available
  // to the stage currently being built. Replaced at the end of each PCS stage.
  let prevCellOutput = new Map<string, number>();
  // The same idea one axis coarser: the previous stage's output per LOT, which
  // is what the KG half of the line (Knitting → Fabric In-House) travels on,
  // since it has no size axis until Cutting creates one.
  let prevLotOutput = new Map<string, number>();

  sorted.forEach((stage, index) => {
    const base = emptyStage(stage);
    const stageTxns = txns
      .filter((t) => t.section_id === stage.id)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));

    base.txns = stageTxns;
    base.recordedIn = sum(stageTxns, (t) => t.qty_in);
    base.output = sum(stageTxns, (t) => t.qty_out);
    base.rejected = sum(stageTxns, (t) => t.qty_rejected);
    base.rework = sum(stageTxns, (t) => t.qty_rework);
    base.lastEntryDate = stageTxns.length ? stageTxns[stageTxns.length - 1].entry_date : null;
    base.isStarted = stageTxns.length > 0;

    // --- Carry-over from the previous comparable stage ---------------------
    const prev = result[index - 1];
    const prevStage = sorted[index - 1];
    const sameUnit = prevStage ? prevStage.unit_type === stage.unit_type : false;
    let inherited = prev && sameUnit ? prev.output : 0;

    // --- Procurement stages read the material ledger instead ---------------
    if (MATERIAL_STAGES.includes(stage.key)) {
      const totals = materialTotals.all;
      base.material = totals;
      base.isStarted =
        base.isStarted || requirementFlows.length > 0 || totals.planned + totals.dc + totals.received + totals.inward > 0;

      if (stage.key === STAGE.rawMaterialPlanning) {
        // Required Plan -  a pass-through of what's needed, so Suppliers sees
        // it as their input the moment it's set, before any purchase happens.
        inherited = 0;
        base.recordedIn = totals.required;
        base.output = totals.required;
      } else if (stage.key === STAGE.poToSuppliers) {
        // Purchase Quantity -  what's been raised against the requirement.
        base.recordedIn = totals.dc;
        base.output = totals.dc;
      } else {
        // Received into store -  what physically arrived against the purchase
        // quantity, and what Knitting therefore has to draw from. Legacy
        // 'receipt' rows fold in alongside 'inward' for the same reason
        // RequirementFlow.receivedQty does: they are the same event.
        const receivedIn = totals.inward + totals.received;
        base.recordedIn = receivedIn;
        base.output = receivedIn;
      }
      base.lastEntryDate = latestDate(materialEntries.map((e) => e.entry_date), base.lastEntryDate);
    }

    // --- Order Confirmation is the origin: it passes the order through -----
    if (stage.key === STAGE.orderConfirmation) {
      inherited = totalPcs;
      base.recordedIn = base.recordedIn > 0 ? base.recordedIn : totalPcs;
      base.output = base.output > 0 ? base.output : totalPcs;
    }

    // --- Pattern & Marker plans, it doesn't consume: pass the fabric through -
    if (stage.key === STAGE.patternMarker && base.output === 0) {
      base.output = inherited;
    }

    // --- Baseline of last resort -------------------------------------------
    // PCS stages fall back to the ordered pieces; KG stages fall back to the
    // material plan only at Knitting, where the chain physically begins.
    let baseline = 0;
    if (stage.unit_type === "PCS") baseline = totalPcs;
    else if (stage.key === STAGE.knitting) {
      baseline = materialTotals.all.inward || materialTotals.all.received || materialTotals.all.required;
    }

    const resolvedInput = base.recordedIn > 0 ? base.recordedIn : inherited > 0 ? inherited : baseline;
    const hasMismatch = base.recordedIn > 0 && inherited > 0 && base.recordedIn !== inherited;

    base.balance = Math.max(resolvedInput - base.output - base.rejected, 0);

    // --- Lot-wise -----------------------------------------------------------
    const lotGroups = new Map<string, ProductionTxn[]>();
    for (const t of stageTxns) {
      if (!t.lot_id) continue;
      lotGroups.set(t.lot_id, [...(lotGroups.get(t.lot_id) ?? []), t]);
    }

    // Lots this stage should know about: the ones it has recorded against,
    // plus every lot the previous comparable stage passed on. Without the
    // second set, a stage that hasn't started yet would list no lots at all
    // and the operator would have nothing to select or measure against.
    const knownLots = new Set<string>([
      ...lotGroups.keys(),
      ...(sameUnit ? Array.from(prevLotOutput.keys()) : []),
    ]);
    const nextLotOutput = new Map<string, number>();

    base.byLot = Array.from(knownLots)
      .map((lotId) => {
        const group = lotGroups.get(lotId) ?? [];
        const qtyIn = sum(group, (t) => t.qty_in);
        const qtyOut = sum(group, (t) => t.qty_out);
        const qtyRejected = sum(group, (t) => t.qty_rejected);
        const available = sameUnit ? (prevLotOutput.get(lotId) ?? 0) : 0;

        nextLotOutput.set(lotId, qtyOut);

        return {
          lotId,
          lotNo: lotsById.get(lotId)?.lot_no ?? "- ",
          qtyIn,
          qtyOut,
          qtyRejected,
          qtyRework: sum(group, (t) => t.qty_rework),
          balance: Math.max(qtyIn - qtyOut - qtyRejected, 0),
          available,
          // A stage that records an intake is measured by it; one that doesn't
          // (Fabric Store) is measured by what it put out.
          remainingAvailable: Math.max(available - (qtyIn > 0 ? qtyIn : qtyOut), 0),
          lastEntryDate: group.length ? group[group.length - 1].entry_date : null,
          entryCount: group.length,
        };
      })
      .sort((a, b) => a.lotNo.localeCompare(b.lotNo));

    // Knitting is where a lot's quantity originates -  there is no upstream lot
    // figure to inherit, so its own received quantity seeds the chain.
    prevLotOutput = nextLotOutput;

    // --- Lot × size ---------------------------------------------------------
    //
    // The grain the garment floor works in. Built for every PCS stage; the KG
    // stages have no size axis until Cutting creates one.
    if (stage.unit_type === "PCS") {
      const isCutting = stage.key === STAGE.cutting;

      // Every cell this stage should show: the ones it has recorded against,
      // plus every cell Cutting created (so a stage that hasn't started yet
      // still lists the sizes it is expected to handle, rather than nothing).
      const cellTxns = new Map<string, ProductionTxn[]>();
      for (const t of stageTxns) {
        if (!t.lot_id || !t.size_code) continue;
        const key = cellKey(t.lot_id, t.size_code);
        cellTxns.set(key, [...(cellTxns.get(key) ?? []), t]);
      }

      const knownCells = new Set<string>([...cellTxns.keys(), ...(isCutting ? [] : cutByCell.keys())]);
      const nextCellOutput = new Map<string, number>();

      base.byLotSize = Array.from(knownCells)
        .map((key) => {
          const [lotId, sizeCode] = key.split("::");
          const group = cellTxns.get(key) ?? [];
          const qtyIn = sum(group, (t) => t.qty_in);
          const qtyOut = sum(group, (t) => t.qty_out);
          const qtyRejected = sum(group, (t) => t.qty_rejected);
          const qtyRework = sum(group, (t) => t.qty_rework);

          // Cutting is the origin of the size axis, so it has no upstream cell
          // to measure against -  its own output IS the reference.
          const cutQty = isCutting ? qtyOut : (cutByCell.get(key) ?? 0);
          const available = isCutting ? cutQty : (prevCellOutput.get(key) ?? cutQty);

          nextCellOutput.set(key, qtyOut);

          const balance = Math.max(available - qtyOut - qtyRejected, 0);
          const status: CellStatus =
            qtyOut === 0 && qtyRejected === 0 && qtyIn === 0
              ? "not_started"
              : balance === 0
                ? "complete"
                : "in_progress";

          return {
            lotId,
            lotNo: lotsById.get(lotId)?.lot_no ?? "- ",
            sizeCode,
            cutQty,
            available,
            qtyIn,
            qtyOut,
            qtyRejected,
            qtyRework,
            balance,
            status,
          };
        })
        .sort((a, b) => a.lotNo.localeCompare(b.lotNo) || a.sizeCode.localeCompare(b.sizeCode));

      if (isCutting) {
        for (const cell of base.byLotSize) cutByCell.set(cellKey(cell.lotId, cell.sizeCode), cell.qtyOut);
      }
      prevCellOutput = nextCellOutput;
    }

    // --- Size-wise ----------------------------------------------------------
    if (stage.unit_type === "PCS") {
      // Cutting's output per size -  the reference the size roll-up measures
      // against from Cutting onwards, so it agrees with byLotSize instead of
      // silently falling back to the PO's ordered quantity.
      const cutBySize = new Map<string, number>();
      for (const [key, qty] of cutByCell) {
        const sizeCode = key.split("::")[1];
        cutBySize.set(sizeCode, (cutBySize.get(sizeCode) ?? 0) + qty);
      }

      base.bySize = sizes.map((s) => {
        const group = stageTxns.filter((t) => t.size_code === s.size_code);
        const qtyIn = sum(group, (t) => t.qty_in);
        const qtyOut = sum(group, (t) => t.qty_out);
        const qtyRejected = sum(group, (t) => t.qty_rejected);
        // What this size is measured against: what was counted in, else what
        // Cutting produced for it, else the ordered quantity (Cutting itself,
        // before anything has been cut).
        const sizeInput = qtyIn > 0 ? qtyIn : (cutBySize.get(s.size_code) || s.quantity);
        return {
          sizeCode: s.size_code,
          poQty: s.quantity,
          qtyIn,
          qtyOut,
          qtyRejected,
          balance: Math.max(sizeInput - qtyOut - qtyRejected, 0),
        };
      });
    }

    result.push({ ...base, inherited, input: resolvedInput, hasMismatch });
  });

  return {
    stages: result,
    byKey: new Map(result.map((s) => [s.stage.key, s])),
    requirementFlows,
    materialTotals,
    totalPcs,
    sizes,
    lots,
  };
}

// ---------------------------------------------------------------------------
// Lot traceability -  one lot's journey across every stage that touched it.
// ---------------------------------------------------------------------------

export interface LotJourneyStep {
  stage: WorkflowStage;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  loss: number;
  unit: UnitType;
}

export interface LotJourney {
  lot: ProductionLot;
  steps: LotJourneyStep[];
  totalLoss: number;
}

/** Follows a single lot from Knitting to Packing. This is what the lot number
 * exists for -  without it a shortage can be seen but not located. */
export function buildLotJourney(lot: ProductionLot, chain: ProductionChain): LotJourney {
  const steps: LotJourneyStep[] = [];
  let totalLoss = 0;

  for (const cs of chain.stages) {
    const flow = cs.byLot.find((l) => l.lotId === lot.id);
    if (!flow) continue;
    const loss = Math.max(flow.qtyIn - flow.qtyOut - flow.qtyRejected, 0);
    // Only count loss where the lot was genuinely measured both ways, so a
    // stage that recorded output alone doesn't read as a total write-off.
    if (flow.qtyIn > 0 && flow.qtyOut > 0) totalLoss += loss;
    steps.push({
      stage: cs.stage,
      qtyIn: flow.qtyIn,
      qtyOut: flow.qtyOut,
      qtyRejected: flow.qtyRejected,
      loss,
      unit: cs.unit,
    });
  }

  return { lot, steps, totalLoss };
}

// ---------------------------------------------------------------------------
// Output summary -  the final planned-vs-actual comparison.
// ---------------------------------------------------------------------------

export interface OutputRow {
  key: string;
  label: string;
  unit: UnitType;
  input: number;
  output: number;
  rejected: number;
  shortage: number;
  /** output / input as a percentage; null when there's nothing to compare. */
  efficiencyPct: number | null;
}

export interface OutputSummary {
  rows: OutputRow[];
  orderedPcs: number;
  packedPcs: number;
  cutPcs: number;
  totalRejectedPcs: number;
  /** Packed as a percentage of ordered -  the headline number. */
  overallEfficiencyPct: number | null;
  /** Ordered − packed. */
  shortfallPcs: number;
  fabricPlannedKg: number;
  fabricInhouseKg: number;
  fabricLossKg: number;
}

/** Stages worth showing in the loss analysis -  planning and pass-through stages
 * would only add rows where input always equals output. */
const OUTPUT_STAGE_KEYS: string[] = [
  STAGE.rawMaterialPlanning,
  STAGE.knitting,
  STAGE.dyeing,
  STAGE.compacting,
  STAGE.fabricInhouse,
  STAGE.fabricInspection,
  STAGE.cutting,
  STAGE.panelChecking,
  STAGE.embroidery,
  STAGE.sewing,
  STAGE.checking,
  STAGE.ironing,
  STAGE.packing,
];

export function buildOutputSummary(chain: ProductionChain): OutputSummary {
  const rows: OutputRow[] = [];

  for (const key of OUTPUT_STAGE_KEYS) {
    const cs = chain.byKey.get(key);
    if (!cs) continue;
    const shortage = Math.max(cs.input - cs.output - cs.rejected, 0);
    rows.push({
      key,
      label: cs.stage.label,
      unit: cs.unit,
      input: cs.input,
      output: cs.output,
      rejected: cs.rejected,
      shortage,
      efficiencyPct: cs.input > 0 ? round1((cs.output / cs.input) * 100) : null,
    });
  }

  const packedPcs = chain.byKey.get(STAGE.packing)?.output ?? 0;
  const cutPcs = chain.byKey.get(STAGE.cutting)?.output ?? 0;
  const orderedPcs = chain.totalPcs;

  const totalRejectedPcs = chain.stages
    .filter((s) => s.unit === "PCS")
    .reduce((sum, s) => sum + s.rejected, 0);

  const fabricPlannedKg = chain.materialTotals.all.required;
  const fabricInhouseKg = chain.byKey.get(STAGE.fabricStore)?.input ?? 0;

  return {
    rows,
    orderedPcs,
    packedPcs,
    cutPcs,
    totalRejectedPcs,
    overallEfficiencyPct: orderedPcs > 0 ? round1((packedPcs / orderedPcs) * 100) : null,
    shortfallPcs: Math.max(orderedPcs - packedPcs, 0),
    fabricPlannedKg,
    fabricInhouseKg,
    fabricLossKg: Math.max(fabricPlannedKg - fabricInhouseKg, 0),
  };
}

/** Size-wise ordered → cut → packed comparison for the Output dashboard. */
export interface SizeOutputRow {
  sizeCode: string;
  ordered: number;
  cut: number;
  sewn: number;
  packed: number;
  balance: number;
}

export function buildSizeOutput(chain: ProductionChain): SizeOutputRow[] {
  const cut = chain.byKey.get(STAGE.cutting);
  const sewn = chain.byKey.get(STAGE.sewing);
  const packed = chain.byKey.get(STAGE.packing);

  return chain.sizes.map((s) => {
    const cutQty = cut?.bySize.find((x) => x.sizeCode === s.size_code)?.qtyOut ?? 0;
    const sewnQty = sewn?.bySize.find((x) => x.sizeCode === s.size_code)?.qtyOut ?? 0;
    const packedQty = packed?.bySize.find((x) => x.sizeCode === s.size_code)?.qtyOut ?? 0;
    return {
      sizeCode: s.size_code,
      ordered: s.quantity,
      cut: cutQty,
      sewn: sewnQty,
      packed: packedQty,
      balance: s.quantity - packedQty,
    };
  });
}

// ---------------------------------------------------------------------------

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
}

function latestDate(dates: string[], current: string | null): string | null {
  return dates.reduce<string | null>((latest, d) => (!latest || d > latest ? d : latest), current);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
