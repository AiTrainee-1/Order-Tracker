-- ============================================================================
-- Production chain: size-wise POs, lot tracking, and a single transaction
-- ledger connecting every stage from Order Confirmation to Packing.
--
-- ⚠ THIS MIGRATION CLEARS MOVEMENT/ASSIGNMENT DATA -  but NOT your orders.
-- Same mechanic as 010: every workflow_stages row is deleted and re-inserted
-- with new ids, so the four tables holding a foreign key into it
-- (stage_entries, stage_sub_items, user_assignments, stage_assignments) must
-- be emptied first. orders, purchase_orders and app_users are untouched.
-- Re-run scripts/seed-demo.ts afterwards to repopulate example work.
--
-- WHAT CHANGES
--
-- 1. Workflow goes 15 → 20 stages. "Fabric Processing" was one stage doing
--    seven jobs; it becomes seven real stages (Knitting, Dyeing, Setting,
--    Raising, Compacting, In-House, Fabric Inspection) so each one carries its
--    own lot-wise input/output/loss. Panel Checking is new, between Cutting and
--    Embroidery. Finishing and the duplicate interim Packing are removed - 
--    the line now ends Checking → Ironing → Packing → Output.
--
-- 2. Two layers, deliberately separated:
--
--      GATING LAYER   stage_entries (unchanged) -  is a stage open, partially
--                     forwarded, or complete; who handled it; what unlocks next.
--                     src/lib/progress.ts still owns this.
--
--      QUANTITY LAYER the new tables below -  the authoritative numbers. Every
--                     row is an immutable transaction; nothing is overwritten.
--                     src/lib/chain.ts computes every stage's input/output/
--                     balance/shortage from these, lot-wise and size-wise.
--
--    Keeping them apart is what lets quantities be restated freely (a corrected
--    receipt, a late batch) without disturbing which stages are open.
--
-- 3. production_txns is one table for stages 5–20 rather than one table per
--    stage. Knitting KG, a Dyeing lot, a size-wise Cutting row and a Sewing
--    line's hourly output are all the same shape: some quantity in, some out,
--    some rejected, against a lot and/or a size. One table means the chain
--    calculation is one query and one code path, which is what actually
--    guarantees no stage drifts out of sync with its neighbours.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Clear tables referencing workflow_stages (orders / POs left alone)
-- ---------------------------------------------------------------------------

delete from public.stage_entries;
delete from public.stage_sub_items;
delete from public.user_assignments;
delete from public.stage_assignments;
delete from public.workflow_stages;

-- ---------------------------------------------------------------------------
-- 2. The 20-stage workflow
-- ---------------------------------------------------------------------------

insert into public.workflow_stages (key, label, sequence_no, unit_type, typical_duration_days, form_type) values
  ('order_confirmation',     'Order Confirmation',               1,  'PCS', 1, 'confirmation'),
  ('raw_material_planning',  'Raw Material Planning',            2,  'KG',  3, 'material_planning'),
  ('po_to_suppliers',        'Purchase Order to Suppliers',      3,  'KG',  3, 'supplier_dc'),
  ('raw_material_inward',    'Raw Material Inward',              4,  'KG',  3, 'material_inward'),
  ('knitting',               'Knitting',                         5,  'KG',  5, 'knitting'),
  ('dyeing',                 'Dyeing',                           6,  'KG',  4, 'lot_process'),
  ('setting',                'Setting',                          7,  'KG',  2, 'lot_process'),
  ('raising',                'Raising',                          8,  'KG',  2, 'lot_process'),
  ('compacting',             'Compacting',                       9,  'KG',  2, 'lot_process'),
  ('fabric_inhouse',         'In-House',                         10, 'KG',  1, 'lot_process'),
  ('fabric_inspection',      'Fabric Inspection',                11, 'KG',  2, 'lot_inspection'),
  ('fabric_store',           'Fabric Store',                     12, 'KG',  1, 'fabric_store'),
  ('pattern_marker',         'Pattern Making & Marker Planning', 13, 'KG',  2, 'simple_confirm'),
  ('cutting',                'Cutting',                          14, 'PCS', 3, 'cutting'),
  ('panel_checking',         'Panel Checking',                   15, 'PCS', 2, 'panel_check'),
  ('embroidery',             'Embroidery',                       16, 'PCS', 4, 'embroidery'),
  ('sewing',                 'Sewing (Stitching)',               17, 'PCS', 7, 'sewing'),
  ('checking',               'Checking',                         18, 'PCS', 3, 'garment_qc'),
  ('ironing',                'Ironing',                          19, 'PCS', 2, 'garment_process'),
  ('packing',                'Packing',                          20, 'PCS', 2, 'packing');

