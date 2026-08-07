-- ============================================================================
-- PO-first tracking + section restructure.
--
-- ⚠ THIS MIGRATION CLEARS MOVEMENT/ASSIGNMENT DATA — but NOT your orders.
-- It deletes every stage_entries, stage_sub_items, user_assignments, and
-- stage_assignments row (all four have a foreign key into workflow_stages,
-- and every workflow_stages row is being deleted and re-inserted below with
-- new ids, so nothing referencing the old ones can survive). orders and
-- purchase_orders have NO foreign key into workflow_stages, so they are left
-- completely untouched — your 4 original demo orders (and any others you've
-- added) are still there afterwards. app_users is untouched too. If you have
-- real production entries/assignments you need to keep, back them up first.
--
-- What changes:
--   1. transfer_type gains an 'others' option (a custom-named destination that
--      doesn't fit branch/unit/outside).
--   2. purchase_orders gets its own cut_quantity — Cutting now normally
--      completes per PO rather than order-wide, so each PO needs its own fixed
--      post-cut baseline (mirrors orders.cut_quantity).
--   3. workflow_stages goes from 13 stages to 15:
--        - 'printing_embroidery' relabelled "Embroidery" (no Printing in this
--          workflow).
--        - 'washing' removed — not part of this workflow.
--        - 'sewing' kept as its own stage ('stitching' — the actual garment
--          assembly step, still form_type sub_steps with the same Line
--          Feeding / Inline QC / End Line QC / Measurement Check checklist),
--          with three NEW independent stages added after it: Checking,
--          Ironing, Packing (before the existing Finishing/Packing stages).
--   4. Run scripts/seed-demo.ts afterwards to add example users/assignments
--      and mock movement through the new workflow — it adds 2 new sample
--      orders alongside your existing ones rather than replacing anything.
-- ============================================================================

-- --- 1. transfer_type: add 'others' -----------------------------------------

alter table public.stage_entries
  drop constraint if exists stage_entries_transfer_type_check;

alter table public.stage_entries
  add constraint stage_entries_transfer_type_check
  check (transfer_type in ('none', 'branch', 'unit', 'outside', 'others'));

-- --- 2. Per-PO fixed cut quantity --------------------------------------------

alter table public.purchase_orders
  add column if not exists cut_quantity numeric;

-- --- 3. Clear tables that reference workflow_stages (orders/POs untouched) --

delete from public.stage_entries;
delete from public.stage_sub_items;
delete from public.user_assignments;
delete from public.stage_assignments;
delete from public.workflow_stages;

-- --- 4. Reshape the 13-stage workflow into 15 --------------------------------

insert into public.workflow_stages (key, label, sequence_no, unit_type, typical_duration_days, form_type) values
  ('order_confirmation',    'Order Confirmation (PO)',              1,  'KG',  1, 'confirmation'),
  ('raw_material_planning', 'Raw Material Planning',                2,  'KG',  3, 'material_planning'),
  ('po_to_suppliers',       'Purchase Order to Suppliers',          3,  'KG',  3, 'simple_confirm'),
  ('raw_material_inward',   'Raw Material Inward',                  4,  'KG',  4, 'material_inward'),
  ('fabric_processing',     'Fabric Processing',                    5,  'KG',  6, 'fabric_processing'),
  ('fabric_store',          'Fabric Store',                         6,  'KG',  1, 'store_check'),
  ('pattern_marker',        'Pattern Making & Marker Planning',      7,  'KG',  2, 'simple_confirm'),
  ('cutting',               'Cutting',                              8,  'PCS', 3, 'cutting'),
  ('printing_embroidery',   'Embroidery',                           9,  'PCS', 4, 'dispatch_return'),
  ('stitching',             'Sewing (Stitching)',                   10, 'PCS', 7, 'sub_steps'),
  ('checking',              'Checking',                             11, 'PCS', 3, 'simple_confirm'),
  ('ironing',               'Ironing',                              12, 'PCS', 2, 'simple_confirm'),
  ('line_packing',          'Packing',                              13, 'PCS', 2, 'simple_confirm'),
  ('finishing',             'Finishing',                            14, 'PCS', 3, 'sub_steps'),
  ('packing',               'Packing',                              15, 'PCS', 2, 'sub_steps');
