/** Static per-stage configuration for the specialized data-entry forms.
 * Keyed by workflow_stages.key — these are fixed by the production workflow,
 * not admin-editable, so they live in code rather than the database. */

export interface SubItemDef {
  key: string;
  label: string;
}

/** Material/sub-step checklist items for stages whose form_type is
 * material_planning, material_inward, fabric_processing, or sub_steps. */
export const STAGE_SUB_ITEMS: Record<string, SubItemDef[]> = {
  raw_material_planning: [
    { key: "yarn", label: "Yarn" },
    { key: "fabric", label: "Fabric" },
    { key: "trims", label: "Trims" },
    { key: "accessories", label: "Accessories" },
  ],
  raw_material_inward: [
    { key: "yarn", label: "Yarn" },
    { key: "fabric", label: "Fabric" },
    { key: "trims", label: "Trims" },
    { key: "accessories", label: "Accessories" },
  ],
  fabric_processing: [
    { key: "knitting", label: "Knitting" },
    { key: "dyeing", label: "Dyeing" },
    { key: "compacting", label: "Compacting" },
    { key: "relaxing", label: "Relaxing" },
    { key: "fabric_inspection", label: "Fabric Inspection (4 Point)" },
  ],
  stitching: [
    { key: "line_feeding", label: "Line Feeding" },
    { key: "inline_qc", label: "Inline QC" },
    { key: "end_line_qc", label: "End Line QC" },
    { key: "measurement_check", label: "Measurement Check" },
  ],
  finishing: [
    { key: "thread_trimming", label: "Thread Trimming" },
    { key: "ironing", label: "Ironing" },
    { key: "spot_cleaning", label: "Spot Cleaning" },
    { key: "final_inspection", label: "Final Inspection" },
    { key: "metal_detection", label: "Metal Detection" },
  ],
  packing: [
    { key: "folding", label: "Folding" },
    { key: "poly_bag", label: "Poly Bag" },
    { key: "barcode", label: "Barcode" },
    { key: "carton_packing", label: "Carton Packing" },
    { key: "carton_qc", label: "Carton QC" },
  ],
};

/** The stage whose planned quantities Fabric Processing's sub-items measure against. */
export const FABRIC_PLANNING_ITEM_KEY = "fabric";
export const FABRIC_PLANNING_STAGE_KEY = "raw_material_planning";

export interface DispatchConfig {
  destinationLabel: string;
  showLocation: boolean;
  showExpectedReturn: boolean;
}

/** Field labels for stages whose form_type is dispatch_return. */
export const DISPATCH_CONFIG: Record<string, DispatchConfig> = {
  printing_embroidery: {
    destinationLabel: "Branch / Company",
    showLocation: true,
    showExpectedReturn: false,
  },
};
