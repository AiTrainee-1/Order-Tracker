/**
 * Regression check for stage gating.
 *
 *   npm run check:gating
 *
 * Guards the rule the whole workflow depends on: "Not Complete – Move Forward"
 * must unlock the next stage even when the stage forwards no quantity. That
 * broke once -  Raw Material Planning forwards the material RECEIVED, which is
 * legitimately zero while you're still planning, so the partial state was
 * inferred as false and Purchase Order to Suppliers stayed locked. See
 * migration 012.
 *
 * No test framework: tsx is already a devDependency and these are pure
 * functions, so a plain script is enough to keep the rule honest.
 */
import { buildOrderProgress } from "../src/lib/progress";
import type { Order, StageEntry, WorkflowStage } from "../src/lib/types";

const stages: WorkflowStage[] = [
  { id: "s1", key: "order_confirmation", label: "Order Confirmation", sequence_no: 1, unit_type: "PCS", typical_duration_days: 1, form_type: "confirmation" },
  { id: "s2", key: "raw_material_planning", label: "Raw Material Planning", sequence_no: 2, unit_type: "KG", typical_duration_days: 3, form_type: "material_planning" },
  { id: "s3", key: "po_to_suppliers", label: "PO to Suppliers", sequence_no: 3, unit_type: "KG", typical_duration_days: 3, form_type: "supplier_dc" },
];

const order: Order = {
  id: "o1", io_no: "1/26", style: "TEST", description: null, color: null, fabric: null,
  image_path: null, total_qty: 1000, cut_quantity: null, delivery_date: "2026-12-01",
  created_at: "2026-01-01",
};

function entry(sectionId: string, over: Partial<StageEntry>): StageEntry {
  return {
    id: Math.random().toString(36).slice(2), order_id: "o1", po_id: "p1", section_id: sectionId,
    entry_date: "2026-06-01", unit_type: "KG", qty_received: 0, qty_completed_today: 0,
    qty_forwarded: 0, qty_shortage: 0, qty_rejected: 0, qty_returned: 0, is_external: false,
    external_unit_name: null, is_sent_outside: false, is_returned: false, is_forwarded: false,
    is_completed: false, branch: null, unit_name: null, transfer_type: "none", transfer_to: null,
    notes: null, entered_by: "u1", forwarded_to_user_id: null, created_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

const confirmed = entry("s1", { unit_type: "PCS", qty_forwarded: 1000, is_forwarded: true, is_completed: true });

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (got ${actual}, want ${expected})`);
}

console.log("\n--- A. Save Plan on Planning: no quantity, NOT forwarded ---");
{
  const p = buildOrderProgress(order, stages, [
    confirmed,
    entry("s2", { qty_received: 500, qty_forwarded: 0, is_forwarded: false }),
  ]);
  check("Planning isPartial", p.stages[1].isPartial, false);
  check("Suppliers isUnlocked", p.stages[2].isUnlocked, false);
}

console.log("\n--- B. THE BUG: Move Forward on Planning, nothing received yet ---");
{
  const p = buildOrderProgress(order, stages, [
    confirmed,
    entry("s2", { qty_received: 500, qty_forwarded: 0, is_forwarded: true }),
  ]);
  check("Planning isPartial (orange)", p.stages[1].isPartial, true);
  check("Suppliers isUnlocked", p.stages[2].isUnlocked, true);
  check("Planning balance owed", p.stages[1].qtyPending, 500);
}

console.log("\n--- C. Completed – Move Forward ---");
{
  const p = buildOrderProgress(order, stages, [
    confirmed,
    entry("s2", { qty_received: 500, qty_forwarded: 500, is_forwarded: true, is_completed: true }),
  ]);
  check("Planning isCompleted", p.stages[1].isCompleted, true);
  check("Planning isPartial", p.stages[1].isPartial, false);
  check("Suppliers isUnlocked", p.stages[2].isUnlocked, true);
}

console.log("\n--- D. Legacy row (pre-012, is_forwarded false but qty moved) ---");
{
  const p = buildOrderProgress(order, stages, [
    confirmed,
    entry("s2", { qty_received: 500, qty_forwarded: 400, is_forwarded: false }),
  ]);
  check("Planning isPartial via qty fallback", p.stages[1].isPartial, true);
  check("Suppliers isUnlocked", p.stages[2].isUnlocked, true);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
