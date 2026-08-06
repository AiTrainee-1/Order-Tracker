-- ============================================================================
-- Stage workflow redesign: replaces the 13 workflow_stages with the correct
-- garment-production stage list, adds form_type (which specialized data-entry
-- form each stage uses), adds orders.cut_quantity (the fixed PCS baseline
-- established at Cutting that every later stage compares against), and adds
-- stage_sub_items (per-material / per-sub-step planning & tracking used by
-- Raw Material Planning, Raw Material Inward, Fabric Processing, Sewing,
-- Finishing, and Packing).
--
-- IMPORTANT: this deletes existing user_assignments (their section_id points
-- at the old stage rows, which are being replaced). No stage_entries exist
-- yet in this project (0 production entries logged so far), so nothing
-- production-related is lost — but any work assignments made under the old
-- stage names must be re-created afterward against the new stage list.
-- ============================================================================

delete from public.user_assignments;
delete from public.workflow_stages;

alter table public.workflow_stages add column if not exists form_type text;

insert into public.workflow_stages (key, label, sequence_no, unit_type, typical_duration_days, form_type) values
  ('order_confirmation',    'Order Confirmation (PO)',              1,  'KG',  1, 'confirmation'),
  ('raw_material_planning', 'Raw Material Planning',                2,  'KG',  3, 'material_planning'),
  ('po_to_suppliers',       'Purchase Order to Suppliers',          3,  'KG',  3, 'simple_confirm'),
  ('raw_material_inward',   'Raw Material Inward',                  4,  'KG',  4, 'material_inward'),
  ('fabric_processing',     'Fabric Processing',                    5,  'KG',  6, 'fabric_processing'),
  ('fabric_store',          'Fabric Store',                         6,  'KG',  1, 'store_check'),
  ('pattern_marker',        'Pattern Making & Marker Planning',      7,  'KG',  2, 'simple_confirm'),
  ('cutting',               'Cutting',                              8,  'PCS', 3, 'cutting'),
  ('printing_embroidery',   'Printing / Embroidery',                9,  'PCS', 4, 'dispatch_return'),
  ('sewing',                'Sewing (Stitching)',                   10, 'PCS', 7, 'sub_steps'),
  ('washing',               'Washing',                              11, 'PCS', 3, 'dispatch_return'),
  ('finishing',             'Finishing',                            12, 'PCS', 3, 'sub_steps'),
  ('packing',               'Packing',                              13, 'PCS', 2, 'sub_steps');

alter table public.workflow_stages alter column form_type set not null;

alter table public.orders add column if not exists cut_quantity numeric;

-- ----------------------------------------------------------------------------
-- stage_sub_items: per-material / per-sub-step rows within a stage
-- (e.g. Yarn/Fabric/Trims/Accessories under Raw Material Planning, or
-- Line Feeding/Inline QC/... under Sewing).
-- ----------------------------------------------------------------------------

create table if not exists public.stage_sub_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  section_id uuid not null references public.workflow_stages(id) on delete restrict,
  item_key text not null,
  item_label text not null,
  planned_qty numeric not null default 0,
  completed_qty numeric not null default 0,
  unit_type text not null check (unit_type in ('KG', 'PCS')),
  is_completed boolean not null default false,
  notes text,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now(),
  unique (order_id, section_id, item_key)
);

create index if not exists idx_stage_sub_items_order_section
  on public.stage_sub_items (order_id, section_id);

alter table public.stage_sub_items enable row level security;

create policy "stage_sub_items_select" on public.stage_sub_items
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid()
        and ua.order_id = stage_sub_items.order_id
        and ua.section_id = stage_sub_items.section_id
    )
  );

create policy "stage_sub_items_upsert" on public.stage_sub_items
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid()
        and ua.order_id = stage_sub_items.order_id
        and ua.section_id = stage_sub_items.section_id
        and ua.can_enter_data = true
    )
  );

create policy "stage_sub_items_update" on public.stage_sub_items
  for update using (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid()
        and ua.order_id = stage_sub_items.order_id
        and ua.section_id = stage_sub_items.section_id
        and ua.can_enter_data = true
    )
  );
