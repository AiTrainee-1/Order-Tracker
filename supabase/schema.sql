-- ============================================================================
-- UK Textiles — Garment Order Tracking Application
-- Full schema: tables, RLS policies, storage bucket, seed data.
-- Run this once in the Supabase SQL editor on a fresh project.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- Mirrors auth.users with the extra fields this app needs. password_plain is a
-- deliberate trade-off: real sign-in security comes from Supabase Auth (hashed),
-- this column only exists so the Admin can view a user's password as requested.
create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text not null unique,
  password_plain text not null,
  role text not null default 'user',
  phone text,
  is_monitor_only boolean not null default false,
  is_active boolean not null default true,
  last_activity_at timestamptz,
  created_at timestamptz not null default now()
);

-- The 13 main workflow stages, in pipeline order. form_type selects which
-- specialized data-entry form the User Panel renders for that stage.
create table public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sequence_no int not null unique,
  unit_type text not null check (unit_type in ('KG', 'PCS')),
  typical_duration_days int not null default 3,
  form_type text not null
);

-- One row per IO/No + Style + Color. cut_quantity is the fixed PCS baseline
-- established when Cutting is completed — every stage after Cutting compares
-- its own completed quantity against this fixed number (shortage/surplus).
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  io_no text not null,
  style text not null,
  description text,
  color text,
  fabric text,
  image_path text,
  total_qty numeric not null default 0,
  cut_quantity numeric,
  delivery_date date,
  created_at timestamptz not null default now()
);

create index idx_orders_io_no on public.orders (io_no);

-- Sub-batches of an order, each with its own quantity + delivery date.
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  po_number text not null,
  quantity numeric not null default 0,
  -- Fixed PCS baseline for THIS PO, set when Cutting completes for a
  -- PO-scoped assignment — mirrors orders.cut_quantity but per PO.
  cut_quantity numeric,
  delivery_date date,
  created_at timestamptz not null default now()
);

create index idx_purchase_orders_order_id on public.purchase_orders (order_id);

-- Which user is assigned to which order/PO/section, and whether they can
-- enter data or only monitor.
create table public.user_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  po_id uuid references public.purchase_orders(id) on delete cascade,
  section_id uuid not null references public.workflow_stages(id) on delete cascade,
  unit_name text,
  can_enter_data boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, order_id, po_id, section_id, unit_name)
);

create index idx_user_assignments_user_id on public.user_assignments (user_id);
create index idx_user_assignments_order_id on public.user_assignments (order_id);

-- The core production movement log. One row per data-entry submission.
create table public.stage_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  po_id uuid references public.purchase_orders(id) on delete set null,
  section_id uuid not null references public.workflow_stages(id) on delete restrict,
  entry_date date not null default current_date,
  unit_type text not null check (unit_type in ('KG', 'PCS')),
  qty_received numeric not null default 0,
  qty_completed_today numeric not null default 0,
  qty_forwarded numeric not null default 0,
  qty_shortage numeric not null default 0,
  qty_rejected numeric not null default 0,
  qty_returned numeric not null default 0,
  is_external boolean not null default false,
  external_unit_name text,
  is_sent_outside boolean not null default false,
  is_returned boolean not null default false,
  is_completed boolean not null default false,
  branch text,
  unit_name text,
  -- Whether this movement transferred goods elsewhere, and where.
  -- 'none' | 'branch' | 'unit' | 'outside'; transfer_to holds the destination.
  transfer_type text not null default 'none' check (transfer_type in ('none', 'branch', 'unit', 'outside', 'others')),
  transfer_to text,
  notes text,
  entered_by uuid not null references public.app_users(id),
  forwarded_to_user_id uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

create index idx_stage_entries_order_id on public.stage_entries (order_id);
create index idx_stage_entries_section_id on public.stage_entries (section_id);
create index idx_stage_entries_entered_by on public.stage_entries (entered_by);

-- Per-material / per-sub-step rows within a stage (e.g. Yarn/Fabric/Trims/
-- Accessories under Raw Material Planning, or Line Feeding/Inline QC/... under
-- Sewing). Distinct from stage_entries: this is the planning/checklist layer,
-- stage_entries remains the movement/forwarding log.
create table public.stage_sub_items (
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

create index idx_stage_sub_items_order_section on public.stage_sub_items (order_id, section_id);

-- Global stage-role defaults: one row = "this user is the default assignee for
-- this stage across every order". The app expands each row into an implicit
-- assignment on all orders, so admins don't have to scope users order-by-order.
create table public.stage_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  section_id uuid not null references public.workflow_stages(id) on delete cascade,
  can_enter_data boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, section_id)
);

create index idx_stage_assignments_section on public.stage_assignments (section_id);
create index idx_stage_assignments_user on public.stage_assignments (user_id);

