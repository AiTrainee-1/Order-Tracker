/**
 * Plain-English job description for every production stage.
 *
 * Written for the person doing the work, not for a developer: what they're
 * accountable for, exactly which boxes they fill in, and the order to do it in.
 * The Stage Roles screen shows the summary inline and the full walkthrough
 * behind a Preview button, so an admin can see what they're handing someone
 * before they assign it.
 *
 * Keyed by workflow_stages.key. Kept beside the forms rather than in the
 * database because it describes the UI, and it has to change whenever the UI
 * does -  a database row would quietly drift out of date.
 */

export interface StageGuide {
  /** One sentence: what this person is accountable for. */
  owns: string;
  /** The fields they actually fill in. Must match the real form. */
  records: string[];
  /** What they're expected to keep accurate over time. */
  maintains: string[];
  /** Ordered walkthrough shown in the Preview. */
  steps: string[];
  /** Which stage hands them their numbers. */
  receives: string;
  /** Who they hand on to. */
  handsTo: string;
  /** The mistake people actually make here. */
  watchFor?: string;
}

/** Shown in every Preview -  the three buttons work identically everywhere, so
 * explaining them per stage would be twenty copies of the same paragraph. */
export const BUTTON_GUIDE: { label: string; detail: string }[] = [
  {
    label: "Save Plan",
    detail:
      "Saves what you've entered and stops there. Nothing is handed to the next stage. Use it whenever you're part-way through.",
  },
  {
    label: "Not Complete – Move Forward",
    detail:
      "Saves, and lets the next stage start -  but leaves this stage OPEN. It shows in orange with the balance still owed, and stays on your list until you finish it. Use it whenever work has moved on but isn't done.",
  },
  {
    label: "Completed – Move Forward",
    detail:
      "Saves, hands on, and closes this stage. Use it only when nothing more is expected here. You can still add a late entry afterwards if something turns up.",
  },
];

/** True for every stage, so it's stated once. */
export const UNIVERSAL_RULES: string[] = [
  "Never type over an old figure. Every new delivery, batch or shift is its own entry -  press “+ Add New Entry” again.",
  "To fix a genuine mistake, press Edit on that entry. You'll be asked for a reason, and the original figure is kept in the history.",
  "You don't need to finish a stage before the next one can start. “Not Complete – Move Forward” exists exactly for that.",
];