-- ---------------------------------------------------------------------------
-- 3. Size-wise PO quantities -  the base every downstream PCS figure compares to
-- ---------------------------------------------------------------------------

create table if not exists public.po_size_quantities (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  size_code text not null,
  sort_order int not null default 0,
  quantity numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (po_id, size_code)
);

create index if not exists idx_po_size_quantities_po on public.po_size_quantities (po_id);

-- ---------------------------------------------------------------------------
-- 4. Lot register
--
-- A lot is a physical batch of fabric. It is created during Knitting or Dyeing
-- and then referenced by every stage after it, all the way to Packing -  which
-- is what makes end-to-end traceability possible. po_id is nullable: a lot
-- knitted for the whole order serves all its POs, while a lot raised inside a
-- PO-scoped assignment belongs to that PO alone.
-- ---------------------------------------------------------------------------

create table if not exists public.production_lots (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  po_id uuid references public.purchase_orders(id) on delete cascade,
  lot_no text not null,
  fabric_type text,
  notes text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (order_id, lot_no)
);

create index if not exists idx_production_lots_order on public.production_lots (order_id);

-- ---------------------------------------------------------------------------
-- 5. Material requirements + their entry ledger
--
-- A requirement is one yarn count ("40s") or fabric type ("Single Jersey") with
-- a required KG. Yarn counts are user-defined, never hard-coded -  hence a row
-- per requirement rather than fixed columns.
--
-- material_entries is the ledger beneath it, and it is what stitches Raw
-- Material Planning → PO to Suppliers → Raw Material Inward together: all four
-- stages write entry rows against the SAME requirement, differing only by
-- entry_type. That is why the Inward screen can show planned / dispatched /
-- received / inward side by side without any stage re-typing another's numbers.
--
--   plan     actual production yarn/fabric plan (may exceed the requirement)
--   dc       dispatched by the supplier under a delivery challan
--   receipt  confirmed as received against that dispatch
--   inward   physically taken into store
-- ---------------------------------------------------------------------------

create table if not exists public.material_requirements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  po_id uuid references public.purchase_orders(id) on delete cascade,
  category text not null check (category in ('yarn', 'fabric')),
  name text not null,
  required_qty numeric not null default 0,
  unit text not null default 'KG' check (unit in ('KG', 'PCS')),
  supplier text,
  sort_order int not null default 0,
  is_completed boolean not null default false,
  notes text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

create index if not exists idx_material_requirements_order on public.material_requirements (order_id);