-- ----------------------------------------------------------------------------
-- Helper function + activity trigger
-- ----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;

create or replace function public.touch_user_activity()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.app_users set last_activity_at = now() where id = new.entered_by;
  return new;
end;
$$;

create trigger trg_touch_user_activity
after insert on public.stage_entries
for each row execute function public.touch_user_activity();

-- Safe, narrow lookup: any authenticated user can resolve a set of user ids to
-- just their name + phone (never username/password_plain/role) — used to show
-- who handled an earlier/later stage of an order for handoff purposes.
create or replace function public.get_user_contacts(p_user_ids uuid[])
returns table (id uuid, name text, phone text)
language sql
security definer
stable
as $$
  select id, name, phone from public.app_users where id = any(p_user_ids);
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.app_users enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.orders enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.user_assignments enable row level security;
alter table public.stage_entries enable row level security;
alter table public.stage_sub_items enable row level security;
alter table public.stage_assignments enable row level security;

-- app_users
create policy "app_users_select" on public.app_users
  for select using (auth.uid() = id or public.is_admin());
create policy "app_users_insert_admin" on public.app_users
  for insert with check (public.is_admin());
create policy "app_users_update_admin_or_self" on public.app_users
  for update using (public.is_admin() or auth.uid() = id);
create policy "app_users_delete_admin" on public.app_users
  for delete using (public.is_admin());

-- workflow_stages: reference data, readable by anyone signed in, admin-managed
create policy "workflow_stages_select" on public.workflow_stages
  for select using (auth.role() = 'authenticated');
create policy "workflow_stages_write_admin" on public.workflow_stages
  for all using (public.is_admin()) with check (public.is_admin());

-- orders
create policy "orders_select" on public.orders
  for select using (auth.role() = 'authenticated');
create policy "orders_write_admin" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

-- purchase_orders
create policy "purchase_orders_select" on public.purchase_orders
  for select using (auth.role() = 'authenticated');
create policy "purchase_orders_write_admin" on public.purchase_orders
  for all using (public.is_admin()) with check (public.is_admin());

-- has_order_assignment must go through a SECURITY DEFINER function rather
-- than a plain subquery on user_assignments — a policy that queries its own
-- table directly makes Postgres re-evaluate that same policy for the
-- subquery's rows, forever ("infinite recursion detected in policy for
-- relation user_assignments"). The function body runs as its owner and so
-- bypasses RLS instead of re-triggering it (same trick as public.is_admin()).
create or replace function public.has_order_assignment(p_order_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.user_assignments
    where user_id = auth.uid() and order_id = p_order_id
  );
$$;

-- user_assignments: visible if it's your own row, or you have any assignment
-- on the same order (so you can see who else is handling other stages of it).
create policy "user_assignments_select" on public.user_assignments
  for select using (
    public.is_admin()
    or user_id = auth.uid()
    or public.has_order_assignment(order_id)
  );
create policy "user_assignments_write_admin" on public.user_assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- stage_entries: readable by anyone with ANY assignment on the order (not just
-- their own section) — the order-progress/current-stage calculation needs to
-- see every stage's history, and users need to see who ran earlier stages.
-- A global stage-role default (stage_assignments) counts as an assignment on
-- every order for that section, same as an explicit user_assignments row.
-- Writing remains restricted to your own assigned, enterable section below.
create policy "stage_entries_select" on public.stage_entries
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid() and ua.order_id = stage_entries.order_id
    )
    or exists (
      select 1 from public.stage_assignments sa
      where sa.user_id = auth.uid() and sa.section_id = stage_entries.section_id
    )
  );
create policy "stage_entries_insert" on public.stage_entries
  for insert with check (
    entered_by = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.user_assignments ua
        where ua.user_id = auth.uid()
          and ua.order_id = stage_entries.order_id
          and ua.section_id = stage_entries.section_id
          and ua.can_enter_data = true
          and (ua.po_id is null or ua.po_id = stage_entries.po_id)
      )
      or exists (
        select 1 from public.stage_assignments sa
        where sa.user_id = auth.uid()
          and sa.section_id = stage_entries.section_id
          and sa.can_enter_data = true
      )
    )
  );
create policy "stage_entries_update_admin" on public.stage_entries
  for update using (public.is_admin());
create policy "stage_entries_delete_admin" on public.stage_entries
  for delete using (public.is_admin());

