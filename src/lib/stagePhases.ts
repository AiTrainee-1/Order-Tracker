import { STAGE } from "./chain";

/**
 * The three phases of the production line, used to group long stage lists.
 *
 * Eighteen stages in one flat list is hard to navigate: the names alone don't
 * tell you whether you're looking at procurement, fabric or garment work. The
 * phase rail does, without anyone reading a label.
 *
 * Colour here is NAVIGATIONAL -  it says where in the line a stage sits. It is
 * deliberately not a status: status is carried separately on each page (amber
 * for "nobody assigned" on Stage Roles, for instance), and the data-entry forms
 * keep their own conventions (blue/green for send/receive, indigo/teal for
 * yarn/fabric). These phase colours only ever appear on admin list pages, so
 * they never sit next to those.
 */

export type PhaseKey = "procurement" | "fabric" | "garment";

export interface StagePhase {
  key: PhaseKey;
  label: string;
  hint: string;
  initial: string;
  rail: string;
  band: string;
  chip: string;
  text: string;
}

export const PHASES: StagePhase[] = [
  {
    key: "procurement",
    label: "Order & Procurement",
    hint: "Confirming the order and getting yarn into the store.",
    initial: "1",
    rail: "border-l-cyan-500",
    band: "bg-cyan-50/70",
    chip: "bg-cyan-600",
    text: "text-cyan-900",
  },
  {
    key: "fabric",
    label: "Fabric Production",
    hint: "Knitting through to the fabric store -  measured in kilograms, tracked by lot.",
    initial: "2",
    rail: "border-l-blue-500",
    band: "bg-blue-50/70",
    chip: "bg-blue-600",
    text: "text-blue-900",
  },
  {
    key: "garment",
    label: "Garment Production",
    hint: "Cutting onwards -  measured in pieces, tracked by lot and size.",
    initial: "3",
    rail: "border-l-emerald-500",
    band: "bg-emerald-50/70",
    chip: "bg-emerald-600",
    text: "text-emerald-900",
  },
];

const PROCUREMENT_KEYS: string[] = [
  STAGE.orderConfirmation,
  STAGE.rawMaterialPlanning,
  STAGE.poToSuppliers,
  STAGE.rawMaterialInward,
];

const FABRIC_KEYS: string[] = [
  STAGE.knitting,
  STAGE.dyeing,
  STAGE.brushing,
  STAGE.compacting,
  STAGE.fabricInhouse,
  STAGE.fabricInspection,
  STAGE.fabricStore,
  STAGE.patternMarker,
];

/** Anything unrecognised falls into garment rather than vanishing, so a stage
 * added later still shows up on every page that groups by phase. */
export function phaseOf(stageKey: string): PhaseKey {
  if (PROCUREMENT_KEYS.includes(stageKey)) return "procurement";
  if (FABRIC_KEYS.includes(stageKey)) return "fabric";
  return "garment";
}
