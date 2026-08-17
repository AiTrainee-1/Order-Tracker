import { STAGE } from "./chain";

/**
 * What each stage calls its quantities.
 *
 * "In" and "Out" are the engine's names for the two quantity columns, but they
 * are not what the floor calls them: Knitting sends and receives, Fabric
 * Inspection tests and passes, Sewing feeds a line and takes output off it.
 * Showing the engine's names on screen is how the admin tables ended up
 * labelling a Knitting row "In / Out" when it means "Sent / Received".
 *
 * Both sides read this one map -  the data-entry forms build their
 * LedgerConfig from it, and the admin/MD tracking tables label their columns
 * from it -  so a stage's vocabulary can never drift between where it's typed
 * and where it's read.
 *
 * Keyed by workflow_stages.key.
 */

export interface StageQtyLabels {
  /** qty_in -  what arrived, was issued, or was sent out. */
  in: string;
  /** qty_out -  what moved on to the next stage. */
  out: string;
  /** qty_rejected -  permanently lost, never returns to the flow. */
  rejected: string;
  /** qty_rework -  held back for repair. `false` where the stage has no rework
   * step, matching LedgerConfig's convention that false hides the column. */
  rework: string | false;
  /** Whatever is still owed here. */
  balance: string;
}

const DEFAULT_LABELS: StageQtyLabels = {
  in: "In",
  out: "Out",
  rejected: "Rejected",
  rework: false,
  balance: "Balance",
};

const LABELS: Record<string, StageQtyLabels> = {
  // --- Fabric, KG. All three are round trips to an outside unit. -----------
  [STAGE.knitting]: {
    in: "Sent",
    out: "Received",
    rejected: "Wastage",
    rework: false,
    balance: "With Knitter",
  },
  [STAGE.dyeing]: {
    in: "Sent",
    out: "Received",
    rejected: "Reject",
    rework: false,
    balance: "With Dyer",
  },
  [STAGE.compacting]: {
    in: "Sent",
    out: "Received",
    rejected: "Reject",
    rework: false,
    balance: "With Compactor",
  },
  [STAGE.fabricInhouse]: {
    in: "Sent by Processor",
    out: "Received",
    rejected: "Reject",
    rework: false,
    balance: "Short in Transit",
  },
  [STAGE.fabricInspection]: {
    in: "Sent for Testing",
    out: "Passed",
    rejected: "Rejected",
    rework: false,
    balance: "Untested",
  },
  [STAGE.fabricStore]: {
    in: "Received",
    out: "Final Approved Qty",
    rejected: "Reject",
    rework: false,
    balance: "Unaccounted",
  },

  // --- Garment, PCS -------------------------------------------------------
  [STAGE.cutting]: {
    in: "Fabric Issued",
    out: "Cut",
    rejected: "Wastage",
    rework: false,
    balance: "Left to Cut",
  },
  [STAGE.panelChecking]: {
    in: "Checked",
    out: "Accepted",
    rejected: "Rejected",
    rework: "Rework",
    balance: "Left to Check",
  },
  [STAGE.embroidery]: {
    in: "Sent",
    out: "Received",
    rejected: "Rejected",
    rework: false,
    balance: "With Vendor",
  },
  [STAGE.sewing]: {
    in: "Line Input",
    out: "Line Output",
    rejected: "Rejected",
    rework: "Rework",
    balance: "On the Line",
  },
  [STAGE.checking]: {
    in: "Checked",
    out: "Accepted",
    rejected: "Rejected",
    rework: "Rework",
    balance: "Left to Check",
  },
  [STAGE.ironing]: {
    in: "Input",
    out: "Pressed",
    rejected: "Damaged",
    rework: false,
    balance: "Left to Press",
  },
  [STAGE.packing]: {
    in: "Input",
    out: "Packed",
    rejected: "Damaged",
    rework: false,
    balance: "Left to Pack",
  },
};

export function stageQtyLabels(stageKey: string | undefined): StageQtyLabels {
  return (stageKey && LABELS[stageKey]) || DEFAULT_LABELS;
}