-- stage_sub_items — same global stage-role default fallback as stage_entries.
create policy "stage_sub_items_select" on public.stage_sub_items
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid()
        and ua.order_id = stage_sub_items.order_id
        and ua.section_id = stage_sub_items.section_id
    )
    or exists (
      select 1 from public.stage_assignments sa
      where sa.user_id = auth.uid() and sa.section_id = stage_sub_items.section_id
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
    or exists (
      select 1 from public.stage_assignments sa
      where sa.user_id = auth.uid() and sa.section_id = stage_sub_items.section_id and sa.can_enter_data = true
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
    or exists (
      select 1 from public.stage_assignments sa
      where sa.user_id = auth.uid() and sa.section_id = stage_sub_items.section_id and sa.can_enter_data = true
    )
  );

-- stage_assignments: global stage-role defaults. Readable by any signed-in user
-- (needed to build work lists + show handoff contacts); admin-managed writes.
create policy "stage_assignments_select" on public.stage_assignments
  for select using (auth.role() = 'authenticated');
create policy "stage_assignments_write_admin" on public.stage_assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Storage: garment images
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('order-images', 'order-images', true)
on conflict (id) do nothing;

create policy "order_images_public_read" on storage.objects
  for select using (bucket_id = 'order-images');
create policy "order_images_admin_write" on storage.objects
  for insert with check (bucket_id = 'order-images' and public.is_admin());
create policy "order_images_admin_update" on storage.objects
  for update using (bucket_id = 'order-images' and public.is_admin());
create policy "order_images_admin_delete" on storage.objects
  for delete using (bucket_id = 'order-images' and public.is_admin());

-- ----------------------------------------------------------------------------
-- Seed data: workflow stages
-- ----------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------
-- Seed data: 4 orders (MCKENZIE / JD SPORTS sheet, ref MER6) + their POs
-- ----------------------------------------------------------------------------

with o1 as (
  insert into public.orders (io_no, style, description, color, fabric, total_qty, delivery_date)
  values ('90/26', 'MCKTM 17406-007', 'NACTON OPN HM PNT BLK-BL', 'BLACK',
          'Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM', 28943, '2026-09-14')
  returning id
), o2 as (
  insert into public.orders (io_no, style, description, color, fabric, total_qty, delivery_date)
  values ('90/26', 'MCKTM 17406-150', 'NACTON OPN HM PNT BLU-SW', 'STROMMY WEATHER',
          'Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM', 26266, '2026-09-14')
  returning id
), o3 as (
  insert into public.orders (io_no, style, description, color, fabric, total_qty, delivery_date)
  values ('89/26', 'MCKTM 17410-150', 'NACTON OH HD BLU-SWTH', 'STROMMY WEATHER',
          'Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM', 25441, '2026-09-14')
  returning id
), o4 as (
  insert into public.orders (io_no, style, description, color, fabric, total_qty, delivery_date)
  values ('88/26', 'MCKTM 17405-007', 'NACTON FZ HD BLK-BLK', 'BLACK',
          'Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM', 27606, '2026-09-14')
  returning id
)
insert into public.purchase_orders (order_id, po_number, quantity, delivery_date)
select id, po_number, quantity, delivery_date::date from (
  select (select id from o1) as id, '01669678' as po_number, 12359 as quantity, '2026-08-27' as delivery_date
  union all select (select id from o1), '01669676', 1339, '2026-08-27'
  union all select (select id from o1), '01669679', 8240, '2026-09-04'
  union all select (select id from o1), '01669680', 6181, '2026-09-14'
  union all select (select id from o1), '01669677', 824,  '2026-09-14'

  union all select (select id from o2), '01669688', 11845, '2026-08-27'
  union all select (select id from o2), '01669686', 1236,  '2026-08-27'
  union all select (select id from o2), '01669689', 7211,  '2026-09-04'
  union all select (select id from o2), '01669690', 5150,  '2026-09-14'
  union all select (select id from o2), '01669687', 824,   '2026-09-14'

  union all select (select id from o3), '01669693', 11330, '2026-08-27'
  union all select (select id from o3), '01669691', 1132,  '2026-08-27'
  union all select (select id from o3), '01669694', 7210,  '2026-09-04'
  union all select (select id from o3), '01669695', 4996,  '2026-09-14'
  union all select (select id from o3), '01669692', 773,   '2026-09-14'

  union all select (select id from o4), '01669683', 12361, '2026-08-27'
  union all select (select id from o4), '01669681', 1236,  '2026-08-27'
  union all select (select id from o4), '01669684', 8239,  '2026-09-04'
  union all select (select id from o4), '01669685', 5048,  '2026-09-14'
  union all select (select id from o4), '01669682', 722,   '2026-09-14'
) as po_rows;

-- NOTE: the default Admin account (app_users + its Supabase Auth user) is
-- deliberately NOT seeded here — app_users.id has a foreign key into
-- auth.users, which can only be populated via the Supabase Auth API.
-- Run `npm run seed:admin` once (see scripts/seed-admin.ts) after this file.
