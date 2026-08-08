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
 * it lost, and what it still owes — broken down by lot and by size.
 *
 * The rule the whole system rests on is:
 *
 *     a stage's input = the previous comparable stage's output
 *
 * unless that stage physically counted something different in, in which case
 * what was counted wins and the difference is surfaced rather than hidden. That
 * is the only place "connect stage A to stage B" is implemented — every form,
 * header and dashboard reads the result instead of re-deriving it, which is
 * what stops two screens disagreeing about the same quantity.
 *
 * Two things deliberately do NOT live here:
 *   - whether a stage is open/partial/complete — that is stage_entries and
 *     src/lib/progress.ts, the gating layer.
 *   - who did what and when — that is the audit log.
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
  setting: "setting",
  raising: "raising",
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
 * production_txns — procurement happens before anything is a physical batch. */
const MATERIAL_STAGES: string[] = [
  STAGE.rawMaterialPlanning,
  STAGE.poToSuppliers,
  STAGE.rawMaterialInward,
];

// ---------------------------------------------------------------------------
// Material totals
// ---------------------------------------------------------------------------

export interface MaterialTotals {
  /** Planned requirement — what the order actually needs. */
  required: number;
  /** Production plan raised against that requirement (may exceed it). */
  planned: number;
  /** Dispatched by suppliers under a DC. */
  dc: number;
  /** Confirmed received against those dispatches. */
  received: number;
  /** Physically taken into store. */
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
  /** required − received. Positive = still owed. */
  balance: number;
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

  return { requirement, entries, totals, balance: totals.required - totals.received };
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
  lastEntryDate: string | null;
  entryCount: number;
}

export interface SizeFlow {
  sizeCode: string;
  /** The PO's ordered quantity for this size — the yardstick every PCS stage
   * is measured against. */
  poQty: number;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  balance: number;
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
  /** Sum of qty_out — what moved on to the next stage. */
  output: number;
  rejected: number;
  rework: number;
  /** input − output − rejected, floored at 0. Work still owed while the stage
   * is open; process loss once it closes. */
  balance: number;
  /** True when this stage counted in something different from what the previous
   * stage sent — a discrepancy to reconcile, never silently overwritten. */
  hasMismatch: boolean;
  /** Whether anything at all has been recorded here. */
  isStarted: boolean;
  txns: ProductionTxn[];
  byLot: LotFlow[];
  bySize: SizeFlow[];
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
  /** Ordered PCS baseline — the PO's total, or the order's when unscoped. */
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
 *   3. the stage's own baseline — PO pieces for PCS stages, the material plan
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
        inherited = 0;
        base.recordedIn = totals.required;
        base.output = totals.received;
      } else if (stage.key === STAGE.poToSuppliers) {
        // Planning says what's needed; this stage dispatches and confirms it.
        base.recordedIn = totals.dc;
        base.output = totals.received;
      } else {
        // Raw Material Inward — what the store actually took in.
        base.recordedIn = totals.received;
        base.output = totals.inward > 0 ? totals.inward : totals.received;
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
    base.byLot = Array.from(lotGroups.entries())
      .map(([lotId, group]) => {
        const qtyIn = sum(group, (t) => t.qty_in);
        const qtyOut = sum(group, (t) => t.qty_out);
        const qtyRejected = sum(group, (t) => t.qty_rejected);
        return {
          lotId,
          lotNo: lotsById.get(lotId)?.lot_no ?? "—",
          qtyIn,
          qtyOut,
          qtyRejected,
          qtyRework: sum(group, (t) => t.qty_rework),
          balance: Math.max(qtyIn - qtyOut - qtyRejected, 0),
          lastEntryDate: group[group.length - 1].entry_date,
          entryCount: group.length,
        };
      })
      .sort((a, b) => a.lotNo.localeCompare(b.lotNo));

    // --- Size-wise ----------------------------------------------------------
    if (stage.unit_type === "PCS") {
      base.bySize = sizes.map((s) => {
        const group = stageTxns.filter((t) => t.size_code === s.size_code);
        const qtyIn = sum(group, (t) => t.qty_in);
        const qtyOut = sum(group, (t) => t.qty_out);
        const qtyRejected = sum(group, (t) => t.qty_rejected);
        // A PCS stage's own size target is what the previous stage produced in
        // that size, falling back to the ordered quantity at Cutting.
        const sizeInput = qtyIn > 0 ? qtyIn : s.quantity;
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
// Lot traceability — one lot's journey across every stage that touched it.
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
 * exists for — without it a shortage can be seen but not located. */
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
// Output summary — the final planned-vs-actual comparison.
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
  /** Packed as a percentage of ordered — the headline number. */
  overallEfficiencyPct: number | null;
  /** Ordered − packed. */
  shortfallPcs: number;
  fabricPlannedKg: number;
  fabricInhouseKg: number;
  fabricLossKg: number;
}

/** Stages worth showing in the loss analysis — planning and pass-through stages
 * would only add rows where input always equals output. */
const OUTPUT_STAGE_KEYS: string[] = [
  STAGE.rawMaterialPlanning,
  STAGE.knitting,
  STAGE.dyeing,
  STAGE.setting,
  STAGE.raising,
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