export const STAGE_GUIDE: Record<string, StageGuide> = {
  // -------------------------------------------------------------- order
  order_confirmation: {
    owns: "Checking the order and its size breakdown are right before the factory commits any material.",
    records: ["Notes for the planning team", "Your confirmation that the order is good to run"],
    maintains: ["That every PO has a real size split, not just a total quantity"],
    steps: [
      "Open the order from Data Input and pick the PO you're confirming.",
      "Check style, colour, fabric and delivery date against the buyer's sheet.",
      "Check the size table -  the quantity for each size, and the total on the right.",
      "If a PO shows only “TOTAL” with no sizes, an orange warning appears. Ask the Admin to edit the order and split it by size before confirming.",
      "Add a note if planning needs to know anything.",
      "Press “Completed – Move Forward” to release it to Raw Material Planning.",
    ],
    receives: "The order and PO sizes entered by the Admin",
    handsTo: "Raw Material Planning",
    watchFor:
      "These size quantities are the yardstick for Cutting, Panel Checking, Sewing and Packing. A mistake here repeats at every stage after it.",
  },

  // -------------------------------------------------------- procurement
  raw_material_planning: {
    owns: "Required Plan -  deciding how much yarn and fabric this order needs. Nothing about purchasing or receiving happens here.",
    records: [
      "Name -  the yarn count (40s, 30s, 20s…) or fabric type",
      "Required Quantity (KG)",
      "Reason for the Change -  required every time a quantity is added or edited, kept in the audit trail",
    ],
    maintains: ["The required KG if the plan changes -  every add or edit asks for a reason and keeps the old figure"],
    steps: [
      "Under Yarn Counts press “+ Add Yarn Count”, type the count (e.g. 40s), the KG required, and a reason.",
      "Do the same under Fabric for each fabric type.",
      "To change a quantity later, press Edit on that line, update the figure, and give a reason -  the old figure is kept in the history.",
      "Tick “Completed” on a line once its required quantity is finalised.",
      "Press “Completed – Move Forward” once every material this order needs is listed.",
    ],
    receives: "The confirmed order quantity",
    handsTo: "Purchase Order to Suppliers",
    watchFor:
      "This screen only sets what's required -  it never records a purchase or a receipt. Those numbers belong to the next two stages.",
  },

  po_to_suppliers: {
    owns: "Planned Quantity -  how much yarn is being planned against the required quantity Raw Material Planning set.",
    records: ["A Planned Quantity entry per material -  KG, plus optional supplier and DC reference"],
    maintains: ["Required vs Planned staying true for every material as purchase plans are raised"],
    steps: [
      "The Required KG for each material is already here from Raw Material Planning. Nothing to re-type.",
      "Expand a material and press “+ Record Planned”.",
      "Enter the Planned Quantity (KG), and optionally the supplier and DC number/date for reference.",
      "Add one entry per purchase plan raised -  repeat entries stay as separate rows.",
      "The Balance box shows Required minus Planned.",
      "Move forward once the store can start taking material in against what's been planned.",
    ],
    receives: "Required quantities from Raw Material Planning",
    handsTo: "Raw Material Inward",
    watchFor:
      "This stage only plans the required yarn quantity -  no dispatch, no receipt. Receiving happens on the next screen, not here.",
  },

  raw_material_inward: {
    owns: "Received Quantity -  how much physically arrived against what was planned.",
    records: ["A single Received Quantity entry for each intake of material"],
    maintains: ["Planned vs Received staying true for every material"],
    steps: [
      "The table shows Planned next to Received for every material, side by side.",
      "Expand a material, press “+ Record Received”, and enter the KG actually received with the date.",
      "Add one entry per intake -  repeat deliveries stay as separate rows.",
      "Check the Balance column: planned minus received. Anything above zero is still owed by the supplier -  the status badge reads Full, Partial or Pending.",
      "Move forward once Knitting can draw yarn -  the order forwards to Knitting exactly as it always has.",
    ],
    receives: "Planned quantities from Purchase Order to Suppliers",
    handsTo: "Knitting",
    watchFor:
      "You cannot receive more than the planned quantity for a material -  the entry is refused and the outstanding figure is named. If material genuinely arrived from outside the purchase order, tick Extra / recovered source and say why; the reason is stored on the entry.",
  },

  // ---------------------------------------------------- fabric processing
  knitting: {
    owns: "Sending yarn out to be knitted and reconciling the fabric that comes back. This stage tracks the total quantity only -  the lot number isn't raised until Dyeing.",
    records: [
      "Sending: knitting unit -  JKR, Texwell, or a new one you type in -  and quantity sent",
      "Receiving: quantity received back, and any wastage",
    ],
    maintains: ["Sent vs received staying true as fabric comes back in batches"],
    steps: [
      "In the Sending panel, press “+ Add New Entry”, pick the knitting unit -  or type a new company name, it's remembered for next time -  and enter the yarn quantity sent.",
      "When the fabric comes back, use the Receiving panel and enter the quantity received and any wastage.",
      "There is no lot to pick here -  this stage records the total quantity only. Add a separate entry for each batch sent or received.",
      "Move forward when Dyeing can start.",
    ],
    receives: "Yarn from the store",
    handsTo: "Dyeing",
    watchFor:
      "This stage no longer creates or selects lots -  that starts at Dyeing. If you're expecting to see a lot number here, it won't exist until Dyeing raises one.",
  },

  dyeing: {
    owns: "Raising the lot number each batch of fabric is tracked by from here on, sending it out for dyeing, and reconciling what comes back.",
    records: [
      "Sending: a new lot number, quantity sent, unit/party it went to",
      "Receiving: the same lot, quantity received back, rejected KG",
    ],
    maintains: ["The lot register -  every stage after this picks from the lots you create here"],
    steps: [
      "In Sending, press “+ New Lot”, type the lot number for this batch, and press Create.",
      "Enter the quantity sent and which unit or party it went to.",
      "When the dyed fabric comes back, use the Receiving panel -  pick the same lot, and enter the quantity received and anything rejected.",
      "Add a separate entry for each batch. Different lots always mean different rows.",
      "Move forward when Brushing can take the fabric.",
    ],
    receives: "Greige fabric from Knitting",
    handsTo: "Brushing",
    watchFor:
      "Lots can only be created here, at Dyeing -  every later stage picks from this register rather than starting its own. Use the lot number written on the physical fabric, not a new one.",
  },

  brushing: {
    owns: "Sending each dyed lot out to be brushed -  the fleece raised on the back of the fabric -  and reconciling what comes back.",
    records: [
      "Sending: lot, quantity sent, unit/party it went to",
      "Receiving: lot, quantity received back, rejected KG",
    ],
    maintains: ["Each lot's balance through this stage"],
    steps: [
      "There are two panels: Sending and Receiving.",
      "In Sending, press “+ Add New Entry”, pick the lot, and enter the quantity sent and where it went.",
      "The quantity available is what Dyeing returned for that lot -  you cannot send more than that without ticking the override.",
      "When the brushed fabric comes back, use the Receiving panel -  same lot, quantity received, and anything rejected.",
      "Move forward once the lot is ready for compacting.",
    ],
    receives: "Dyed fabric from Dyeing",
    handsTo: "Compacting",
    watchFor:
      "Brushing raises the pile, it does not add weight -  a lot should come back slightly lighter, never heavier. A gain means the wrong lot was picked or the same receipt was entered twice.",
  },

  compacting: {
    owns: "Sending each lot out for compacting to its final GSM and width, and reconciling what comes back.",
    records: [
      "Sending: lot, quantity sent, unit/party it went to",
      "Receiving: lot, quantity received back, rejected KG",
    ],
    maintains: ["Each lot's balance through this stage"],
    steps: [
      "There are two panels: Sending and Receiving.",
      "In Sending, press “+ Add New Entry”, pick the lot, and enter the quantity sent and where it went.",
      "When the compacted fabric comes back, use the Receiving panel -  same lot, quantity received, and anything rejected.",
      "One entry per lot in each panel.",
      "Move forward when the fabric is ready to come back in-house.",
    ],
    receives: "Brushed fabric from Brushing",
    handsTo: "In-House",
  },

  fabric_inhouse: {
    owns: "Receiving processed fabric back into the factory and recording what actually arrived, lot by lot.",
    records: ["Lot number", "Input KG (what the processor says they sent)", "Output KG (what you actually weighed in)"],
    maintains: ["Any shortfall between what left the processor and what arrived"],
    steps: [
      "Press “+ Add New Entry” and pick the lot.",
      "Enter what the processor sent and what you actually received.",
      "One entry per lot.",
      "Move forward once Inspection can start.",
    ],
    receives: "Fabric from Compacting",
    handsTo: "Fabric Inspection",
    watchFor:
      "Weigh it properly. This is the last chance to catch a shortfall in transit before it becomes the store's problem.",
  },

  fabric_inspection: {
    owns: "Four-point inspecting each lot and separating passed fabric from rejected. Only the passed quantity moves on.",
    records: ["Lot number", "Sent for Testing KG", "Passed KG", "Rejected KG", "The defect, in Notes"],
    maintains: ["Each lot's status -  Passed, Rejected or Partial -  and passed plus rejected adding up to what was sent for testing"],
    steps: [
      "Press “+ Add New Entry” and pick the lot.",
      "Enter the KG sent for testing, the KG that passed and the KG rejected.",
      "Passed + Rejected should equal Sent for Testing. Anything left over shows as an unexplained balance.",
      "Put the reason for rejection in Notes -  it isn't recorded anywhere else.",
      "Rejected fabric is marked Rejected and does not move forward -  only the passed quantity reaches the store.",
      "Move forward to release the passed fabric to the store.",
    ],
    receives: "Fabric from In-House",
    handsTo: "Fabric Store",
  },

  fabric_store: {
    owns: "Recording where each passed lot is finally stored -  a simple record, not a re-count.",
    records: ["Lot", "Stored At -  the unit or location holding it"],
    maintains: ["Which unit/location currently holds each lot"],
    steps: [
      "The final approved quantity for each lot is carried straight through from Fabric Inspection -  nothing to re-enter.",
      "Press “+ Add New Entry”, pick the lot, and record where it's stored.",
      "Move forward once Cutting has what it needs.",
    ],
    receives: "Passed fabric from Fabric Inspection",
    handsTo: "Pattern Making & Marker Planning",
  },

  pattern_marker: {
    owns: "Having the pattern and marker ready so Cutting can lay the fabric.",
    records: ["A tick confirming the marker is ready", "Notes -  marker ratio and efficiency"],
    maintains: ["Nothing is consumed here -  the fabric passes straight through to Cutting"],
    steps: [
      "Check the fabric in store and the pieces to cut, size by size, in the panel at the top.",
      "Plan the marker against that size ratio.",
      "Tick “Pattern / marker is ready”.",
      "Add a note with the ratio and efficiency for the record.",
      "Move forward to release Cutting.",
    ],
    receives: "Fabric and the size breakdown",
    handsTo: "Cutting",
  },

  // ------------------------------------------------------------- garment
  cutting: {
    owns: "Cutting fabric into panels and counting them size by size -  no lot to pick. This is where KG becomes PCS.",
    records: ["Vendor Name, DC Name and Date", "Pieces cut for each size in one table"],
    maintains: ["Cut quantity per size against the PO's ordered quantity"],
    steps: [
      "Enter the vendor name, DC name and date for this lay.",
      "A size table appears showing the PO quantity, what's already done, and a box for this entry.",
      "Type the pieces cut for each size. “Balance after” updates as you type.",
      "Press “Save Plan” to record the lay without moving on, or a Move Forward button to record and hand off in one step.",
      "Add a fresh entry for the next lay -  every entry accumulates, nothing is overwritten.",
    ],
    receives: "Fabric issued by the store",
    handsTo: "Panel Checking",
    watchFor:
      "If “Balance after” goes negative you've cut more than the PO ordered for that size. Check before saving. There's no lot recorded here any more, so a shortfall can only be traced to a size, not to a specific fabric roll.",
  },

  panel_checking: {
    owns: "Checking cut panels before they reach the sewing line -  no lot to pick.",
    records: [
      "Vendor Name, DC Name and Date",
      "Checked / Accepted / Rejected / Rework pieces per size, in one table",
      "The rejection reason, in Notes",
    ],
    maintains: ["Accepted plus rejected adding up to what was checked, per size"],
    steps: [
      "Enter the vendor name, DC name and date for this entry.",
      "Enter how many were checked, accepted, rejected and sent for rework, size by size in the same table.",
      "Put the reason for rejection in Notes -  it's the only place it's recorded.",
      "Move forward when the accepted panels can go on.",
    ],
    receives: "Cut panels from Cutting",
    handsTo: "Embroidery",
    watchFor:
      "There's no lot recorded here any more -  a size's ceiling is what Cutting produced for it, not a specific fabric roll's cut quantity.",
  },

  embroidery: {
    owns: "Sending panels out for embroidery and reconciling what comes back -  vendor, DC and a size-wise quantity table for each movement. No lot to pick.",
    records: [
      "Sending: Vendor Name, DC Name, Date, and pieces sent for every size in one table",
      "Receiving: Vendor Name, DC Name, Date, and pieces received for every size in one table",
    ],
    maintains: ["The “With Vendor” figure -  everything sent that hasn't come back yet", "Per-size Cut Qty -  the same reference Cutting itself measures against"],
    steps: [
      "There are two panels: blue for Sending, green for Receiving.",
      "In Sending, enter the vendor name and DC name, then type the pieces sent for each size in the table -  all sizes in one entry.",
      "When goods come back, use the Receiving panel the same way -  vendor, DC, then pieces received per size.",
      "The boxes at the top show Sent, Received back and With Vendor.",
      "Use “Not Complete – Move Forward” to let Sewing start while some pieces are still with the vendor.",
    ],
    receives: "Accepted panels from Panel Checking",
    handsTo: "Sewing",
    watchFor:
      "Record the dispatch even if the return is weeks away. Otherwise nobody knows the goods left the building. There's no lot here any more, so a shortfall shows up per size, not per batch.",
  },

  sewing: {
    owns: "Feeding the sewing lines and recording what they produce -  line name, DC and a size-wise quantity table. No lot to pick.",
    records: ["Line Name -  the line or unit that did the work", "DC Name", "Date", "Pieces produced for every size in one table"],
    maintains: ["Per-size Cut Qty -  the same reference Cutting itself measures against"],
    steps: [
      "Enter the line name, DC name and date once for the entry.",
      "Type the pieces produced for each size in the table -  all sizes together, the same way Cutting works.",
      "“Balance after” updates per size as you type. Add a fresh entry for the next batch.",
      "Move forward when Checking can start.",
    ],
    receives: "Panels back from Embroidery",
    handsTo: "Checking",
    watchFor:
      "There's no lot or rejected/rework field here any more -  just line name, DC and the size table. If a batch includes rejects, enter only what's actually moving forward.",
  },

  checking: {
    owns: "Final garment inspection after sewing -  vendor, DC and a size-wise quantity table of what's accepted. No lot to pick.",
    records: ["Vendor Name", "DC Name", "Date", "Pieces checked and accepted for every size in one table"],
    maintains: ["Per-size Cut Qty -  the same reference Cutting itself measures against"],
    steps: [
      "Enter the vendor name, DC name and date once for the entry.",
      "Type the pieces accepted for each size in the table -  all sizes in one entry.",
      "Add a fresh entry for each batch.",
      "Move forward when the accepted garments can be pressed.",
    ],
    receives: "Sewn garments from Sewing",
    handsTo: "Ironing",
    watchFor:
      "There's no lot or rejected field here any more -  just the accepted quantity per size. Anything failed simply isn't included in the figures you enter.",
  },

  ironing: {
    owns: "Pressing the accepted garments -  vendor, DC and a size-wise quantity table. No lot to pick.",
    records: ["Vendor Name", "DC Name", "Date", "Pieces pressed for every size in one table"],
    maintains: ["Per-size Cut Qty -  the same reference Cutting itself measures against"],
    steps: [
      "Enter the vendor name, DC name and date once for the entry.",
      "Type the pieces pressed for each size in the table -  all sizes in one entry.",
      "Add a fresh entry for each batch.",
      "Move forward when Packing can start.",
    ],
    receives: "Accepted garments from Checking",
    handsTo: "Packing",
  },

  packing: {
    owns: "Packing the finished garments -  the figure the whole order is finally judged against. Vendor, DC and a size-wise quantity table. No lot to pick.",
    records: ["Vendor Name", "DC Name", "Date", "Pieces packed for every size in one table"],
    maintains: ["The final packed quantity against the order -  see “Against the order” below the form", "Per-size Cut Qty -  the same reference Cutting itself measures against"],
    steps: [
      "Enter the vendor name, DC name and date once for the entry.",
      "Type the pieces packed for each size in the table -  all sizes in one entry.",
      "Check the “Against the order” panel: ordered, packed, and how many are short.",
      "When the order is finished press “Completed – Move Forward”.",
    ],
    receives: "Pressed garments from Ironing",
    handsTo: "the Output report -  ordered against packed, size by size, and where every piece went",
    watchFor:
      "Check the “Against the order” panel before completing. Once packed, a shortfall against the buyer's quantity is what everyone will be asked about.",
  },
};

export function guideFor(stageKey: string): StageGuide | null {
  return STAGE_GUIDE[stageKey] ?? null;
}
