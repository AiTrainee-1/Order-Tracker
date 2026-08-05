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
  is_monitor_only boolean not null default false,
  is_active boolean not null default true,
  last_activity_at timestamptz,
  created_at timestamptz not null default now()
);

-- The 13 main workflow headings, in pipeline order.
create table public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sequence_no int not null unique,
  unit_type text not null check (unit_type in ('KG', 'PCS')),
  typical_duration_days int not null default 3
);

-- One row per IO/No + Style + Color.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  io_no text not null,
  style text not null,
  description text,
  color text,
  fabric text,
  image_path text,
  total_qty numeric not null default 0,
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
  notes text,
  entered_by uuid not null references public.app_users(id),
  forwarded_to_user_id uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

create index idx_stage_entries_order_id on public.stage_entries (order_id);
create index idx_stage_entries_section_id on public.stage_entries (section_id);
create index idx_stage_entries_entered_by on public.stage_entries (entered_by);

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

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.app_users enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.orders enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.user_assignments enable row level security;
alter table public.stage_entries enable row level security;

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

-- user_assignments
create policy "user_assignments_select" on public.user_assignments
  for select using (public.is_admin() or user_id = auth.uid());
create policy "user_assignments_write_admin" on public.user_assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- stage_entries
create policy "stage_entries_select" on public.stage_entries
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid()
        and ua.order_id = stage_entries.order_id
        and ua.section_id = stage_entries.section_id
        and (ua.po_id is null or ua.po_id = stage_entries.po_id)
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
    )
  );
create policy "stage_entries_update_admin" on public.stage_entries
  for update using (public.is_admin());
create policy "stage_entries_delete_admin" on public.stage_entries
  for delete using (public.is_admin());

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

insert into public.workflow_stages (key, label, sequence_no, unit_type, typical_duration_days) values
  ('po',                  'Purchase Order (PO)',              1,  'KG',  1),
  ('mrp',                 'Material Requirement Planning',    2,  'KG',  2),
  ('purchase_orders',     'Purchase Orders',                  3,  'KG',  3),
  ('material_inward',     'Material Inward (GRN)',            4,  'KG',  3),
  ('fabric_inspection',   'Fabric Inspection',                5,  'KG',  2),
  ('cutting_order',       'Cutting Order',                    6,  'PCS', 3),
  ('printing_embroidery', 'Printing / Embroidery',            7,  'PCS', 4),
  ('production_order',    'Production Order',                 8,  'PCS', 2),
  ('sewing_output',       'Sewing Output Entry',               9,  'PCS', 7),
  ('quality_inspection',  'Quality Inspection',               10, 'PCS', 2),
  ('finishing',           'Finishing',                        11, 'PCS', 3),
  ('packing',             'Packing',                          12, 'PCS', 2),
  ('carton_management',   'Carton Management',                13, 'PCS', 1);

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