create table if not exists public.material_entries (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.material_requirements(id) on delete cascade,
  entry_type text not null check (entry_type in ('plan', 'dc', 'receipt', 'inward')),
  qty numeric not null default 0,
  entry_date date not null default current_date,
  supplier text,
  doc_no text,
  doc_date date,
  lot_ref text,
  notes text,
  entered_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

create index if not exists idx_material_entries_requirement on public.material_entries (requirement_id);

-- ---------------------------------------------------------------------------
-- 6. The universal production transaction
--
-- One row = one thing that happened at one stage. Every stage from Knitting to
-- Packing writes here and reads its predecessor's rows from here.
--
--   qty_in / qty_out   A row may carry only an input (Sewing line feed), only
--                      an output (Sewing line output), or both (a Dyeing lot
--                      that went in and came back the same day). Summing each
--                      column independently is what makes multiple entries
--                      accumulate correctly instead of overwriting.
--   txn_type           'process' for ordinary stages; 'send'/'receive' split
--                      Embroidery's dispatch from its return.
--   size_code          Null for KG stages, set from Cutting onwards.
--   ref_name           Knitting unit, embroidery vendor, or sewing line.
-- ---------------------------------------------------------------------------

create table if not exists public.production_txns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  po_id uuid references public.purchase_orders(id) on delete set null,
  section_id uuid not null references public.workflow_stages(id) on delete cascade,
  lot_id uuid references public.production_lots(id) on delete set null,
  size_code text,
  txn_type text not null default 'process' check (txn_type in ('process', 'send', 'receive')),
  unit text not null check (unit in ('KG', 'PCS')),
  qty_in numeric not null default 0,
  qty_out numeric not null default 0,
  qty_rejected numeric not null default 0,
  qty_rework numeric not null default 0,
  ref_name text,
  doc_no text,
  entry_date date not null default current_date,
  notes text,
  entered_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

create index if not exists idx_production_txns_order on public.production_txns (order_id);
create index if not exists idx_production_txns_section on public.production_txns (section_id);
create index if not exists idx_production_txns_lot on public.production_txns (lot_id);

-- ---------------------------------------------------------------------------
-- 7. Audit log
--
-- Append-only. Written by the app on every create/update so a corrected figure
-- keeps its history ("500 KG → 550 KG, because…") rather than silently
-- replacing the old one.
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  po_id uuid,
  section_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null check (action in ('create', 'update', 'delete')),
  summary text not null,
  changes jsonb,
  notes text,
  user_id uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_order on public.audit_log (order_id);
create index if not exists idx_audit_log_entity on public.audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- 8. Access helpers
--
-- Both are SECURITY DEFINER for the same reason is_admin() and
-- has_order_assignment() are: a policy that queries user_assignments from
-- inside a policy ON user_assignments re-triggers itself forever. Running as
-- the owner bypasses RLS internally and sidesteps the recursion.
-- ---------------------------------------------------------------------------

-- Can the current user SEE this order at all? Any assignment on the order, or
-- any global stage role (which applies to every order), is enough.
create or replace function public.can_view_order(p_order_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select public.is_admin()
     or exists (
       select 1 from public.user_assignments ua
       where ua.user_id = auth.uid() and ua.order_id = p_order_id
     )
     or exists (
       select 1 from public.stage_assignments sa where sa.user_id = auth.uid()
     );
$$;

-- Can the current user WRITE data for this order/PO/section? Mirrors the
-- stage_entries insert policy: an explicit per-order assignment (optionally
-- narrowed to one PO) or a global stage role, either way with can_enter_data.
create or replace function public.can_enter_section(
  p_order_id uuid,
  p_po_id uuid,
  p_section_id uuid
)
returns boolean
language sql
security definer
stable
as $$
  select public.is_admin()
     or exists (
       select 1 from public.user_assignments ua
       where ua.user_id = auth.uid()
         and ua.order_id = p_order_id
         and ua.section_id = p_section_id
         and ua.can_enter_data = true
         and (ua.po_id is null or ua.po_id = p_po_id)
     )
     or exists (
       select 1 from public.stage_assignments sa
       where sa.user_id = auth.uid()
         and sa.section_id = p_section_id
         and sa.can_enter_data = true
     );
$$;

-- Can the current user edit this order's material plan?
--
-- The yarn and fabric rows are shared by four stages (planning, purchasing,
-- inward, and the fabric processing that consumes them), so a single
-- section_id check would lock out three of the four. Instead the check is
-- "assigned with data entry to ANY of the procurement stages on this order" - 
-- which still excludes a sewing supervisor from rewriting the yarn plan.
create or replace function public.can_enter_materials(p_order_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select public.is_admin()
     or exists (
       select 1
       from public.user_assignments ua
       join public.workflow_stages ws on ws.id = ua.section_id
       where ua.user_id = auth.uid()
         and ua.order_id = p_order_id
         and ua.can_enter_data = true
         and ws.key in ('raw_material_planning', 'po_to_suppliers', 'raw_material_inward')
     )
     or exists (
       select 1
       from public.stage_assignments sa
       join public.workflow_stages ws on ws.id = sa.section_id
       where sa.user_id = auth.uid()
         and sa.can_enter_data = true
         and ws.key in ('raw_material_planning', 'po_to_suppliers', 'raw_material_inward')
     );
$$;

-- ---------------------------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.po_size_quantities   enable row level security;
alter table public.production_lots      enable row level security;
alter table public.material_requirements enable row level security;
alter table public.material_entries     enable row level security;
alter table public.production_txns      enable row level security;
alter table public.audit_log            enable row level security;

-- po_size_quantities: reference data for the whole app; admin-managed.
drop policy if exists "po_size_quantities_select" on public.po_size_quantities;
create policy "po_size_quantities_select" on public.po_size_quantities
  for select using (auth.role() = 'authenticated');
drop policy if exists "po_size_quantities_write_admin" on public.po_size_quantities;
create policy "po_size_quantities_write_admin" on public.po_size_quantities
  for all using (public.is_admin()) with check (public.is_admin());

-- production_lots: readable by anyone on the order. Any user who can enter data
-- at a lot-bearing stage may raise a lot -  Knitting and Dyeing both create them,
-- and Cutting occasionally needs to register one retrospectively.
drop policy if exists "production_lots_select" on public.production_lots;
create policy "production_lots_select" on public.production_lots
  for select using (public.can_view_order(order_id));
drop policy if exists "production_lots_insert" on public.production_lots;
create policy "production_lots_insert" on public.production_lots
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid() and ua.order_id = production_lots.order_id and ua.can_enter_data = true
    )
    or exists (
      select 1 from public.stage_assignments sa
      where sa.user_id = auth.uid() and sa.can_enter_data = true
    )
  );
drop policy if exists "production_lots_update" on public.production_lots;
create policy "production_lots_update" on public.production_lots
  for update using (public.is_admin() or created_by = auth.uid());
drop policy if exists "production_lots_delete_admin" on public.production_lots;
create policy "production_lots_delete_admin" on public.production_lots
  for delete using (public.is_admin());

-- material_requirements / material_entries: the planning + procurement chain.
-- Readable by anyone on the order (Fabric Store and Output both need the
-- planned figures), writable only by the procurement stages.
drop policy if exists "material_requirements_select" on public.material_requirements;
create policy "material_requirements_select" on public.material_requirements
  for select using (public.can_view_order(order_id));
drop policy if exists "material_requirements_write" on public.material_requirements;
create policy "material_requirements_write" on public.material_requirements
  for all using (public.can_enter_materials(order_id)) with check (public.can_enter_materials(order_id));

drop policy if exists "material_entries_select" on public.material_entries;
create policy "material_entries_select" on public.material_entries
  for select using (
    exists (
      select 1 from public.material_requirements mr
      where mr.id = material_entries.requirement_id
        and public.can_view_order(mr.order_id)
    )
  );
drop policy if exists "material_entries_write" on public.material_entries;
create policy "material_entries_write" on public.material_entries
  for all using (
    exists (
      select 1 from public.material_requirements mr
      where mr.id = material_entries.requirement_id
        and public.can_enter_materials(mr.order_id)
    )
  ) with check (
    exists (
      select 1 from public.material_requirements mr
      where mr.id = material_entries.requirement_id
        and public.can_enter_materials(mr.order_id)
    )
  );

-- production_txns: read across the whole order (the chain calculation needs
-- every stage's rows, not just your own), write only where you're assigned.
drop policy if exists "production_txns_select" on public.production_txns;
create policy "production_txns_select" on public.production_txns
  for select using (public.can_view_order(order_id));
drop policy if exists "production_txns_insert" on public.production_txns;
create policy "production_txns_insert" on public.production_txns
  for insert with check (
    entered_by = auth.uid()
    and public.can_enter_section(order_id, po_id, section_id)
  );
drop policy if exists "production_txns_update" on public.production_txns;
create policy "production_txns_update" on public.production_txns
  for update using (public.can_enter_section(order_id, po_id, section_id));
drop policy if exists "production_txns_delete_admin" on public.production_txns;
create policy "production_txns_delete_admin" on public.production_txns
  for delete using (public.is_admin());

-- audit_log: append-only by design -  insert + select, no update or delete
-- policy at all, so history cannot be rewritten even by an admin through the API.
drop policy if exists "audit_log_select" on public.audit_log;
create policy "audit_log_select" on public.audit_log
  for select using (order_id is null or public.can_view_order(order_id));
drop policy if exists "audit_log_insert" on public.audit_log;
create policy "audit_log_insert" on public.audit_log
  for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 10. Keep updated_at honest
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_material_requirements_touch on public.material_requirements;
create trigger trg_material_requirements_touch
before update on public.material_requirements
for each row execute function public.touch_updated_at();

drop trigger if exists trg_material_entries_touch on public.material_entries;
create trigger trg_material_entries_touch
before update on public.material_entries
for each row execute function public.touch_updated_at();

drop trigger if exists trg_production_txns_touch on public.production_txns;
create trigger trg_production_txns_touch
before update on public.production_txns
for each row execute function public.touch_updated_at();

-- Mirror the existing stage_entries activity trigger onto the new ledger so
-- "last active" stays accurate now that most data entry lands here.
create or replace function public.touch_user_activity_txn()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.app_users set last_activity_at = now() where id = new.entered_by;
  return new;
end;
$$;

drop trigger if exists trg_touch_user_activity_txn on public.production_txns;
create trigger trg_touch_user_activity_txn
after insert on public.production_txns
for each row execute function public.touch_user_activity_txn();

-- ---------------------------------------------------------------------------
-- 11. Backfill size quantities for existing POs
--
-- Existing POs have a total but no size split. Seed a single "TOTAL" row so
-- they remain valid and visible in the new size-wise screens; an admin can then
-- break it out into real sizes by editing the order.
-- ---------------------------------------------------------------------------

insert into public.po_size_quantities (po_id, size_code, sort_order, quantity)
select po.id, 'TOTAL', 0, po.quantity
from public.purchase_orders po
where not exists (
  select 1 from public.po_size_quantities s where s.po_id = po.id
);
